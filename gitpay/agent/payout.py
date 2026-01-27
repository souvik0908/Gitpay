import os
import logging
import re
from web3 import Web3
from web3.middleware import geth_poa_middleware

logger = logging.getLogger("gitpay.payout")

RPC_URL = "https://evm-t3.cronos.org"
CHAIN_ID = 338
USDC_CONTRACT_ADDRESS = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0"  # devUSDC.e

ERC20_ABI = [
    {
        "constant": False,
        "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function"},
]

AMOUNT_ASSET_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(USDC)\s*$", re.IGNORECASE)

def get_web3():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    return w3

def execute_payout(to_address: str, amount_desc: str) -> str | None:
    """
    Expects amount_desc like: '1 USDC'
    """
    try:
        private_key = os.getenv("CRONOS_PRIVATE_KEY")
        if not private_key:
            logger.error("❌ Missing CRONOS_PRIVATE_KEY")
            return None

        m = AMOUNT_ASSET_RE.match(amount_desc or "")
        if not m:
            logger.error(f"❌ Invalid amount format (expected 'N USDC'): {amount_desc}")
            return None

        amount_float = float(m.group(1))
        if amount_float <= 0:
            logger.error(f"❌ Invalid amount: {amount_desc}")
            return None

        w3 = get_web3()
        account = w3.eth.account.from_key(private_key)
        sender = account.address

        if not Web3.is_address(to_address):
            logger.error(f"❌ Invalid address: {to_address}")
            return None
        to_address = Web3.to_checksum_address(to_address)

        logger.info(f"🤖 Executing Transfer: {amount_float} USDC -> {to_address}")

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(USDC_CONTRACT_ADDRESS),
            abi=ERC20_ABI,
        )
        decimals = contract.functions.decimals().call()
        amount_wei = int(amount_float * (10 ** decimals))

        nonce = w3.eth.get_transaction_count(sender)

        tx = contract.functions.transfer(to_address, amount_wei).build_transaction(
            {
                "chainId": CHAIN_ID,
                "gas": 200000,
                "gasPrice": w3.eth.gas_price,
                "nonce": nonce,
            }
        )

        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        raw = getattr(signed_tx, "rawTransaction", None) or getattr(signed_tx, "raw_transaction", None)
        if raw is None:
            raise AttributeError("SignedTransaction missing rawTransaction/raw_transaction")

        tx_hash = w3.eth.send_raw_transaction(raw)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status == 1:
            return tx_hash.hex()

        logger.error("❌ Transaction Reverted")
        return None

    except Exception as e:
        logger.exception(f"❌ Payout Failed: {e}")
        return None
