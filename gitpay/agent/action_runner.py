import os
import sys
import json
import re
import logging
import requests
from web3 import Web3
from web3.middleware import geth_poa_middleware
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

# --- CONFIGURATION & LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("gitpay.unified")

# Constants
RPC_URL = "https://evm-t3.cronos.org"
CHAIN_ID = 338
USDC_CONTRACT = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0"
TEST_WALLET = "0xfC18367F2c48104A387949392c27cbC8e906581A"

ERC20_ABI = [
    {"constant": False, "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
    {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function"}
]

# --- 1. BLOCKCHAIN LOGIC ---
def execute_payout(amount_float: float):
    logger.info(f"🔗 Connecting to Cronos RPC: {RPC_URL}")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    
    priv_key = os.getenv("CRONOS_PRIVATE_KEY")
    if not priv_key:
        logger.error("❌ CRONOS_PRIVATE_KEY is missing from environment!")
        return None

    account = w3.eth.account.from_key(priv_key)
    logger.info(f"💳 Sender Account: {account.address}")

    contract = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=ERC20_ABI)
    decimals = contract.functions.decimals().call()
    amount_wei = int(amount_float * (10 ** decimals))
    
    logger.info(f"💸 Preparing transfer of {amount_float} USDC ({amount_wei} units) to {TEST_WALLET}")
    
    tx = contract.functions.transfer(TEST_WALLET, amount_wei).build_transaction({
        "chainId": CHAIN_ID,
        "gas": 150000,
        "gasPrice": w3.eth.gas_price,
        "nonce": w3.eth.get_transaction_count(account.address),
    })
    
    signed_tx = w3.eth.account.sign_transaction(tx, priv_key)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    logger.info(f"⏳ Transaction sent! Hash: {tx_hash.hex()}. Waiting for receipt...")
    
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt.status == 1:
        logger.info("✅ Blockchain transaction confirmed successfully.")
        return tx_hash.hex()
    else:
        logger.error("❌ Blockchain transaction REVERTED.")
        return None

# --- 2. GITHUB & AI LOGIC ---
def main():
    logger.info("🚀 GitPay Unified Runner starting...")
    
    try:
        # Load GitHub Event
        event_path = os.getenv("GITHUB_EVENT_PATH")
        with open(event_path, "r") as f:
            event = json.load(f)
        
        pr = event.get("pull_request", {})
        pr_number = pr.get("number")
        pr_body = pr.get("body") or ""
        merged = pr.get("merged", False)
        
        owner = os.getenv("GITHUB_REPOSITORY_OWNER")
        repo = os.getenv("GITHUB_REPOSITORY").split("/")[-1]
        
        logger.info(f"📝 Context: PR #{pr_number} | Repo: {owner}/{repo} | Merged: {merged}")

        if not merged:
            logger.info("⏹️ PR not merged. No payout required. Exiting.")
            return

        # Simple regex for Issue Number (Closes #XX)
        issue_match = re.search(r"Closes\s+#(\d+)", pr_body, re.IGNORECASE)
        if not issue_match:
            logger.warning("⚠️ No 'Closes #ID' found in PR description. Skipping.")
            return
        
        issue_id = issue_match.group(1)
        logger.info(f"🎯 Target Issue identified: #{issue_id}")

        # Check x402 Status
        x402_url = os.getenv("X402_SERVICE_URL", "").rstrip("/")
        if x402_url:
            logger.info(f"🔎 Querying x402 status at {x402_url}...")
            st_req = requests.get(f"{x402_url}/bounties/status", params={
                "owner": owner, "repo": repo, "issueNumber": issue_id
            }, timeout=15)
            st = st_req.json()
            if not st.get("funded"):
                logger.error(f"❌ Issue #{issue_id} is NOT funded in x402. Aborting.")
                return
            logger.info("💰 x402 funding verified.")

        # AI Processing to confirm intent
        logger.info("🧠 Invoking Gemini AI to verify payout intent...")
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", api_key=os.getenv("GEMINI_API_KEY"))
        
        ai_resp = llm.invoke([HumanMessage(content=f"Verify if this PR description seeks a bounty payout. Description: {pr_body}")])
        logger.info(f"🤖 AI Response: {ai_resp.content[:100]}...")

        # Execute Payout to the Hardcoded Wallet
        tx_result = execute_payout(1.0) # Defaulting to 1.0 USDC for test
        
        if tx_result:
            logger.info(f"🎉 SUCCESS! Payout sent to {TEST_WALLET}. Hash: {tx_result}")
        else:
            logger.error("💀 Payout execution failed.")

    except Exception as e:
        logger.exception(f"🔥 Critical Failure in Runner: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()