import os
import json
import logging
import requests
import sys

# Import your existing logic
from github_parser import parse_pr_body, parse_bounty_from_issue_title
from github_client import get_issue, post_pr_comment
from payout import execute_payout

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gitpay.action")

def check_x402_funding(owner, repo, issue_number):
    """
    Asks your local x402 service (via the Cloudflare Tunnel Secret) if the bounty is funded.
    """
    base_url = os.getenv("X402_SERVICE_URL") 
    if not base_url:
        logger.error("❌ X402_SERVICE_URL secret is missing. Cannot verify funding.")
        return None

    # Remove trailing slash if present
    base_url = base_url.rstrip('/')
    
    try:
        url = f"{base_url}/bounties/status"
        logger.info(f"🔍 Checking funding at: {url}")
        
        resp = requests.get(url, params={
            "owner": owner, 
            "repo": repo, 
            "issueNumber": issue_number
        }, timeout=15)
        
        if resp.status_code != 200:
            logger.error(f"❌ API Error {resp.status_code}: {resp.text}")
            return None

        data = resp.json()
        if data.get("ok") and data.get("funded"):
            logger.info(f"✅ Verified x402 Funding! Tx: {data['funded']['fundedTxHash']}")
            return data['funded']
        else:
            logger.warning("⚠️ x402 Service says this issue is NOT funded.")
            return None
            
    except Exception as e:
        logger.error(f"❌ Failed to connect to x402 Service: {e}")
        return None

def main():
    # 1. Load the GitHub Event Data
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if not event_path:
        logger.error("No GITHUB_EVENT_PATH. Are you running this locally?")
        return

    with open(event_path, 'r') as f:
        event = json.load(f)

    pr = event.get("pull_request", {})
    if not pr.get("merged"):
        logger.info("PR closed but not merged. Exiting.")
        return

    pr_number = pr.get("number")
    pr_body = pr.get("body", "")
    owner = os.getenv("GITHUB_REPO_OWNER")
    repo = os.getenv("GITHUB_REPO_NAME")
    
    logger.info(f"🚀 Starting GitPay Action for Merged PR #{pr_number}")

    # 2. Parse PR Body for Wallet & Linked Issue
    parsed = parse_pr_body(pr_body)

    if not parsed.wallet:
        logger.error("❌ No wallet found in PR body (e.g. 'Wallet: 0x...').")
        return

    if not parsed.issue_number:
        logger.error("❌ No linked issue found (e.g. 'Closes #1').")
        return

    logger.info(f"🔗 Linked Issue: #{parsed.issue_number} | Wallet: {parsed.wallet}")

    # 3. Verify Funding via Tunnel
    funded_data = check_x402_funding(owner, repo, parsed.issue_number)
    
    if not funded_data:
        # Stop here to prevent spending money on unfunded issues
        logger.error("🛑 Stopping Payout: Proof of Funds failed.")
        return

    # 4. Execute Payout (Using the Agent SDK)
    # We use the amount stored in the x402 database for accuracy
    amount_units = funded_data.get('amountBaseUnits', '1000000') # Default 1 USDC
    amount_desc = f"{int(amount_units) / 1000000} USDC"

    logger.info(f"💰 Funds Verified. Payout Amount: {amount_desc}")

    tx = execute_payout(parsed.wallet, amount_desc)
    
    if tx:
        logger.info(f"🎉 Payout Success! Tx: {tx}")
        
        # 5. Post Receipt
        x402_tx = funded_data.get('fundedTxHash', 'N/A')
        receipt = (
            "### ✅ GitPay Receipt\n\n"
            f"- **Status:** Paid 🟢\n"
            f"- **Amount:** {amount_desc}\n"
            f"- **Recipient:** `{parsed.wallet}`\n"
            f"- **Issue:** #{parsed.issue_number}\n"
            f"- **Payout Tx:** [{tx}](https://explorer.cronos.org/testnet/tx/{tx})\n"
            f"- **Funding Proof:** [{x402_tx[:10]}...](https://explorer.cronos.org/testnet/tx/{x402_tx})\n"
            "\n_Processed by GitPay Agent_"
        )
        post_pr_comment(owner, repo, int(pr_number), receipt)
    else:
        logger.error("❌ Payout function returned None.")

if __name__ == "__main__":
    main()