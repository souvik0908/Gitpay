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


@tool
def send_crypto_bounty(wallet_address: str, amount_desc: str) -> str:
    """
    Sends cryptocurrency to a specific wallet address.
    Call this ONLY when a valid wallet address (starting with 0x) is found in the text.
    """
    logger.info(f"🧠 AI Decided to pay: {amount_desc} -> {wallet_address}")

    # Safe local testing toggle
    if os.getenv("GITPAY_DRY_RUN", "0") == "1":
        return f"DRY_RUN. Would have sent {amount_desc} to {wallet_address}"

    tx = execute_payout(wallet_address, amount_desc)
    if tx:
        return f"SUCCESS. Transaction Hash: {tx}"
    return "FAILED. Transaction error. Check server logs."


def process_with_ai(pr_body: str, issue_number: int, default_amount: str = "1.0 USDC") -> str:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("❌ Missing GOOGLE_API_KEY / GEMINI_API_KEY in environment variables")
        return "Error: GOOGLE_API_KEY / GEMINI_API_KEY missing"

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
        google_api_key=api_key,
    )

    system_prompt = (
        "You are an autonomous financial agent for Open Source. "
        "Your job is to payout bounties when code is merged. "
        "Analyze the PR description. "
        "If you find a wallet address (starts with 0x), you MUST call the tool "
        "`send_crypto_bounty(wallet_address, amount_desc)` using the authorized amount. "
        "If no wallet is found, reply exactly: No wallet found"
    )

    graph = create_react_agent(
        llm,
        tools=[send_crypto_bounty],
        prompt=system_prompt,
    )

    user_input = (
        f"PR Description:\n{pr_body}\n\n"
        f"Context: This PR closes Issue #{issue_number}. "
        f"The authorized bounty reward is '{default_amount}'. "
        "Task: Find a 0x wallet address in the PR description. "
        "If found, pay it using the tool with amount_desc set to the authorized bounty. "
        "If not found, reply exactly: No wallet found"
    )

    try:
        logger.info(f"🚀 AI analyzing PR for Issue #{issue_number} using model={model_name} ...")
        inputs = {"messages": [HumanMessage(content=user_input)]}
        result = graph.invoke(inputs)

        final = result["messages"][-1].content

        # Gemini may return list-of-parts
        if isinstance(final, list):
            parts = []
            for p in final:
                if isinstance(p, dict) and "text" in p:
                    parts.append(p["text"])
                else:
                    parts.append(str(p))
            final_text = "\n".join(parts)
        else:
            final_text = str(final)

        # If model wraps tool output as JSON-ish text, attempt to extract "output"
        import json
        try:
            obj = json.loads(final_text)
            if isinstance(obj, dict):
                for _, v in obj.items():
                    if isinstance(v, dict) and "output" in v:
                        return v["output"]
        except Exception:
            pass

        return final_text

    except Exception as e:
        logger.exception("❌ AI Error")
        return f"AI Processing Error: {e}"
