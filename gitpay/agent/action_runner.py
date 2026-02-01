import os
import sys
import json
import logging
import requests
from web3 import Web3
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
load_dotenv()
# --- 1. UNIVERSAL COMPATIBILITY FIX ---
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("gitpay.runner")

RPC_URL = "https://evm-t3.cronos.org"
CHAIN_ID = 338
USDC_CONTRACT = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0"

ERC20_ABI = [
    {"constant": False, "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
    {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function"},
]

# --- MODULE 1: AI AGENT EXTRACTION ---
def extract_details_with_agent(pr_text: str):
    """
    Strictly uses Gemini AI to interpret the PR text.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.error("❌ GOOGLE_API_KEY is missing. Cannot run Agent.")
        return None, None

    logger.info("🧠 Agent is reading the PR description...")
    
    # Initialize the Agent
    llm = ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), 
        api_key=api_key, 
        temperature=0
    )

    prompt = f"""
    You are a financial automation agent. Your job is to extract payment details from a developer's Pull Request description.

    Analyze this text:
    \"\"\"{pr_text}\"\"\"

    Extract two fields:
    1. 'wallet': The Cronos/Ethereum address to pay (starts with 0x).
    2. 'issue_number': The GitHub issue number being fixed (integer only).

    Respond ONLY with a valid JSON object. Do not add markdown or explanations.
    {{
        "wallet": "0x...",
        "issue_number": 123
    }}
    
    If you cannot find a field, return null for it.
    """

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        
        # Clean the response (sometimes AI adds ```json blocks)
        content = response.content.replace("```json", "").replace("```", "").strip()
        data = json.loads(content)
        
        wallet = data.get("wallet")
        issue = data.get("issue_number")
        
        if wallet: 
            wallet = str(wallet).strip()
        if issue: 
            issue = int(issue)
            
        return issue, wallet

    except Exception as e:
        logger.error(f"❌ Agent failed to parse text: {e}")
        return None, None

# --- MODULE 2: FUNDING CHECK ---
def check_funding_status(owner, repo, issue_number):
    service_url = os.getenv("X402_SERVICE_URL", "").strip()
    if not service_url:
        logger.error("❌ X402_SERVICE_URL missing. Cannot verify funding.")
        return False, 0

    url = f"{service_url.rstrip('/')}/bounties/status"
    params = {"owner": owner, "repo": repo, "issueNumber": issue_number}

    logger.info(f"🔎 Agent is verifying funding at {url}...")

    try:
        resp = requests.get(url, params=params, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("funded") is True:
                rec = data.get("record", {}) or {}
                # Handle potential casing differences
                raw_amt = rec.get("amount_base_units") or rec.get("amountBaseUnits")
                if raw_amt:
                    return True, int(raw_amt)
        
        if resp.status_code == 404:
            logger.info(f"msg='Not Funded' issue={issue_number}")
            return False, 0
            
    except Exception as e:
        logger.error(f"❌ Backend connection failed: {e}")
    
    return False, 0

# --- MODULE 3: BLOCKCHAIN PAYOUT ---
def execute_payout(to_address: str, amount_base_units: int):
    # Check for Dry Run mode (useful for testing Agent logic without spending money)
    dry_run = os.getenv("GITPAY_DRY_RUN", "0") == "1"
    if dry_run:
        logger.info(f"🧪 [DRY RUN] Would pay {amount_base_units} to {to_address}. Skipping TX.")
        return "DRY_RUN_TX_HASH"

    logger.info("🔗 Agent connecting to Cronos Blockchain...")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)

    priv_key = os.getenv("CRONOS_PRIVATE_KEY", "").strip()
    if not priv_key:
        logger.error("❌ CRONOS_PRIVATE_KEY missing")
        return None

    try:
        account = w3.eth.account.from_key(priv_key)
        contract = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=ERC20_ABI)

        sender = account.address
        target = Web3.to_checksum_address(to_address)

        logger.info(f"💸 Initiating Transfer: {amount_base_units} units -> {target}")

        tx = contract.functions.transfer(target, int(amount_base_units)).build_transaction({
            "chainId": CHAIN_ID,
            "gas": 150000,
            "gasPrice": w3.eth.gas_price,
            "nonce": w3.eth.get_transaction_count(sender),
        })

        signed_tx = w3.eth.account.sign_transaction(tx, priv_key)
        
        # Universal attribute fix
        raw_tx = getattr(signed_tx, "rawTransaction", None) or getattr(signed_tx, "raw_transaction", None)
        if raw_tx is None:
            raise AttributeError("rawTransaction missing on signed object")

        tx_hash = w3.eth.send_raw_transaction(raw_tx)
        logger.info(f"⏳ Tx Sent: {tx_hash.hex()}. Waiting for confirmation...")
        
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status == 1:
            logger.info("✅ Payout Confirmed!")
            return tx_hash.hex()
        else:
            logger.error("❌ Transaction Reverted on-chain.")
            return None

    except Exception as e:
        logger.error(f"❌ Blockchain Error: {e}")
        return None

# --- MAIN AGENT LOOP ---
def main():
    logger.info("🤖 GitPay Agent Starting...")

    event_path = os.getenv("GITHUB_EVENT_PATH", "").strip()
    if not event_path:
        logger.error("❌ GITHUB_EVENT_PATH missing")
        sys.exit(1)

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    pr = event.get("pull_request") or {}
    if not pr.get("merged"):
        logger.info("⏹️ PR not merged. Agent sleeping.")
        return

    owner = (os.getenv("GITHUB_REPO_OWNER") or event.get("repository", {}).get("owner", {}).get("login") or "").strip()
    repo = (os.getenv("GITHUB_REPO_NAME") or event.get("repository", {}).get("name") or "").strip()
    
    # Combine Title + Body + URL for maximum context
    pr_context = f"Title: {pr.get('title','')}\nBody: {pr.get('body','')}\nURL: {pr.get('html_url','')}"
    
    # 1. AI Extraction
    issue_num, wallet = extract_details_with_agent(pr_context)

    if not issue_num or not wallet:
        logger.error("❌ Agent could not find 'issue_number' or 'wallet' in the PR text.")
        sys.exit(1)

    logger.info(f"📝 Agent identified: Issue #{issue_num} | Payee: {wallet}")

    # 2. Funding Check
    is_funded, amount_units = check_funding_status(owner, repo, issue_num)
    if not is_funded:
        logger.info(f"⏹️ Agent verified Issue #{issue_num} is NOT funded. No action taken.")
        return

    # 3. Payout
    logger.info(f"💰 Funding verified ({amount_units} units). Executing payout...")
    tx_hash = execute_payout(wallet, amount_units)
    
    if not tx_hash:
        logger.error("💀 Agent failed to execute payout.")
        sys.exit(1)

    logger.info(f"🎉 Agent finished successfully. Tx: {tx_hash}")

if __name__ == "__main__":
    main()