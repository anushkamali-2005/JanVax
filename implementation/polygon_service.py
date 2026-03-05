"""
backend/services/polygon_service.py
-------------------------------------
Polygon Mumbai testnet interaction.
Stores and verifies SHA-256 hashes of records and AI decisions.

CRITICAL: Uses web3.py v6 — API changed significantly from v5.
CRITICAL: Contract ABI must match deployed VaxGuardAudit.sol exactly.
CRITICAL: store_hash is async (called from FastAPI background tasks).
CRITICAL: verify_hash is sync (called from GET /verify/{hash}).
"""

import os
import json
import hashlib
from web3 import Web3
from web3.middleware import geth_poa_middleware

# ── Web3 connection to Polygon Mumbai ────────────────────────────────────────

_w3 = None
_contract = None

# Minimal ABI — only the functions we call
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "entityId", "type": "string"},
            {"internalType": "string", "name": "recordHash", "type": "string"}
        ],
        "name": "storeHash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "entityId", "type": "string"}
        ],
        "name": "getHash",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    }
]


def _get_web3():
    global _w3, _contract
    if _w3 is not None:
        return _w3, _contract

    rpc_url          = os.getenv("POLYGON_RPC_URL", "https://rpc-mumbai.maticvigil.com")
    contract_address = os.getenv("POLYGON_CONTRACT_ADDRESS")

    if not contract_address:
        raise ValueError("POLYGON_CONTRACT_ADDRESS not set in environment")

    _w3 = Web3(Web3.HTTPProvider(rpc_url))
    # Polygon Mumbai needs POA middleware (shorter block period)
    _w3.middleware_onion.inject(geth_poa_middleware, layer=0)

    if not _w3.is_connected():
        raise ConnectionError(f"Cannot connect to Polygon RPC: {rpc_url}")

    _contract = _w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CONTRACT_ABI,
    )
    return _w3, _contract


def compute_hash(record_json: dict) -> str:
    """Computes SHA-256 hash of a record JSON. Keys are sorted for determinism."""
    canonical = json.dumps(record_json, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def store_hash(record_json: dict, entity_type: str, entity_id: str) -> str:
    """
    Hashes a record and stores it on Polygon.
    Returns the Polygon transaction ID (tx hash).
    Returns empty string on failure — never raises (background task).
    """
    try:
        w3, contract = _get_web3()

        record_hash  = compute_hash(record_json)
        private_key  = os.getenv("POLYGON_PRIVATE_KEY")
        account      = w3.eth.account.from_key(private_key)
        nonce        = w3.eth.get_transaction_count(account.address)
        chain_id     = 80001  # Polygon Mumbai

        txn = contract.functions.storeHash(entity_id, record_hash).build_transaction({
            "chainId": chain_id,
            "gas":     100000,
            "gasPrice": w3.eth.gas_price,
            "nonce":   nonce,
            "from":    account.address,
        })

        signed = w3.eth.account.sign_transaction(txn, private_key=private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)

        # Wait for receipt (max 30s)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        return receipt.transactionHash.hex()

    except Exception as e:
        print(f"[polygon_service] store_hash error: {e}")
        return ""


def verify_hash(entity_id: str, expected_hash: str) -> dict:
    """
    Retrieves stored hash from Polygon and compares to expected.
    Returns {is_valid, stored_hash, entity_id}
    """
    try:
        _, contract = _get_web3()
        stored_hash = contract.functions.getHash(entity_id).call()

        return {
            "is_valid":    stored_hash == expected_hash,
            "stored_hash": stored_hash,
            "entity_id":   entity_id,
        }

    except Exception as e:
        print(f"[polygon_service] verify_hash error: {e}")
        return {
            "is_valid":    False,
            "stored_hash": "",
            "entity_id":   entity_id,
            "error":       str(e),
        }
