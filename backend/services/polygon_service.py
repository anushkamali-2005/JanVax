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
import logging
import asyncio
from typing import Tuple, Dict, Any, Optional
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

logger = logging.getLogger("vaxguard.polygon")

# ── Web3 connection to Polygon Mumbai ────────────────────────────────────────

_w3: Optional[Web3] = None
_contract: Any = None

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


def _get_web3() -> Tuple[Web3, Any]:
    global _w3, _contract
    if _w3 is not None and _contract is not None:
        return _w3, _contract

    rpc_url          = os.getenv("POLYGON_RPC_URL", "https://rpc-mumbai.maticvigil.com")
    contract_address = os.getenv("POLYGON_CONTRACT_ADDRESS")

    if not contract_address:
        logger.error("POLYGON_CONTRACT_ADDRESS not set in environment")
        raise ValueError("POLYGON_CONTRACT_ADDRESS not set in environment")

    _w3 = Web3(Web3.HTTPProvider(rpc_url))
    # Polygon Mumbai needs POA middleware (shorter block period)
    # Note: In web3 v7, ExtraDataToPOAMiddleware is used
    _w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

    if not _w3.is_connected():
        logger.error("Cannot connect to Polygon RPC: %s", rpc_url)
        raise ConnectionError(f"Cannot connect to Polygon RPC: {rpc_url}")

    _contract = _w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CONTRACT_ABI,
    )
    logger.info("Web3 connected to Polygon Mumbai and contract loaded.")
    return _w3, _contract


def compute_hash(record_json: dict) -> str:
    """Computes SHA-256 hash of a record JSON. Keys are sorted for determinism."""
    try:
        canonical = json.dumps(record_json, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    except Exception as exc:
        logger.error("Failed to compute hash: %s", exc)
        return ""


async def store_hash(record_json: dict, entity_type: str, entity_id: str) -> str:
    """
    Hashes a record and stores it on Polygon.
    Returns the Polygon transaction ID (tx hash).
    Returns empty string on failure — never raises (background task).
    """
    try:
        # Get Web3 lazily
        w3, contract = await asyncio.to_thread(_get_web3)

        record_hash  = compute_hash(record_json)
        private_key  = os.getenv("POLYGON_PRIVATE_KEY")
        if not private_key:
            logger.error("POLYGON_PRIVATE_KEY not set")
            return ""

        account      = w3.eth.account.from_key(private_key)
        
        # Build transaction in a thread to avoid blocking if it does anything non-trivial
        def _build():
            nonce = w3.eth.get_transaction_count(account.address)
            return contract.functions.storeHash(entity_id, record_hash).build_transaction({
                "chainId":  80001,  # Polygon Mumbai
                "gas":      150000, # slightly higher gas limit for safety
                "gasPrice": w3.eth.gas_price,
                "nonce":    nonce,
                "from":     account.address,
            })

        txn = await asyncio.to_thread(_build)

        signed = w3.eth.account.sign_transaction(txn, private_key=private_key)
        tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.rawTransaction)

        # Wait for receipt (max 30s) - wait_for_transaction_receipt is blocking
        receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, timeout=30)
        
        tx_id = receipt.transactionHash.hex()
        logger.info("Hash stored on Polygon. TX: %s", tx_id)
        return tx_id

    except Exception as exc:
        logger.error("Polygon store_hash error: %s", exc)
        return ""


def verify_hash(entity_id: str, expected_hash: str) -> Dict[str, Any]:
    """
    Retrieves stored hash from Polygon and compares to expected.
    Returns {is_valid, stored_hash, entity_id}
    """
    try:
        _, contract = _get_web3()
        stored_hash = contract.functions.getHash(entity_id).call()

        is_valid = (stored_hash == expected_hash)
        if not is_valid:
            logger.warning("Blockchain verification failed for %s. Expected: %s, Found: %s", 
                           entity_id, expected_hash, stored_hash)

        return {
            "is_valid":    is_valid,
            "stored_hash": stored_hash,
            "entity_id":   entity_id,
        }

    except Exception as exc:
        logger.error("Polygon verify_hash error for %s: %s", entity_id, exc)
        return {
            "is_valid":    False,
            "stored_hash": "",
            "entity_id":   entity_id,
            "error":       str(exc),
        }
