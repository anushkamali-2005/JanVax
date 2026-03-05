"""
backend/services/firebase_service.py
--------------------------------------
All Firebase Admin SDK operations.
Firestore reads/writes + Auth token verification.

CRITICAL: init_firebase() must be called once at FastAPI startup (main.py lifespan).
CRITICAL: verify_firebase_token is a FastAPI Depends() — extracts uid from Bearer token.
CRITICAL: All Firestore calls are sync (firebase-admin SDK is not async).
          Wrap in run_in_executor if called from async routes.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore, auth
from fastapi import HTTPException, Header
from typing import Optional, Tuple
from functools import lru_cache

_db = None


# ── Init ──────────────────────────────────────────────────────────────────────

def init_firebase():
    """Call once at startup. Safe to call multiple times (checks if already init)."""
    global _db
    if not firebase_admin._apps:
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-admin-key.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    _db = firestore.client()


def get_db():
    global _db
    if _db is None:
        raise RuntimeError("Firebase not initialized. Call init_firebase() at startup.")
    return _db


# ── Auth ──────────────────────────────────────────────────────────────────────

async def verify_firebase_token(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency. Extracts and verifies Firebase ID token.
    Usage: uid: str = Depends(verify_firebase_token)
    Returns Firebase UID string.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split("Bearer ")[1].strip()
    try:
        decoded = auth.verify_id_token(token)
        return decoded["uid"]
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")


# ── Children ──────────────────────────────────────────────────────────────────

async def get_child_doc(child_id: str) -> Optional[dict]:
    """Fetch a single child document. Returns None if not found."""
    try:
        doc = get_db().collection("children").document(child_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        print(f"[firebase] get_child_doc error: {e}")
        return None


async def get_children_by_parent(parent_uid: str) -> list:
    """Fetch all children for a parent. Used by reminder scheduler."""
    try:
        docs = get_db().collection("children") \
                       .where("parentUid", "==", parent_uid) \
                       .stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    except Exception as e:
        print(f"[firebase] get_children_by_parent error: {e}")
        return []


async def get_all_children_due_today() -> list:
    """
    Returns all children whose nextDueDate is today or overdue.
    Called by APScheduler reminder job every morning at 8 AM.
    """
    from datetime import date
    today_str = date.today().isoformat()   # "2024-03-15"

    try:
        docs = get_db().collection("children") \
                       .where("nextDueDate", "<=", today_str) \
                       .stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    except Exception as e:
        print(f"[firebase] get_all_children_due_today error: {e}")
        return []


async def update_child_risk_score(child_id: str, risk_score: int,
                                   risk_disease: str, model_version: str):
    """Updates risk fields on child document after ML prediction."""
    try:
        get_db().collection("children").document(child_id).update({
            "riskScore":    risk_score,
            "riskDisease":  risk_disease,
            "modelVersion": model_version,
            "riskUpdatedAt": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        print(f"[firebase] update_child_risk_score error: {e}")


async def increment_reminder_ignore(child_id: str):
    """Increments reminderIgnoreCount when family ignores an alert."""
    try:
        get_db().collection("children").document(child_id).update({
            "reminderIgnoreCount": firestore.Increment(1)
        })
    except Exception as e:
        print(f"[firebase] increment_reminder_ignore error: {e}")


# ── Vaccine Records ───────────────────────────────────────────────────────────

async def get_vaccine_records(child_id: str) -> list:
    """Returns all vaccine records for a child, ordered by dateGiven."""
    try:
        docs = get_db().collection("children") \
                       .document(child_id) \
                       .collection("vaccineRecords") \
                       .order_by("dateGiven") \
                       .stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    except Exception as e:
        print(f"[firebase] get_vaccine_records error: {e}")
        return []


async def save_vaccine_record(child_id: str, record: dict) -> str:
    """Saves a vaccine record. Returns the new document ID."""
    try:
        ref = get_db().collection("children") \
                      .document(child_id) \
                      .collection("vaccineRecords") \
                      .document()
        ref.set({**record, "createdAt": firestore.SERVER_TIMESTAMP})
        return ref.id
    except Exception as e:
        print(f"[firebase] save_vaccine_record error: {e}")
        return ""


async def update_record_hash(child_id: str, record_id: str,
                              polygon_hash: str, polygon_tx_id: str):
    """Updates a vaccine record with its Polygon hash after blockchain storage."""
    try:
        get_db().collection("children") \
                .document(child_id) \
                .collection("vaccineRecords") \
                .document(record_id) \
                .update({
                    "polygonHash":  polygon_hash,
                    "polygonTxId":  polygon_tx_id,
                    "verified":     True,
                })
    except Exception as e:
        print(f"[firebase] update_record_hash error: {e}")


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user_doc(uid: str) -> Optional[dict]:
    """Fetch user document."""
    try:
        doc = get_db().collection("users").document(uid).get()
        return doc.to_dict() if doc.exists else None
    except Exception as e:
        print(f"[firebase] get_user_doc error: {e}")
        return None


async def get_user_language(uid: str) -> str:
    """Returns user's preferred language. Defaults to 'en'."""
    user = await get_user_doc(uid)
    return user.get("language", "en") if user else "en"


def get_parent_phone_and_language(parent_uid: str) -> Tuple[str, str]:
    """
    Sync version for Twilio tool (called from LangChain tool, not async context).
    Returns (phone_number, language_code).
    """
    try:
        doc = get_db().collection("users").document(parent_uid).get()
        if doc.exists:
            data = doc.to_dict()
            return data.get("phone", ""), data.get("language", "en")
        return "", "en"
    except Exception as e:
        print(f"[firebase] get_parent_phone_and_language error: {e}")
        return "", "en"


def get_parent_push_token(parent_uid: str) -> Optional[str]:
    """
    Sync version for push tool.
    Returns push subscription JSON string or None.
    """
    try:
        doc = get_db().collection("users").document(parent_uid).get()
        if doc.exists:
            return doc.to_dict().get("pushToken")
        return None
    except Exception as e:
        print(f"[firebase] get_parent_push_token error: {e}")
        return None


def get_doctor_phone_for_family(parent_uid: str) -> Optional[str]:
    """
    Returns doctor's phone number if family has a registered doctor.
    Looks for users with role='doctor' linked to this family.
    Returns None if no doctor registered.
    """
    try:
        docs = get_db().collection("users") \
                       .where("role", "==", "doctor") \
                       .where("linkedFamilies", "array_contains", parent_uid) \
                       .limit(1) \
                       .stream()
        for doc in docs:
            return doc.to_dict().get("phone")
        return None
    except Exception as e:
        print(f"[firebase] get_doctor_phone_for_family error: {e}")
        return None


# ── Community Stats ───────────────────────────────────────────────────────────

async def get_all_districts_coverage() -> list:
    """
    Returns all community stats documents for the D3 herd immunity map.
    Written by FastAPI aggregation job, read here.
    """
    try:
        docs = get_db().collection("communityStats").stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"[firebase] get_all_districts_coverage error: {e}")
        return []


async def update_community_stats(district_slug: str, stats: dict):
    """Writes aggregated district stats. Called by community aggregation job."""
    try:
        get_db().collection("communityStats").document(district_slug).set({
            **stats,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
    except Exception as e:
        print(f"[firebase] update_community_stats error: {e}")
