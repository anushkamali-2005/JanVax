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
import logging
import firebase_admin
import asyncio
from firebase_admin import credentials, firestore, auth
from fastapi import HTTPException, Header
from typing import Optional, Tuple, List, Any

logger = logging.getLogger("vaxguard.firebase")

_db: Any = None


# ── Init ──────────────────────────────────────────────────────────────────────

def init_firebase() -> None:
    """Call once at startup. Safe to call multiple times (checks if already init)."""
    global _db
    if not firebase_admin._apps:
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./firebase-admin-key.json")
        if not os.path.exists(cred_path):
            logger.error("Firebase credentials not found at %s", cred_path)
            # In local dev/CI, we might not have the key yet - don't crash the whole app
            return
            
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully.")
        except Exception as exc:
            logger.error("Failed to initialize Firebase: %s", exc)
            return

    _db = firestore.client()


def get_db() -> Any:
    global _db
    if _db is None:
        init_firebase()
        if _db is None:
            raise RuntimeError("Firebase not initialized. Check credentials.")
    return _db


# ── Auth ──────────────────────────────────────────────────────────────────────

async def verify_firebase_token(authorization: str = Header(...)) -> str:
    """
    FastAPI dependency. Extracts and verifies Firebase ID token.
    Usage: uid: str = Depends(verify_firebase_token)
    Returns Firebase UID string or raises 401.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split("Bearer ")[1].strip()
    try:
        # verify_id_token is a blocking network call
        loop = asyncio.get_running_loop()
        decoded = await loop.run_in_executor(None, lambda: auth.verify_id_token(token))
        return decoded["uid"]
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as exc:
        logger.warning("Auth verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Authentication failed")


# ── Internal Helpers (Async wraps for sync Firestore) ──────────────────────────

async def _run_sync(func, *args, **kwargs):
    """Helper to run blocking Firestore calls in a thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


# ── Children ──────────────────────────────────────────────────────────────────

async def get_child_doc(child_id: str) -> Optional[dict]:
    """Fetch a single child document. Returns None if not found."""
    try:
        doc = await _run_sync(get_db().collection("children").document(child_id).get)
        return doc.to_dict() if doc.exists else None
    except Exception as exc:
        logger.error("get_child_doc error for %s: %s", child_id, exc)
        return None


async def get_children_by_parent(parent_uid: str) -> List[dict]:
    """Fetch all children for a parent."""
    try:
        def _get():
            docs = get_db().collection("children") \
                           .where("parentUid", "==", parent_uid) \
                           .stream()
            return [{"id": doc.id, **doc.to_dict()} for doc in docs]
        
        return await _run_sync(_get)
    except Exception as exc:
        logger.error("get_children_by_parent error for %s: %s", parent_uid, exc)
        return []


async def get_all_children_due_today() -> List[dict]:
    """Returns all children whose nextDueDate is today or overdue."""
    from datetime import date
    today_str = date.today().isoformat()

    try:
        def _get():
            docs = get_db().collection("children") \
                           .where("nextDueDate", "<=", today_str) \
                           .stream()
            return [{"id": doc.id, **doc.to_dict()} for doc in docs]
            
        return await _run_sync(_get)
    except Exception as exc:
        logger.error("get_all_children_due_today error: %s", exc)
        return []


