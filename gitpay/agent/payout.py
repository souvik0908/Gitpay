import os
import logging
from agent_factory import build_agent

logger = logging.getLogger("gitpay.payout")

PAYOUT_ASSET = os.getenv("PAYOUT_ASSET", "USDC").upper()
USDC_CONTRACT = os.getenv("USDC_CONTRACT", "")

_agent = None


def get_agent():
    global _agent
    if _agent is None:
        _agent = build_agent()
    return _agent


def execute_payout(to_address: str, amount_desc: str) -> str | None:
    """
    amount_desc: e.g. "50 USDC" or "100 CRO"
    Returns: tx hash or response string; None on failure.
    """
    try:
        agent = get_agent()

        if "USDC" in amount_desc.upper() or PAYOUT_ASSET == "USDC":
            if not USDC_CONTRACT:
                raise RuntimeError("USDC_CONTRACT missing")
            value = "".join([c for c in amount_desc if c.isdigit()]) or "50"
            command = (
                f"Send {value} tokens of contract {USDC_CONTRACT} "
                f"to {to_address} on Cronos Chain"
            )
        else:
            value = "".join([c for c in amount_desc if c.isdigit()]) or "50"
            command = f"Send {value} CRO to {to_address} on Cronos Chain"

        logger.info("🤖 Agent executing: %s", command)
        resp = agent.interact(command)

        return str(resp)

    except Exception as e:
        logger.exception("❌ Payout Error: %s", e)
        return None
