"""
backend/agents/memory.py
-------------------------
PostgreSQL-backed agent memory.
Stores a per-family summary that persists across sessions.
The decision_node reads this before deciding whether to escalate.

CRITICAL: Uses synchronous SQLAlchemy — agents run in background tasks/threads,
          not inside async FastAPI request handlers. Do not use asyncpg here.
"""

import os
import logging
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger("vaxguard.agent.memory")

# ── DB engine ─────────────────────────────────────────────────────────────────

_engine = None
_Session = None

def _get_session():
    """Lazily creates engine and sessionmaker."""
    global _engine, _Session
    if _Session is not None:
        return _Session()
        
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/vaxguard")
    # SQLAlchemy sync engine needs postgresql:// protocol
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
        
    try:
        _engine = create_engine(
            db_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
        )
        _Session = sessionmaker(bind=_engine)
        logger.info("Agent memory database connected.")
        return _Session()
    except Exception as exc:
        logger.error("Failed to connect to agent memory database: %s", exc)
        raise


# ── Public API ────────────────────────────────────────────────────────────────

def load_family_memory(family_uid: str) -> str:
    """
    Returns the stored memory summary string for a family.
    Returns empty string if family has no prior memory (first-time user).
    """
    try:
        with _get_session() as session:
            row = session.execute(
                text("SELECT summary FROM agent_memory WHERE family_uid = :uid"),
                {"uid": family_uid}
            ).fetchone()
            return row[0] if row else ""
    except Exception as exc:
        logger.error("load_family_memory error for %s: %s", family_uid, exc)
        return ""


def save_family_memory(
    family_uid:      str,
    summary:         str,
    last_action:     str,
    ignore_count:    int  = 0,
    escalate_direct: bool = False,
) -> None:
    """
    Upserts agent memory for a family.
    On conflict (family already exists) → updates summary and metadata.
    """
    try:
        with _get_session() as session:
            session.execute(text("""
                INSERT INTO agent_memory
                    (family_uid, summary, last_action, ignore_count, escalate_direct, updated_at)
                VALUES
                    (:uid, :summary, :last_action, :ignore_count, :escalate_direct, :now)
                ON CONFLICT (family_uid)
                DO UPDATE SET
                    summary         = EXCLUDED.summary,
                    last_action     = EXCLUDED.last_action,
                    ignore_count    = EXCLUDED.ignore_count,
                    escalate_direct = EXCLUDED.escalate_direct,
                    updated_at      = EXCLUDED.updated_at
            """), {
                "uid":             family_uid,
                "summary":         summary,
                "last_action":     last_action,
                "ignore_count":    ignore_count,
                "escalate_direct": escalate_direct,
                "now":             datetime.now(timezone.utc),
            })
            session.commit()
            logger.info("Agent memory updated for family: %s", family_uid)
    except Exception as exc:
        logger.error("save_family_memory error for %s: %s", family_uid, exc)


def get_ignore_count(family_uid: str) -> int:
    """Quick helper — returns how many times family has ignored alerts."""
    try:
        with _get_session() as session:
            row = session.execute(
                text("SELECT ignore_count FROM agent_memory WHERE family_uid = :uid"),
                {"uid": family_uid}
            ).fetchone()
            return row[0] if row else 0
    except Exception as exc:
        logger.error("get_ignore_count error for %s: %s", family_uid, exc)
        return 0


def increment_ignore_count(family_uid: str) -> None:
    """Call this when a reminder was sent but no action taken within 48h."""
    try:
        with _get_session() as session:
            session.execute(text("""
                INSERT INTO agent_memory (family_uid, summary, last_action, ignore_count, updated_at)
                VALUES (:uid, '', 'no_response', 1, :now)
                ON CONFLICT (family_uid)
                DO UPDATE SET
                    ignore_count = agent_memory.ignore_count + 1,
                    updated_at   = EXCLUDED.updated_at
            """), {"uid": family_uid, "now": datetime.now(timezone.utc)})
            session.commit()
            logger.info("Ignore count incremented for family: %s", family_uid)
    except Exception as exc:
        logger.error("increment_ignore_count error for %s: %s", family_uid, exc)