async def update_child_risk_score(child_id: str, risk_score: int,
                                   risk_disease: str, model_version: str) -> None:
    """Updates risk fields on child document after ML prediction."""
    try:
        await _run_sync(
            get_db().collection("children").document(child_id).update,
            {
                "riskScore":    risk_score,
                "riskDisease":  risk_disease,
                "modelVersion": model_version,
                "riskUpdatedAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as exc:
        logger.error("update_child_risk_score error for %s: %s", child_id, exc)


async def increment_reminder_ignore(child_id: str) -> None:
    """Increments reminderIgnoreCount when family ignores an alert."""
    try:
        await _run_sync(
            get_db().collection("children").document(child_id).update,
            {"reminderIgnoreCount": firestore.Increment(1)}
        )
    except Exception as exc:
        logger.error("increment_reminder_ignore error for %s: %s", child_id, exc)


# ── Vaccine Records ───────────────────────────────────────────────────────────

async def get_vaccine_records(child_id: str) -> List[dict]:
    """Returns all vaccine records for a child, ordered by dateGiven."""
    try:
        def _get():
            docs = get_db().collection("children") \
                           .document(child_id) \
                           .collection("vaccineRecords") \
                           .order_by("dateGiven") \
                           .stream()
            return [{"id": doc.id, **doc.to_dict()} for doc in docs]
            
        return await _run_sync(_get)
    except Exception as exc:
        logger.error("get_vaccine_records error for %s: %s", child_id, exc)
        return []


async def save_vaccine_record(child_id: str, record: dict) -> str:
    """Saves a vaccine record. Returns the new document ID."""
    try:
        def _save():
            ref = get_db().collection("children") \
                          .document(child_id) \
                          .collection("vaccineRecords") \
                          .document()
            ref.set({**record, "createdAt": firestore.SERVER_TIMESTAMP})
            return ref.id
            
        return await _run_sync(_save)
    except Exception as exc:
        logger.error("save_vaccine_record error for %s: %s", child_id, exc)
        return ""


async def update_record_hash(child_id: str, record_id: str,
                               polygon_hash: str, polygon_tx_id: str) -> None:
    """Updates a vaccine record with its Polygon hash after blockchain storage."""
    try:
        await _run_sync(
            get_db().collection("children") \
                    .document(child_id) \
                    .collection("vaccineRecords") \
                    .document(record_id) \
                    .update,
            {
                "polygonHash":  polygon_hash,
                "polygonTxId":  polygon_tx_id,
                "verified":     True,
            }
        )
    except Exception as exc:
        logger.error("update_record_hash error for %s/%s: %s", child_id, record_id, exc)


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user_doc(uid: str) -> Optional[dict]:
    """Fetch user document."""
    try:
        doc = await _run_sync(get_db().collection("users").document(uid).get)
        return doc.to_dict() if doc.exists else None
    except Exception as exc:
        logger.error("get_user_doc error for %s: %s", uid, exc)
        return None


async def get_user_language(uid: str) -> str:
    """Returns user's preferred language. Defaults to 'en'."""
    user = await get_user_doc(uid)
    return user.get("language", "en") if user else "en"


def get_parent_phone_and_language(parent_uid: str) -> Tuple[str, str]:
    """
    Sync version for Twilio tool.
    Returns (phone_number, language_code).
    """
    try:
        doc = get_db().collection("users").document(parent_uid).get()
        if doc.exists:
            data = doc.to_dict()
            return data.get("phone", ""), data.get("language", "en")
        return "", "en"
    except Exception as exc:
        logger.error("get_parent_phone_and_language error for %s: %s", parent_uid, exc)
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
    except Exception as exc:
        logger.error("get_parent_push_token error for %s: %s", parent_uid, exc)
        return None


def get_doctor_phone_for_family(parent_uid: str) -> Optional[str]:
    """Returns doctor's phone number if family has a registered doctor."""
    try:
        docs = get_db().collection("users") \
                       .where("role", "==", "doctor") \
                       .where("linkedFamilies", "array_contains", parent_uid) \
                       .limit(1) \
                       .stream()
        for doc in docs:
            return doc.to_dict().get("phone")
        return None
    except Exception as exc:
        logger.error("get_doctor_phone_for_family error for %s: %s", parent_uid, exc)
        return None


# ── Community Stats ───────────────────────────────────────────────────────────

async def get_all_districts_coverage() -> List[dict]:
    """Returns all community stats documents."""
    try:
        def _get():
            docs = get_db().collection("communityStats").stream()
            return [doc.to_dict() for doc in docs]
        return await _run_sync(_get)
    except Exception as exc:
        logger.error("get_all_districts_coverage error: %s", exc)
        return []


async def update_community_stats(district_slug: str, stats: dict) -> None:
    """Writes aggregated district stats."""
    try:
        await _run_sync(
            get_db().collection("communityStats").document(district_slug).set,
            {
                **stats,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as exc:
        logger.error("update_community_stats error for %s: %s", district_slug, exc)
