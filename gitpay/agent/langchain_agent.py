import os
import logging
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

from payout import execute_payout

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gitpay.langchain")


@tool(
    "send_crypto_bounty",
    description="Send the authorized bounty amount to the given 0x wallet address. Returns a human-readable result string.",
)
def send_crypto_bounty(wallet_address: str, amount_desc: str) -> str:
    logger.info(f"🧠 Tool called: pay {amount_desc} -> {wallet_address}")

    # Safe local testing toggle
    if os.getenv("GITPAY_DRY_RUN", "0") == "1":
        return f"DRY_RUN. Would have sent {amount_desc} to {wallet_address}"

    tx = execute_payout(wallet_address, amount_desc)
    if tx:
        return f"SUCCESS. Tx: {tx}"
    return "FAILED. Transaction error. Check server logs."


def process_with_ai(pr_body: str, issue_number: int, default_amount: str = "1.0 USDC") -> str:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Error: GOOGLE_API_KEY/GEMINI_API_KEY missing"

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

    # IMPORTANT: langchain-google-genai expects api_key as `api_key`
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
        api_key=api_key,
    )

    system_prompt = (
        "You are a payout agent. "
        "If you find a valid 0x wallet address in the PR text, you MUST call "
        "send_crypto_bounty(wallet_address, amount_desc) with amount_desc set to the authorized bounty amount. "
        "If no wallet is found, respond exactly: No wallet found."
    )

    graph = create_react_agent(
        llm,
        tools=[send_crypto_bounty],
        prompt=system_prompt,
    )

    user_input = (
        f"PR Description:\n{pr_body}\n\n"
        f"Context: This PR closes Issue #{issue_number}. "
        f"Authorized bounty reward: {default_amount}. "
        "Task: Find a 0x wallet address in the PR description and pay it using the tool. "
        "If none, reply exactly: No wallet found."
    )

    try:
        result = graph.invoke({"messages": [HumanMessage(content=user_input)]})
        final = result["messages"][-1].content

        # Gemini sometimes returns list-of-blocks
        if isinstance(final, list):
            text = []
            for p in final:
                if isinstance(p, dict) and "text" in p:
                    text.append(p["text"])
                else:
                    text.append(str(p))
            return "\n".join(text)

        return str(final)

    except Exception as e:
        logger.exception("❌ AI Error")
        return f"AI Processing Error: {e}"
