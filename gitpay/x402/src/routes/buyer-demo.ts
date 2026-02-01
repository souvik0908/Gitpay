import { Router } from "express"
import axios from "axios"
import { ethers } from "ethers"

const router = Router()

const RPC_URL = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org"
const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
]

type PaymentRequirements = {
  scheme: "exact"
  network: "cronos-testnet" | "cronos"
  payTo: string
  asset: string
  maxAmountRequired: string
  maxTimeoutSeconds: number
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`Missing ${name} in .env`)
  return v.trim()
}

function toBytes32(hex: string): string {
  return ethers.hexlify(ethers.zeroPadValue(hex, 32))
}

async function createXPaymentHeaderEIP3009Exact(
  wallet: ethers.Wallet,
  reqs: PaymentRequirements
) {
  const { payTo, asset, maxAmountRequired, maxTimeoutSeconds, scheme, network } = reqs

  const from = await wallet.getAddress()
  const to = ethers.getAddress(payTo)
  const value = BigInt(maxAmountRequired)

  const validAfter = 0n
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000) + (maxTimeoutSeconds || 300)
  )

  const nonce = toBytes32(ethers.hexlify(ethers.randomBytes(32)))

  const token = new ethers.Contract(asset, TOKEN_ABI, wallet.provider)
  const domainSeparator: string = await token.DOMAIN_SEPARATOR()

  const TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
  )

  const abi = ethers.AbiCoder.defaultAbiCoder()
  const structEncoded = abi.encode(
    ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [TYPEHASH, from, to, value, validAfter, validBefore, nonce]
  )

  const structHash = ethers.keccak256(structEncoded)

  const digest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes("\x19\x01"),
      ethers.getBytes(domainSeparator),
      ethers.getBytes(structHash),
    ])
  )

  const rawSig = wallet.signingKey.sign(digest) // { r, s, yParity }
  const v27 = 27 + rawSig.yParity

  const forcedSig = ethers.Signature.from({
    r: rawSig.r,
    s: rawSig.s,
    v: v27,
  }).serialized

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
      nonce,
      signature: forcedSig,
      asset,
    },
  }

  return Buffer.from(JSON.stringify(headerObj)).toString("base64")
}

/**
 * POST /buyer-demo/fund
 * Body: { owner, repo, issueNumber, amountBaseUnits }
 * This runs the SAME flow as scripts/buyer_demo.ts but as an API endpoint.
 */
router.post("/fund", async (req, res) => {
  try {
    const { owner, repo, issueNumber, amountBaseUnits } = req.body || {}

    if (!owner || !repo || !issueNumber || !amountBaseUnits) {
      return res.status(400).json({
        error: "owner, repo, issueNumber, amountBaseUnits are required",
      })
    }

    const PRIVATE_KEY = requireEnv("MAINTAINER_PRIVATE_KEY")
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

    // 1) fund-intent (expect 402)
    const intent = await axios.post(
      `http://127.0.0.1:${process.env.PORT || 8787}/bounties/fund-intent`,
      { owner, repo, issueNumber: Number(issueNumber), amountBaseUnits: String(amountBaseUnits) },
      { validateStatus: (s) => s === 402 || s === 200 }
    )

    if (intent.status === 200) {
      return res.status(200).json({
        ok: true,
        alreadyFunded: true,
        data: intent.data,
      })
    }

    const reqs: PaymentRequirements = intent.data.paymentRequirements
    if (!reqs?.payTo || !reqs?.asset || !reqs?.maxAmountRequired) {
      return res.status(500).json({
        error: "Invalid paymentRequirements from fund-intent",
        intent: intent.data,
      })
    }

    // (Optional debug)
    const token = new ethers.Contract(reqs.asset, TOKEN_ABI, provider)
    const decimals: number = await token.decimals()
    const bal: bigint = await token.balanceOf(wallet.address)

    // 2) generate payment header (buyer_demo style)
    const paymentHeader = await createXPaymentHeaderEIP3009Exact(wallet, reqs)

    // 3) settle
    const funded = await axios.post(
      `http://127.0.0.1:${process.env.PORT || 8787}/bounties/fund`,
      { owner, repo, issueNumber: Number(issueNumber), amountBaseUnits: String(amountBaseUnits), paymentHeader },
      { validateStatus: () => true }
    )

    if (funded.status !== 200) {
      return res.status(funded.status).json({
        ok: false,
        error: "Funding failed",
        funded: funded.data,
      })
    }

    return res.status(200).json({
      ok: true,
      payer: wallet.address,
      payerBalance: ethers.formatUnits(bal, decimals),
      funded: funded.data?.funded || funded.data,
    })
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "Internal error",
    })
  }
})

export default router