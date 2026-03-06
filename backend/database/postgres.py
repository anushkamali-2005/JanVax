"""
backend/database/postgres.py
------------------------------
Async SQLAlchemy engine + session for FastAPI routes.
Sync engine lives in agents/memory.py (for LangGraph nodes).

CRITICAL: Use get_session() in async FastAPI routes only.
CRITICAL: agents/memory.py has its own SYNC engine — do not use this there.
CRITICAL: Run create_tables() once at startup or via migration.
"""

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

load_dotenv()

# Convert postgres:// to postgresql+asyncpg:// for async driver
_raw_url = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/vaxguard")
ASYNC_URL = _raw_url.replace("postgresql://", "postgresql+asyncpg://") \
                    .replace("postgres://",    "postgresql+asyncpg://")

# CRITICAL: Supabase transaction bouncer (port 6543) requires prepared_statement_cache_size=0 and often SSL
if ".supabase.co" in ASYNC_URL:
    sep = "&" if "?" in ASYNC_URL else "?"
    if "ssl=" not in ASYNC_URL and "sslmode=" not in ASYNC_URL:
        # asyncpg uses 'ssl', not 'sslmode'
        ASYNC_URL += f"{sep}ssl=require"
    if ":6543" in ASYNC_URL and "prepared_statement_cache_size" not in ASYNC_URL:
        sep = "&" if "?" in ASYNC_URL else "?"
        ASYNC_URL += f"{sep}prepared_statement_cache_size=0"

_engine = create_async_engine(
    ASYNC_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

_SessionFactory = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@asynccontextmanager
async def get_session():
    """
    Async context manager for database sessions.
    Usage:
        async with get_session() as session:
            await session.execute(text("SELECT 1"))
    """
    async with _SessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def create_tables():
    """
    Creates all tables if they don't exist.
    Call this at startup or use Alembic migrations.
    """
    statements = [
        """
        CREATE TABLE IF NOT EXISTS ai_predictions (
            id              SERIAL PRIMARY KEY,
            child_id        VARCHAR(128) NOT NULL,
            parent_uid      VARCHAR(128) NOT NULL,
            model_version   VARCHAR(32)  NOT NULL,
            risk_score      INTEGER      NOT NULL,
            risk_disease    VARCHAR(64),
            shap_values     JSONB        NOT NULL DEFAULT '{}',
            input_features  JSONB        NOT NULL DEFAULT '{}',
            counterfactuals JSONB,
            nl_explanation  TEXT,
            record_hash     VARCHAR(64)  NOT NULL DEFAULT '',
            polygon_tx_id   VARCHAR(128),
            created_at      TIMESTAMPTZ  DEFAULT NOW()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_predictions_child ON ai_predictions(child_id);",
        "CREATE INDEX IF NOT EXISTS idx_predictions_hash ON ai_predictions(record_hash);",
        """
        CREATE TABLE IF NOT EXISTS agent_decisions (
            id              SERIAL PRIMARY KEY,
            child_id        VARCHAR(128) NOT NULL,
            prediction_id   INTEGER REFERENCES ai_predictions(id) ON DELETE SET NULL,
            analyst_output  TEXT         NOT NULL DEFAULT '',
            advocate_output TEXT         NOT NULL DEFAULT '',
            decision        VARCHAR(32)  NOT NULL,
            actions_taken   JSONB        NOT NULL DEFAULT '{}',
            debate_log      JSONB        NOT NULL DEFAULT '[]',
            record_hash     VARCHAR(64)  NOT NULL DEFAULT '',
            polygon_tx_id   VARCHAR(128),
            created_at      TIMESTAMPTZ  DEFAULT NOW()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_decisions_child ON agent_decisions(child_id);",
        """
        CREATE TABLE IF NOT EXISTS agent_memory (
            id              SERIAL PRIMARY KEY,
            family_uid      VARCHAR(128) NOT NULL UNIQUE,
            summary         TEXT         NOT NULL DEFAULT '',
            last_action     VARCHAR(64),
            ignore_count    INTEGER      DEFAULT 0,
            escalate_direct BOOLEAN      DEFAULT FALSE,
            updated_at      TIMESTAMPTZ  DEFAULT NOW()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_memory_family ON agent_memory(family_uid);",
        """
        CREATE TABLE IF NOT EXISTS audit_hashes (
            id              SERIAL PRIMARY KEY,
            entity_type     VARCHAR(32)  NOT NULL,
            entity_id       VARCHAR(128) NOT NULL,
            record_hash     VARCHAR(64)  NOT NULL,
            polygon_tx_id   VARCHAR(128),
            polygon_block   INTEGER,
            is_verified     BOOLEAN      DEFAULT FALSE,
            created_at      TIMESTAMPTZ  DEFAULT NOW(),
            UNIQUE(record_hash)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_audit_hash ON audit_hashes(record_hash);"
    ]

    async with _engine.begin() as conn:
        for stmt in statements:
            await conn.execute(text(stmt))
    print("[db] Tables created / verified.")
