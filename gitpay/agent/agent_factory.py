import os
import logging
from crypto_com_agent_client import Agent, SQLitePlugin
from google.genai.caching import CachedContent

logger = logging.getLogger("gitpay.agent")


def build_agent():
    """
    Creates and returns a configured Crypto.com Agent instance (Gemini LLM + Cronos blockchain config).
    """
    # Set up SQLite storage for the agent's state
    storage = SQLitePlugin(db_path="agent_state.db")

    # Read transfer limit from environment variable (default to -1 if not set)
    transfer_limit = int(os.getenv("TRANSFER_LIMIT", "-1"))

    # Initialize the agent with necessary configurations
    agent = Agent.init(
        llm_config={
            "provider": "Gemini",  # Using Gemini provider
            "model": "gemini-2.0-flash",  # Gemini model version
            "provider-api-key": os.getenv("GEMINI_API_KEY"),  # Fetch Gemini API key from environment
            "temperature": 0.2,  # Set temperature for response generation (can adjust for randomness)
            "transfer-limit": transfer_limit,  # Set transfer limit
        },
        blockchain_config={
            "chain-id": int(os.getenv("CRONOS_CHAIN_ID", "338")),  # Default chain ID is 338 for Cronos
            "api-key": os.getenv("CRYPTOCOM_API_KEY"),  # Fetch Crypto.com API key from environment
            "private-key": os.getenv("CRONOS_PRIVATE_KEY"),  # Cronos private key
            "sso-wallet-url": os.getenv("CRYPTOCOM_SSO_WALLET_URL", ""),  # Optional SSO wallet URL
            "timeout": 20,  # Timeout setting for blockchain interactions
        },
        plugins={
            "instructions": (
                "You are GitPay, an autonomous payout agent. "
                "When asked to pay, execute the on-chain transaction. "
                "Never reveal secrets. Keep responses minimal and machine-parseable."
            ),
            "storage": storage,  # Use SQLite storage plugin for agent state persistence
        },
    )

    # Log the agent initialization success
    logger.info("✅ Agent initialized (Gemini + Cronos)")

    return agent
