import os
import requests
from typing import Any, Dict

GITHUB_API = "https://api.github.com"

def _headers() -> Dict[str, str]:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("Missing GITHUB_TOKEN")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

def get_issue(owner: str, repo: str, issue_number: int) -> Dict[str, Any]:
    r = requests.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues/{issue_number}",
        headers=_headers(),
        timeout=20,
    )
    r.raise_for_status()
    return r.json()

def issue_has_label(issue: Dict[str, Any], label: str) -> bool:
    labels = issue.get("labels", [])
    return any((l.get("name") == label) for l in labels)

def list_pr_comments(owner: str, repo: str, pr_number: int) -> list[Dict[str, Any]]:
    r = requests.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues/{pr_number}/comments",
        headers=_headers(),
        timeout=20,
    )
    r.raise_for_status()
    return r.json()

def post_pr_comment(owner: str, repo: str, pr_number: int, body: str) -> None:
    r = requests.post(
        f"{GITHUB_API}/repos/{owner}/{repo}/issues/{pr_number}/comments",
        headers=_headers(),
        json={"body": body},
        timeout=20,
    )
    r.raise_for_status()

def receipt_already_posted(owner: str, repo: str, pr_number: int) -> str | None:
    """
    Returns the receipt text if bot already posted a receipt.
    """
    for c in list_pr_comments(owner, repo, pr_number):
        txt = (c.get("body") or "")
        if "GitPay Receipt" in txt and "Tx:" in txt:
            return txt
    return None
