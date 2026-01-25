import "dotenv/config";
import axios from "axios";
import { ethers } from "ethers";
import { Facilitator, CronosNetwork } from "@crypto.com/facilitator-client";

// Ensure this matches your running server
const SERVER_URL = "http://localhost:8787";

async function main() {
  // 1. Setup Maintainer (Payer)
  const PRIVATE_KEY = process.env.MAINTAINER_PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("❌ Set MAINTAINER_PRIVATE_KEY in .env");

  const provider = new ethers.JsonRpcProvider("https://evm-t3.cronos.org");
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`🔌 Maintainer Wallet: ${wallet.address}`);

  // 2. Configuration (The Issue you want to fund)
  const owner = "souvik0908";
  const repo = "gitpay";
  const issueNumber = 1;
  const amountBaseUnits = "1000000"; // 1.00 USDC

  try {
    // --- STEP 1: Request Funding Intent ---
    console.log("1️⃣ Requesting Fund Intent...");
    
    // CHANGED: Use your actual GitPay endpoint
    const intent = await axios.post(
      `${SERVER_URL}/bounties/fund-intent`, 
      { owner, repo, issueNumber, amountBaseUnits },
      { validateStatus: (s) => s === 402 || s === 200 }
    );

    // If it's already 200, it's already funded!
    if (intent.status === 200) {
        console.log("✅ Bounty is ALREADY funded!");
        console.log("Details:", intent.data);
        return;
    }

    if (intent.status !== 402) {
      console.error("❌ Unexpected status:", intent.status, intent.data);
      return;
    }

    const reqs = intent.data.paymentRequirements;
    console.log("✅ Requirements Received. Signing...");

    // --- STEP 2: Sign the Payment ---
    const facilitator = new Facilitator({ network: CronosNetwork.CronosTestnet });
    
    const paymentHeader = await facilitator.generatePaymentHeader({
      to: reqs.payTo,
      value: reqs.maxAmountRequired,
      signer: wallet,
      validBefore: Math.floor(Date.now() / 1000) + 3600
    });

    // --- STEP 3: Settle ---
    console.log("🚀 Submitting to GitPay Backend...");
    
    // CHANGED: Use your actual GitPay endpoint
    const funded = await axios.post(`${SERVER_URL}/bounties/fund`, {
      owner, 
      repo, 
      issueNumber, 
      amountBaseUnits,
      paymentHeader: paymentHeader
    });

    console.log("🎉 SUCCESS! Bounty Funded.");
    if (funded.data.funded) {
        console.log(`🔗 Tx Hash: ${funded.data.funded.fundedTxHash}`);
        console.log(`👉 Explorer: https://explorer.cronos.org/testnet/tx/${funded.data.funded.fundedTxHash}`);
    }

  } catch (e: any) {
    console.error("❌ Error:");
    if (e.response) {
        console.error("Status:", e.response.status);
        console.error("Data:", JSON.stringify(e.response.data, null, 2));
    } else {
        console.error(e.message);
    }
  }
}

main().catch(console.error);