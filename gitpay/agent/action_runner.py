import json
import os
import sys
import logging
import requests

from .github_api import (
    post_pr_comment,
    receipt_already_posted,
    get_issue,
    issue_has_label,
)
from .pr_parser import parse_pr_body
from .langchain_agent import process_with_ai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gitpay.action_runner")


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v or not v.strip():
        raise RuntimeError(f"Missing required env var: {name}")
    return v.strip()


def read_event_payload() -> dict:
    path = require_env("GITHUB_EVENT_PATH")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def x402_status(*, base_url: str, owner: str, repo: str, issue_number: int) -> dict:
    base_url = base_url.rstrip("/")
    url = f"{base_url}/bounties/status"
    params = {"owner": owner, "repo": repo, "issueNumber": issue_number}
    logger.info(f"🔎 Checking x402 status: {url} params={params}")
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    return r.json()


def main():
    logger.info("✅ action_runner started")

    x402_url = require_env("X402_SERVICE_URL")
    owner = require_env("GITHUB_REPO_OWNER")
    repo = require_env("GITHUB_REPO_NAME")

    event = read_event_payload()
    pr = event.get("pull_request") or {}
    pr_number = pr.get("number")
    pr_body = pr.get("body") or ""
    merged = bool(pr.get("merged"))

    logger.info(f"📦 repo={owner}/{repo} pr_number={pr_number} merged={merged}")

    if not merged or not pr_number:
        logger.info("ℹ️ PR not merged or missing number. Exiting.")
        return 0

    if receipt_already_posted(owner, repo, int(pr_number)):
        logger.info("🧾 Receipt already posted. Exiting.")
        return 0

    parsed = parse_pr_body(pr_body)
    wallet = parsed.wallet
    issue_number = parsed.issue_number

    if not wallet or not issue_number:
        post_pr_comment(
            owner, repo, int(pr_number),
            "❌ GitPay Receipt\n\n"
            "Status: Not Paid\n"
            "Reason: PR body must include:\n"
            "- `Closes #<issue>`\n"
            "- `Wallet: 0x...`"
        )
        return 0

    issue = get_issue(owner, repo, int(issue_number))
    if not issue_has_label(issue, "x402"):
        post_pr_comment(
            owner, repo, int(pr_number),
            f"❌ GitPay Receipt\n\nStatus: Not Paid\nIssue: #{issue_number}\n"
            "Reason: Issue missing `x402` label."
        )
        return 0

    st = x402_status(base_url=x402_url, owner=owner, repo=repo, issue_number=int(issue_number))
    if not st.get("funded"):
        post_pr_comment(
            owner, repo, int(pr_number),
            f"❌ GitPay Receipt\n\nStatus: Not Paid\nIssue: #{issue_number}\n"
            "Reason: Issue not funded in x402 escrow."
        )
        return 0

    funded_tx = (st.get("record") or {}).get("funded_tx_hash")

    logger.info("🤖 Funding verified. Running payout agent...")
    payout_result = process_with_ai(pr_body=pr_body, issue_number=int(issue_number))

    receipt = (
        "✅ GitPay Receipt\n\n"
        f"Status: {payout_result}\n\n"
        f"Issue: #{issue_number}\n"
        f"Wallet: `{wallet}`\n"
        f"Escrow Tx: `{funded_tx}`\n"
    )

    post_pr_comment(owner, repo, int(pr_number), receipt)
    logger.info("✅ Receipt posted.")
    logger.info(f"🧾 parsed wallet={wallet} issue_number={issue_number}")
    logger.info("🧾 receipt_already_posted() = True, exiting")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        logger.exception("❌ action_runner failed")
        raise
