import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { Facilitator, CronosNetwork } from "@crypto.com/facilitator-client";
import { Storage } from "./storage.js"; // Import the Storage class

// --- Types ---
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

type FundIntentResponse = {
  error: "Payment Required";
  x402Version: 1;
  paymentRequirements: PaymentRequirements;
};

type FundRequestBody = {
  owner: string;
  repo: string;
  issueNumber: number;
  amountBaseUnits: string;
  paymentHeader: string;
};

// --- DB Setup (The Fix) ---
const DB_PATH = process.env.DB_PATH || "./gitpay_x402.db";
const storage = new Storage(DB_PATH);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

const PORT = Number(process.env.PORT || 8787);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name} in .env`);
  return v.trim();
}

const TREASURY_WALLET = requireEnv("TREASURY_WALLET");
const USDCE_CONTRACT = requireEnv("USDCE_CONTRACT");
const X402_NETWORK_ENV = (process.env.X402_NETWORK || "cronos-testnet").trim() as
  | "cronos-testnet"
  | "cronos";

function getSdkNetwork(n: string): CronosNetwork {
  if (n === "cronos-testnet") return CronosNetwork.CronosTestnet;
  if (n === "cronos") return CronosNetwork.CronosMainnet;
  return CronosNetwork.CronosTestnet;
}

const facilitator = new Facilitator({ network: getSdkNetwork(X402_NETWORK_ENV) });

function buildRequirements(amountBaseUnits: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: X402_NETWORK_ENV,
    payTo: TREASURY_WALLET,
    asset: USDCE_CONTRACT,
    description: "GitPay bounty funding",
    mimeType: "application/json",
    maxAmountRequired: amountBaseUnits,
    maxTimeoutSeconds: 300,
  };
}

// ---- Header Helpers ----
function b64DecodeJsonNode<T = any>(b64: string): T {
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as T;
}
function b64EncodeJsonNode(obj: any): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}
function normalizeVTo27(sigHex: string): string {
  const sig = ethers.Signature.from(sigHex);
  const v = sig.v === 27 || sig.v === 28 ? sig.v : 27 + sig.yParity;
  return ethers.Signature.from({ r: sig.r, s: sig.s, v }).serialized;
}
function fixX402HeaderV(paymentHeaderBase64: string): string {
  const header = b64DecodeJsonNode<any>(paymentHeaderBase64);
  if (!header?.payload?.signature) throw new Error("Invalid paymentHeader: missing payload.signature");
  header.payload.signature = normalizeVTo27(header.payload.signature);
  return b64EncodeJsonNode(header);
}
function assertHeaderMatchesRequirements(paymentHeaderBase64: string, reqs: PaymentRequirements) {
  const h = b64DecodeJsonNode<any>(paymentHeaderBase64);
  const p = h?.payload;
  if (!p?.from || !p?.to || !p?.asset || !p?.value) {
    throw new Error("paymentHeader payload missing required fields");
  }
  if (ethers.getAddress(p.from) === ethers.getAddress(p.to)) {
    throw new Error(`Invalid payment header: payload.from equals payload.to (${p.from})`);
  }
  if (ethers.getAddress(p.to) !== ethers.getAddress(reqs.payTo)) {
    throw new Error(`Header 'to' mismatch: ${p.to} != payTo(${reqs.payTo})`);
  }
  if (ethers.getAddress(p.asset) !== ethers.getAddress(reqs.asset)) {
    throw new Error(`Header 'asset' mismatch: ${p.asset} != asset(${reqs.asset})`);
  }
  if (String(p.value) !== String(reqs.maxAmountRequired)) {
    throw new Error(`Header 'value' mismatch: ${p.value} != required(${reqs.maxAmountRequired})`);
  }
}

// ---- Routes ----

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/bounties/fund-intent", (req, res) => {
  const { owner, repo, issueNumber, amountBaseUnits } = req.body || {};
  if (!owner || !repo || !issueNumber || !amountBaseUnits) {
    return res.status(400).json({ error: "owner, repo, issueNumber, amountBaseUnits required" });
  }

  // Use Storage instead of Map
  const existing = storage.getFunded(owner, repo, Number(issueNumber));
  if (existing) {
    return res.status(200).json({ ok: true, alreadyFunded: true, funded: existing, fundedTxHash: existing.fundedTxHash });
  }

  const requirements = buildRequirements(String(amountBaseUnits));
  const payload: FundIntentResponse = { error: "Payment Required", x402Version: 1, paymentRequirements: requirements };
  return res.status(402).json(payload);
});

app.get("/bounties/status", (req, res) => {
  const owner = String(req.query.owner || "");
  const repo = String(req.query.repo || "");
  const issueNumber = Number(req.query.issueNumber || 0);

  if (!owner || !repo || !issueNumber) {
    return res.status(400).json({ ok: false, error: "owner, repo, issueNumber required" });
  }

  // Use Storage to fix the 404 issue
  const existing = storage.getFunded(owner, repo, issueNumber);
  
  if (!existing) {
    return res.status(404).json({ ok: true, funded: false });
  }

  return res.status(200).json({ ok: true, funded: true, record: existing });
});

app.post("/bounties/fund", async (req, res) => {
  const body = req.body as FundRequestBody;

  if (!body?.owner || !body?.repo || !body?.issueNumber || !body?.amountBaseUnits || !body?.paymentHeader) {
    return res.status(400).json({ error: "owner, repo, issueNumber, amountBaseUnits, paymentHeader required" });
  }

  // Idempotency Check via Storage
  const existing = storage.getFunded(body.owner, body.repo, Number(body.issueNumber));
  if (existing) {
    return res.status(200).json({ ok: true, alreadyFunded: true, funded: existing, fundedTxHash: existing.fundedTxHash });
  }

  const requirements = buildRequirements(String(body.amountBaseUnits));

  let fixedHeader = body.paymentHeader;
  try {
    fixedHeader = fixX402HeaderV(body.paymentHeader);
    assertHeaderMatchesRequirements(fixedHeader, requirements);
  } catch (e: any) {
    return res.status(400).json({ error: "Invalid paymentHeader", details: e?.message || "Header check failed" });
  }

  try {
    // Note: We keep verifyPayment here as per your request, 
    // but if it flakes you can comment it out like we discussed before.
    const verifyResp = await facilitator.verifyPayment({
      x402Version: 1,
      paymentHeader: fixedHeader,
      paymentRequirements: requirements,
    });

    if (!verifyResp.isValid) {
      return res.status(402).json({ error: "Invalid payment", reason: verifyResp.invalidReason || "Verification failed" });
    }

    const settleResp = await facilitator.settlePayment({
      x402Version: 1,
      paymentHeader: fixedHeader,
      paymentRequirements: requirements,
    });

    if ((settleResp as any).event !== "payment.settled") {
      return res.status(402).json({ error: "Payment settlement failed", reason: (settleResp as any)?.error || "Unknown", settle: settleResp });
    }

    const record = {
      owner: body.owner,
      repo: body.repo,
      issueNumber: Number(body.issueNumber),
      asset: requirements.asset,
      amountBaseUnits: requirements.maxAmountRequired,
      treasuryWallet: requirements.payTo,
      fundedTxHash: (settleResp as any).txHash,
      fundedFrom: (settleResp as any).from,
      fundedAt: new Date().toISOString(),
    };

    // Save to SQLite so it persists for the Python Agent
    storage.upsertFunded(record);
    
    return res.status(200).json({ ok: true, funded: record, fundedTxHash: record.fundedTxHash });
  } catch (e: any) {
    const details = e?.response?.data || e?.message || String(e);
    return res.status(500).json({ error: "Server error processing payment", details });
  }
});

app.listen(PORT, () => {
  console.log(`✅ GitPay x402 service running on http://0.0.0.0:${PORT}`);
});