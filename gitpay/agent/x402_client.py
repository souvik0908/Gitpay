import os
import requests

def get_bounty_funded_status(owner: str, repo: str, issue_number: int) -> dict | None:
    """
    Calls x402 service to check whether a bounty is funded.
    Returns the 'funded' dict or None.
    """
    base = os.getenv("X402_SERVICE_BASE", "http://127.0.0.1:4000").rstrip("/")
    url = f"{base}/bounties/status"
    r = requests.get(url, params={"owner": owner, "repo": repo, "issueNumber": issue_number}, timeout=20)
    r.raise_for_status()
    data = r.json()
    return data.get("funded")
