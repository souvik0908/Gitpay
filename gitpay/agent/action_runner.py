import os
import sys
import logging
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

# --- CONFIGURATION & LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("gitpay.tx_only")

# Constants
RPC_URL = "https://evm-t3.cronos.org"
CHAIN_ID = 338
USDC_CONTRACT = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0"
TEST_WALLET = "0x9496c5bB7397536Ae4aD729D88bA24d4c22DcF48"

ERC20_ABI = [
    {"constant": False, "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "", "type": "bool"}], "type": "function"},
    {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function"}
]

# --- BLOCKCHAIN LOGIC ---
def execute_payout(amount_float: float):
    logger.info(f"🔗 Connecting to Cronos RPC: {RPC_URL}")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    
    # Middleware for Cronos/PoA chains
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    
    priv_key = os.getenv("CRONOS_PRIVATE_KEY")
    if not priv_key:
        logger.error("❌ CRONOS_PRIVATE_KEY is missing from environment!")
        return None

    try:
        account = w3.eth.account.from_key(priv_key)
        logger.info(f"💳 Sender Account: {account.address}")

        contract = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=ERC20_ABI)
        decimals = contract.functions.decimals().call()
        amount_wei = int(amount_float * (10 ** decimals))
        
        logger.info(f"💸 Preparing transfer of {amount_float} USDC to {TEST_WALLET}")
        
        tx = contract.functions.transfer(
            Web3.to_checksum_address(TEST_WALLET), 
            amount_wei
        ).build_transaction({
            "chainId": CHAIN_ID,
            "gas": 150000,
            "gasPrice": w3.eth.gas_price,
            "nonce": w3.eth.get_transaction_count(account.address),
        })
        
        signed_tx = w3.eth.account.sign_transaction(tx, priv_key)
        
        # FIX: Web3.py v7 uses .raw_transaction (snake_case)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        logger.info(f"⏳ Transaction sent! Hash: {tx_hash.hex()}. Waiting for confirmation...")
        
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status == 1:
            logger.info("✅ Blockchain transaction confirmed successfully.")
            return tx_hash.hex()
        else:
            logger.error("❌ Blockchain transaction REVERTED.")
            return None

    except Exception as e:
        logger.error(f"❌ Blockchain Error: {e}")
        return None

# --- MAIN ENTRY POINT ---
def main():
    logger.info("🚀 GitPay Direct Transaction Runner starting...")
    
    tx_result = execute_payout(1.0)
    
    if tx_result:
        logger.info(f"🎉 SUCCESS! Funds sent. Hash: {tx_result}")
    else:
        logger.error("💀 Payout execution failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
