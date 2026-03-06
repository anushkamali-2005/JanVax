"""
backend/routers/verify.py
--------------------------
POST /verify/hash              — hash a record + store on Polygon (auth required)
GET  /verify/child/{child_id}  — all verified records for a child (public, no auth)
GET  /verify/{record_hash}     — verify a single hash against Polygon (public)

BUGS FIXED vs original:
  FIX-1  ROUTE ORDER: /verify/{record_hash} was registered BEFORE
         /verify/child/{child_id}. FastAPI matches routes top-to-bottom,
         so the string "child" was being captured as record_hash.
         Fixed: /verify/child/{child_id} is now registered FIRST.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from services.polygon_service import store_hash, verify_hash, compute_hash
from services.firebase_service import verify_firebase_token, get_vaccine_records
from database.postgres import get_session

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class StoreHashRequest(BaseModel):
    record_json: dict
    entity_type: str   # "vaccine_record" | "prediction" | "decision"
    entity_id:   str


# ── POST /verify/hash ─────────────────────────────────────────────────────────

@router.post("/verify/hash")
async def hash_and_store(
    req: StoreHashRequest,
    uid: str = Depends(verify_firebase_token),
):
    """
    Computes SHA-256 hash of record_json and stores on Polygon.
    Idempotent — returns existing tx_id if already stored.
    """
    record_hash = compute_hash(req.record_json)

    # Check if already stored
    async with get_session() as session:
        existing = await session.execute(
            text("SELECT polygon_tx_id FROM audit_hashes WHERE record_hash = :hash"),
            {"hash": record_hash}
        )
        row = existing.fetchone()
        if row and row[0]:
            return {
                "hash":           record_hash,
                "polygon_tx_id":  row[0],
                "already_stored": True,
            }

    # Store on Polygon
    tx_id = await store_hash(
        record_json=req.record_json,
        entity_type=req.entity_type,
        entity_id=req.entity_id,
    )

    # Save to audit table
    async with get_session() as session:
        await session.execute(text("""
            INSERT INTO audit_hashes
                (entity_type, entity_id, record_hash, polygon_tx_id, is_verified)
            VALUES
                (:entity_type, :entity_id, :hash, :tx_id, :verified)
            ON CONFLICT (record_hash) DO UPDATE SET
                polygon_tx_id = EXCLUDED.polygon_tx_id,
                is_verified   = EXCLUDED.is_verified
        """), {
            "entity_type": req.entity_type,
            "entity_id":   req.entity_id,
            "hash":        record_hash,
            "tx_id":       tx_id or None,
            "verified":    bool(tx_id),
        })
        await session.commit()

    return {
        "hash":           record_hash,
        "polygon_tx_id":  tx_id or None,
        "stored_at":      datetime.now(timezone.utc).isoformat(),
        "already_stored": False,
    }


# ── GET /verify/child/{child_id} — MUST come before /verify/{record_hash} ─────
# FIX-1: This route is now registered FIRST so FastAPI doesn't swallow "child"
#         as a record_hash value.

@router.get("/verify/child/{child_id}")
async def verify_child_records(child_id: str):
    """
    PUBLIC — no auth required.
    Returns all vaccine records for a child with live Polygon verification status.
    Called by the /verify/[childId] QR scan page.
    """
    records = await get_vaccine_records(child_id)

    verified_records = []
    for record in records:
        polygon_hash = record.get("polygonHash", "")
        is_verified  = False

        if polygon_hash:
            result      = verify_hash(entity_id=record.get("id", ""), expected_hash=polygon_hash)
            is_verified = result.get("is_valid", False)

        verified_records.append({
            **record,
            "isVerified":  is_verified,
            "polygonHash": polygon_hash,
        })

    return {
        "child_id": child_id,
        "records":  verified_records,
        "total":    len(verified_records),
    }


# ── GET /verify/{record_hash} — registered AFTER /verify/child/{child_id} ─────

@router.get("/verify/{record_hash}")
async def verify_record(record_hash: str):
    """
    PUBLIC — no auth required.
    Verifies a SHA-256 hash against Polygon in real time.
    Used by QR passport scan and the /audit dashboard.
    """
    async with get_session() as session:
        row = await session.execute(text("""
            SELECT entity_type, entity_id, polygon_tx_id, is_verified, created_at
            FROM audit_hashes
            WHERE record_hash = :hash
        """), {"hash": record_hash})
        audit = row.fetchone()

    if not audit:
        raise HTTPException(
            status_code=404,
            detail="Hash not found. This record may not have been verified on blockchain."
        )

    entity_type, entity_id, polygon_tx_id, is_verified, created_at = audit

    # Live re-verification against Polygon
    polygon_result = verify_hash(entity_id=entity_id, expected_hash=record_hash)

    return {
        "is_valid":      polygon_result.get("is_valid", False),
        "hash":          record_hash,
        "polygon_tx_id": polygon_tx_id,
        "entity_type":   entity_type,
        "entity_id":     entity_id,
        "stored_at":     created_at.isoformat() if created_at else None,
    }
