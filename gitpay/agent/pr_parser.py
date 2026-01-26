import re
from dataclasses import dataclass
from typing import Optional

WALLET_RE = re.compile(r"(0x[a-fA-F0-9]{40})")
ISSUE_RE = re.compile(r"(?:Closes|Fixes|Resolves)\s+#(\d+)", re.IGNORECASE)
BOUNTY_RE = re.compile(r"\[(\d+(?:\.\d+)?)\s*(USDC|CRO)\]", re.IGNORECASE)


@dataclass
class ParsedPR:
    wallet: Optional[str]
    issue_number: Optional[int]


def find_wallet(text: str) -> Optional[str]:
    m = WALLET_RE.search(text or "")
    return m.group(1) if m else None


def find_linked_issue(text: str) -> Optional[int]:
    m = ISSUE_RE.search(text or "")
    return int(m.group(1)) if m else None


def parse_pr_body(body: str) -> ParsedPR:
    return ParsedPR(
        wallet=find_wallet(body),
        issue_number=find_linked_issue(body),
    )


def parse_bounty_from_issue_title(title: str) -> Optional[str]:
    """
    From: '[50 USDC] Fix login' -> '50 USDC'
    """
    m = BOUNTY_RE.search(title or "")
    if not m:
        return None
    amount = m.group(1)
    asset = m.group(2).upper()
    return f"{amount} {asset}"
