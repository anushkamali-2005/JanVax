"""
backend/routers/verify.py
--------------------------
POST /verify/hash  — hash a record + store on Polygon
GET  /verify/{hash} — public endpoint, verify hash against Polygon

CRITICAL: GET /verify/{hash} has NO auth — school/hospital scans QR without login.
CRITICAL: Also store in PostgreSQL audit_hashes for the audit dashboard.
"""

import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from services.polygon_service import store_hash, verify_hash, compute_hash
from services.firebase_service import verify_firebase_token, get_vaccine_records
from database.postgres import get_session

logger = logging.getLogger("vaxguard.verify")

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class StoreHashRequest(BaseModel):
    record_json:  dict
    entity_type:  str   # "vaccine_record" | "prediction" | "decision"
    entity_id:    str


# ── POST /verify/hash ─────────────────────────────────────────────────────────

@router.post("/verify/hash")
async def hash_and_store(
    req: StoreHashRequest,
    uid: str = Depends(verify_firebase_token),
):
    """
    Computes SHA-256 hash of record_json and stores on Polygon.
    Also writes to PostgreSQL audit_hashes table.
    Returns hash + Polygon transaction ID.
    """
    record_hash = compute_hash(req.record_json)

    # Check if already stored (idempotent)
    async with get_session() as session:
        existing = await session.execute(
            text("SELECT polygon_tx_id FROM audit_hashes WHERE record_hash = :hash"),
            {"hash": record_hash}
        )
        row = existing.fetchone()
        if row and row[0]:
            return {
                "hash":          record_hash,
                "polygon_tx_id": row[0],
                "already_stored": True,
            }

    # Store on Polygon
    tx_id = await store_hash(
        record_json=req.record_json,
        entity_type=req.entity_type,
        entity_id=req.entity_id,
    )

    # Save to PostgreSQL audit table
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

    logger.info("Record hash stored: %s (Entity: %s)", record_hash[:8], req.entity_id)
    return {
        "hash":           record_hash,
        "polygon_tx_id":  tx_id or None,
        "stored_at":      datetime.now(timezone.utc).isoformat(),
        "already_stored": False,
    }


# ── GET /verify/{hash} ────────────────────────────────────────────────────────

@router.get("/verify/{record_hash}")
async def verify_record(record_hash: str):
    """
    PUBLIC — no auth required.
    Verifies a SHA-256 hash against Polygon.
    Also returns original record from PostgreSQL audit table.
    Used by /verify/[childId] page and QR passport scan.
    """
    # Fetch from our PostgreSQL first (for original_record + entity info)
    async with get_session() as session:
        row = await session.execute(text("""
            SELECT entity_type, entity_id, polygon_tx_id, is_verified, created_at
            FROM audit_hashes
            WHERE record_hash = :hash
        """), {"hash": record_hash})
        audit = row.fetchone()

    if not audit:
        logger.warning("Verification request for unknown hash: %s", record_hash)
        raise HTTPException(
            status_code=404,
            detail="Hash not found. This record may not have been verified on blockchain."
        )

    entity_type, entity_id, polygon_tx_id, is_verified, created_at = audit

    # Re-verify against Polygon in real time (blocking Web3 call, so wrap in thread)
    polygon_result = await asyncio.to_thread(verify_hash, entity_id=entity_id, expected_hash=record_hash)

    return {
        "is_valid":      polygon_result.get("is_valid", False),
        "hash":          record_hash,
        "polygon_tx_id": polygon_tx_id,
        "entity_type":   entity_type,
        "entity_id":     entity_id,
        "stored_at":     created_at.isoformat() if created_at else None,
    }


# ── GET /verify/child/{child_id} ──────────────────────────────────────────────

@router.get("/verify/child/{child_id}")
async def verify_child_records(child_id: str):
    """
    PUBLIC — no auth.
    Returns all verified vaccine records for a child.
    Called by /verify/[childId] QR scan page.
    """
    records = await get_vaccine_records(child_id)

    verified_records = []
    # Verify records in parallel or sequence? 
    # For a few records, sequential is fine but let's wrap etc.
    for record in records:
        polygon_hash = record.get("polygonHash", "")
        is_verified  = False

        if polygon_hash:
            # Wrap blocking call
            result      = await asyncio.to_thread(verify_hash, entity_id=record.get("id", ""), expected_hash=polygon_hash)
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
