import "dotenv/config";
import axios from "axios";
import { ethers } from "ethers";

const X402_BASE = (process.env.X402_BASE || "http://localhost:4000").replace(/\/$/, "");
const RPC_URL = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`❌ Missing ${name} in .env`);
  return v.trim();
}

// Minimal ABI needed
const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
];

type PaymentRequirements = {
  scheme: "exact";
  network: "cronos-testnet" | "cronos";
  payTo: string;
  asset: string;
  description?: string;
  mimeType?: string;
  maxAmountRequired: string;
  maxTimeoutSeconds: number;
};

// ethers v6 helper: pad to bytes32
function toBytes32(hex: string): string {
  // expects 0x-prefixed hex
  return ethers.hexlify(ethers.zeroPadValue(hex, 32));
}

function lastByte(hex: string): string {
  const b = ethers.getBytes(hex);
  const last = b[b.length - 1];
  return "0x" + last.toString(16).padStart(2, "0");
}

async function createXPaymentHeaderEIP3009Exact(wallet: ethers.Wallet, reqs: PaymentRequirements) {
  const { payTo, asset, maxAmountRequired, maxTimeoutSeconds, scheme, network } = reqs;

  const from = await wallet.getAddress();
  const to = ethers.getAddress(payTo);
  const value = BigInt(maxAmountRequired);

  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + (maxTimeoutSeconds || 300));

  // bytes32 nonce
  const nonce = toBytes32(ethers.hexlify(ethers.randomBytes(32)));

  // Read on-chain DOMAIN_SEPARATOR
  const token = new ethers.Contract(asset, TOKEN_ABI, wallet.provider);
  const domainSeparator: string = await token.DOMAIN_SEPARATOR();

  // Typehash
  const TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
  );

  const abi = ethers.AbiCoder.defaultAbiCoder();

  const structEncoded = abi.encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [TYPEHASH, from, to, value, validAfter, validBefore, nonce]
  );

  const structHash = ethers.keccak256(structEncoded);

  // EIP-712 digest = keccak256("\x19\x01" || domainSeparator || structHash)
  const digest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      ethers.getBytes(domainSeparator),
      ethers.getBytes(structHash),
    ])
  );

  // Sign digest and FORCE v=27/28
  const rawSig = wallet.signingKey.sign(digest); // { r, s, yParity }
  const v27 = 27 + rawSig.yParity;

  const forcedSig = ethers.Signature.from({
    r: rawSig.r,
    s: rawSig.s,
    v: v27,
  }).serialized; // 65 bytes, v should be 0x1b or 0x1c

  // Debug (safe)
  console.log("🧩 DOMAIN_SEPARATOR():", domainSeparator);
  console.log("🧩 digest:", digest);
  console.log("🧩 signature v byte:", lastByte(forcedSig), "(expect 0x1b/0x1c)");

  const headerObj = {
    x402Version: 1,
    scheme,
    network,
    payload: {
      from,
      to,
      value: value.toString(),
      validAfter: Number(validAfter),
      validBefore: Number(validBefore),
      nonce,                 // bytes32
      signature: forcedSig,  // bytes
      asset,
    },
  };

  return Buffer.from(JSON.stringify(headerObj)).toString("base64");
}

async function main() {
  const PRIVATE_KEY = requireEnv("MAINTAINER_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`🔌 Payer Wallet: ${wallet.address}`);
  console.log(`🌐 RPC: ${RPC_URL}`);
  console.log(`🏦 X402 Service: ${X402_BASE}`);

  // --- CONFIG ---
  const owner = "souvik0908";
  const repo = "gitpay";
  const issueNumber = 2;
  const amountBaseUnits = "1000000";
  // -------------

  console.log("\n1️⃣ Requesting fund intent...");
  const intent = await axios.post(
    `${X402_BASE}/bounties/fund-intent`,
    { owner, repo, issueNumber, amountBaseUnits },
    { validateStatus: (s) => s === 402 || s === 200 }
  );

  if (intent.status !== 402) {
    console.error("❌ Expected 402 but got:", intent.status, intent.data);
    return;
  }

  const reqs: PaymentRequirements = intent.data.paymentRequirements;

  console.log("✅ Requirements received:");
  console.log("   network:", reqs.network);
  console.log("   payTo:  ", reqs.payTo);
  console.log("   asset:  ", reqs.asset);
  console.log("   amount: ", reqs.maxAmountRequired);

  // Balance + token info
  const token = new ethers.Contract(reqs.asset, TOKEN_ABI, provider);
  const decimals: number = await token.decimals();
  const bal: bigint = await token.balanceOf(wallet.address);
  const name: string = await token.name();

  console.log(`🪙 Token: ${name}`);
  console.log(`💰 Token Balance: ${ethers.formatUnits(bal, decimals)} (decimals=${decimals})`);

  console.log("\n2️⃣ Creating X-PAYMENT header (DOMAIN_SEPARATOR + forced v=27/28)...");
  const paymentHeader = await createXPaymentHeaderEIP3009Exact(wallet, reqs);
  console.log("✍️ Payment header generated.");

  console.log("\n3️⃣ Submitting /bounties/fund ...");
  const funded = await axios.post(
    `${X402_BASE}/bounties/fund`,
    { owner, repo, issueNumber, amountBaseUnits, paymentHeader },
    { validateStatus: () => true }
  );

  if (funded.status !== 200) {
    console.error("\n❌ Funding failed:");
    console.error("Status:", funded.status);
    console.error("Body:", JSON.stringify(funded.data, null, 2));
    return;
  }

  console.log("\n🎉 SUCCESS!");
  console.log(JSON.stringify(funded.data, null, 2));

  const tx = funded.data?.funded?.fundedTxHash;
  if (tx) console.log(`🔗 Explorer: https://explorer.cronos.org/testnet/tx/${tx}`);
}

main().catch((e) => {
  console.error("\n❌ Fatal error:", e?.response?.data || e?.message || e);
  process.exit(1);
});
