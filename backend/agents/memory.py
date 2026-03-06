"""
agents/memory.py
----------------
PostgreSQL-backed agent memory.
Stores a per-family summary that persists across sessions.
The decision_node reads this before deciding whether to escalate.

CRITICAL: Uses synchronous SQLAlchemy — agents run in background tasks,
not inside async FastAPI request handlers. Do not use asyncpg here.
"""

import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ── DB engine ─────────────────────────────────────────────────────────────────
# Created once at module load — reused across all agent invocations
_engine = create_engine(
    os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/vaxguard"),
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,   # reconnect if connection dropped
)
_Session = sessionmaker(bind=_engine)


# ── Public API ────────────────────────────────────────────────────────────────

def load_family_memory(family_uid: str) -> str:
    """
    Returns the stored memory summary string for a family.
    Returns empty string if family has no prior memory (first-time user).
    """
    with _Session() as session:
        row = session.execute(
            text("SELECT summary FROM agent_memory WHERE family_uid = :uid"),
            {"uid": family_uid}
        ).fetchone()
        return row[0] if row else ""


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
    with _Session() as session:
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


def get_ignore_count(family_uid: str) -> int:
    """Quick helper — returns how many times family has ignored alerts."""
    with _Session() as session:
        row = session.execute(
            text("SELECT ignore_count FROM agent_memory WHERE family_uid = :uid"),
            {"uid": family_uid}
        ).fetchone()
        return row[0] if row else 0


def increment_ignore_count(family_uid: str) -> None:
    """Call this when a reminder was sent but no action taken within 48h."""
    with _Session() as session:
        session.execute(text("""
            INSERT INTO agent_memory (family_uid, summary, last_action, ignore_count, updated_at)
            VALUES (:uid, '', 'no_response', 1, :now)
            ON CONFLICT (family_uid)
            DO UPDATE SET
                ignore_count = agent_memory.ignore_count + 1,
                updated_at   = EXCLUDED.updated_at
        """), {"uid": family_uid, "now": datetime.now(timezone.utc)})
        session.commit()
