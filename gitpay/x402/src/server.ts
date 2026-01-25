import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import { Storage } from "./storage.js";
import { Facilitator, CronosNetwork } from "@crypto.com/facilitator-client";
import type { FundIntentResponse, FundRequestBody, PaymentRequirements } from "./types.js";
import buyerDemoRoutes from "./routes/buyer-demo";




const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use("/buyer-demo", buyerDemoRoutes);

// FIX: Default to 8787 to match your Frontend configuration
const PORT = Number(process.env.PORT || 8787);

const TREASURY_WALLET = (process.env.TREASURY_WALLET || "").trim();
const USDCE_CONTRACT = (process.env.USDCE_CONTRACT || "").trim();
// FIX: Ensure network string maps correctly to SDK enum
const X402_NETWORK_ENV = (process.env.X402_NETWORK || "cronos-testnet").trim();
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.cronoslabs.org/v2/x402";
const DB_PATH = process.env.DB_PATH || "./gitpay_x402.db";

if (!TREASURY_WALLET) throw new Error("Missing TREASURY_WALLET in .env");
if (!USDCE_CONTRACT) throw new Error("Missing USDCE_CONTRACT in .env");

// Helper to map env string to SDK Enum
function getSdkNetwork(n: string): CronosNetwork {
  if (n === "cronos-testnet") return CronosNetwork.CronosTestnet;
  if (n === "cronos") return CronosNetwork.CronosMainnet;
  return CronosNetwork.CronosTestnet; // Default
}

// FIX: Facilitator constructor only accepts 'network'. Base URL is internal.
const facilitator = new Facilitator({
  network: getSdkNetwork(X402_NETWORK_ENV),
});

const storage = new Storage(DB_PATH);

function buildRequirements(amountBaseUnits: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: X402_NETWORK_ENV as "cronos-testnet" | "cronos",
    payTo: TREASURY_WALLET,
    asset: USDCE_CONTRACT,
    description: "GitPay bounty funding",
    mimeType: "application/json",
    maxAmountRequired: amountBaseUnits,
    maxTimeoutSeconds: 300,
  };
}

// --- HELPER WRAPPERS (To handle SDK types cleanly) ---
let activeBounties = [];
async function facilitatorVerify(body: any) {
  return facilitator.verifyPayment({
    x402Version: 1,
    paymentHeader: body.paymentHeader,
    paymentRequirements: body.paymentRequirements,
  });
}

async function facilitatorSettle(body: any) {
  return facilitator.settlePayment({
    x402Version: 1,
    paymentHeader: body.paymentHeader,
    paymentRequirements: body.paymentRequirements,
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * Step 1: Create a fund intent (returns 402 + requirements)
 */
app.post("/bounties/fund-intent", (req, res) => {
  const { owner, repo, issueNumber, amountBaseUnits } = req.body || {};
  if (!owner || !repo || !issueNumber || !amountBaseUnits) {
    return res.status(400).json({ error: "owner, repo, issueNumber, amountBaseUnits required" });
  }

  const requirements = buildRequirements(String(amountBaseUnits));
  const payload: FundIntentResponse = {
    error: "Payment Required",
    x402Version: 1,
    paymentRequirements: requirements,
  };

  return res.status(402).json(payload);
});

/**
 * Step 2: Fund a bounty (verify + settle)
 */
app.post("/bounties/fund", async (req, res) => {
  const body = req.body as FundRequestBody;

  if (!body?.owner || !body?.repo || !body?.issueNumber || !body?.amountBaseUnits || !body?.paymentHeader) {
    return res.status(400).json({
      error: "owner, repo, issueNumber, amountBaseUnits, paymentHeader required",
    });
  }

  // Idempotency check
  const existing = storage.getFunded(body.owner, body.repo, Number(body.issueNumber));
  if (existing) {
    return res.status(200).json({ ok: true, alreadyFunded: true, funded: existing });
  }

  const requirements = buildRequirements(String(body.amountBaseUnits));

  try {
    // 1. Verify
    const verifyResp = await facilitatorVerify({
      paymentHeader: body.paymentHeader,
      paymentRequirements: requirements,
    });

    if (!verifyResp.isValid) {
      return res.status(402).json({
        error: "Invalid payment",
        reason: verifyResp.invalidReason || "Verification failed",
      });
    }

    // 2. Settle
    const settleResp = await facilitatorSettle({
      paymentHeader: body.paymentHeader,
      paymentRequirements: requirements,
    });

    // Check for success event
    if (settleResp.event !== "payment.settled") {
      return res.status(402).json({
        error: "Payment settlement failed",
        reason: settleResp.error || "Unknown settlement error",
        settle: settleResp,
      });
    }

    const txHash = settleResp.txHash;
    const from = settleResp.from;

    const record = {
      owner: body.owner,
      repo: body.repo,
      issueNumber: Number(body.issueNumber),
      asset: requirements.asset,
      amountBaseUnits: requirements.maxAmountRequired,
      treasuryWallet: requirements.payTo,
      fundedTxHash: txHash,
      fundedFrom: from,
      fundedAt: new Date().toISOString(),
    };

    storage.upsertFunded(record);

    return res.status(200).json({ ok: true, funded: record });
  } catch (e: any) {
    console.error("Fund Error:", e);
    const details = e?.response?.data || e?.message || String(e);
    return res.status(500).json({ error: "Server error processing payment", details });
  }
});

/**
 * Status Check used by the Python Agent
 */


app.post("/bounties/fund", (req, res) => {
  const { owner, repo, issueNumber, amountBaseUnits, paymentHeader } = req.body;

  // Mock logic for funding a bounty
  const newBounty = {
    owner,
    repo,
    issueNumber,
    amountBaseUnits,
    fundedTxHash: "mockTransactionHash1234",
    fundedFrom: "mockWalletAddress1234",
    fundedAt: new Date().toISOString(),
  };

  activeBounties.push(newBounty);

  res.status(200).json({
    ok: true,
    funded: newBounty,
  });
});

app.get("/bounties", (req, res) => {
  // Return the active bounties (no DB, just in-memory)
  res.status(200).json(activeBounties);
});

app.listen(PORT, () => {
  console.log(`✅ GitPay x402 service running on http://0.0.0.0:${PORT}`);
});
