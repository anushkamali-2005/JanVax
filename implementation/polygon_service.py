"""
backend/services/polygon_service.py
-------------------------------------
Polygon Amoy testnet interaction (Mumbai was DEPRECATED Nov 2023).
Stores and verifies SHA-256 hashes of records and AI decisions.

BUGS FIXED vs original:
  FIX-1  geth_poa_middleware import wrong for web3 v6.
         web3 v6 renamed it to ExtraDataToPOAMiddleware in
         web3.middleware.proof_of_authority. We handle both v5 and v6
         with a try/except so the code works regardless of installed version.
  FIX-2  signed.rawTransaction → signed.raw_transaction (web3 v6 rename).
         Again handled with try/except for backwards compat.
  FIX-3  chain_id 80001 (Polygon Mumbai) shut down Nov 2023.
         Now uses Amoy testnet chain_id=80002.
         RPC default updated to https://rpc-amoy.polygon.technology
  FIX-4  middleware_onion.inject() API — handled via try/except for v5/v6 compat.
"""

import os
import json
import hashlib
from web3 import Web3

# ── POA middleware — compatible with web3 v5 AND v6 ──────────────────────────
# web3 v5: from web3.middleware import geth_poa_middleware
# web3 v6: from web3.middleware.proof_of_authority import ExtraDataToPOAMiddleware
try:
    from web3.middleware.proof_of_authority import ExtraDataToPOAMiddleware as _POA_MW
    _POA_MW_V6 = True
except ImportError:
    from web3.middleware import geth_poa_middleware as _POA_MW  # type: ignore[assignment]
    _POA_MW_V6 = False

# ── Singleton state ───────────────────────────────────────────────────────────
_w3       = None
_contract = None

# Minimal ABI — only the two functions we call from Python
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "entityId",   "type": "string"},
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


def _inject_poa(w3: Web3) -> None:
    """
    Inject POA middleware — handles web3 v5 and v6 API differences.
    web3 v6 uses w3.middleware_onion.inject(middleware, layer=0)
    web3 v6.x also accepts add() in some builds — inject is safest.
    """
    try:
        if _POA_MW_V6:
            # web3 v6: ExtraDataToPOAMiddleware is injected directly
            w3.middleware_onion.inject(_POA_MW, layer=0)
        else:
            # web3 v5: geth_poa_middleware
            w3.middleware_onion.inject(_POA_MW, layer=0)
    except Exception as e:
        # Non-fatal — Amoy sometimes works without it
        print(f"[polygon_service] POA middleware inject warning (non-fatal): {e}")


def _get_web3():
    global _w3, _contract

    if _w3 is not None and _w3.is_connected():
        return _w3, _contract

    # FIX-3: default to Amoy testnet (Mumbai shut down Nov 2023)
    rpc_url          = os.getenv(
        "POLYGON_RPC_URL",
        "https://rpc-amoy.polygon.technology"
    )
    contract_address = os.getenv("POLYGON_CONTRACT_ADDRESS")

    if not contract_address:
        raise ValueError(
            "POLYGON_CONTRACT_ADDRESS not set. "
            "Deploy VaxGuardAudit.sol and set this env var."
        )

    _w3 = Web3(Web3.HTTPProvider(rpc_url))
    _inject_poa(_w3)

    if not _w3.is_connected():
        raise ConnectionError(f"Cannot connect to Polygon RPC: {rpc_url}")

    _contract = _w3.eth.contract(
        address=Web3.to_checksum_address(contract_address),
        abi=CONTRACT_ABI,
    )
    return _w3, _contract


# ── Public helpers ────────────────────────────────────────────────────────────

def compute_hash(record_json: dict) -> str:
    """SHA-256 of canonical JSON (sorted keys). Deterministic across runs."""
    canonical = json.dumps(record_json, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def store_hash(record_json: dict, entity_type: str, entity_id: str) -> str:
    """
    Hashes record_json and stores hash on Polygon.
    Returns tx hash string on success, empty string on failure.
    Never raises — safe to use in asyncio.create_task().
    """
    try:
        w3, contract = _get_web3()

        record_hash = compute_hash(record_json)
        private_key = os.getenv("POLYGON_PRIVATE_KEY")
        if not private_key:
            print("[polygon_service] POLYGON_PRIVATE_KEY not set — skipping store")
            return ""

        account  = w3.eth.account.from_key(private_key)
        nonce    = w3.eth.get_transaction_count(account.address)
        chain_id = int(os.getenv("POLYGON_CHAIN_ID", "80002"))  # FIX-3: Amoy default

        txn = contract.functions.storeHash(entity_id, record_hash).build_transaction({
            "chainId":  chain_id,
            "gas":      120000,
            "gasPrice": w3.eth.gas_price,
            "nonce":    nonce,
            "from":     account.address,
        })

        signed  = w3.eth.account.sign_transaction(txn, private_key=private_key)

        # FIX-2: web3 v6 renamed rawTransaction → raw_transaction
        try:
            raw_tx = signed.raw_transaction      # web3 v6
        except AttributeError:
            raw_tx = signed.rawTransaction       # web3 v5

        tx_hash = w3.eth.send_raw_transaction(raw_tx)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return receipt.transactionHash.hex()

    except Exception as e:
        print(f"[polygon_service] store_hash error: {e}")
        return ""


def verify_hash(entity_id: str, expected_hash: str) -> dict:
    """
    Retrieves stored hash from Polygon and compares to expected_hash.
    Returns {is_valid, stored_hash, entity_id}.
    On any error returns is_valid=False — never raises.
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
