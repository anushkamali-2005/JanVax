"""
backend/database/models.py
---------------------------
SQLAlchemy ORM models for sync access from agent nodes and scripts.
Uses the same sync engine defined in agents/memory.py.

CRITICAL: This file is for SYNC access only (agent nodes + scripts).
          Async FastAPI routes should use database/postgres.py + raw SQL.
"""

import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, String, Integer, Text, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

# Sync engine — same pattern as memory.py
# Supabase PgBouncer (port 6543) needs sslmode via connect_args for psycopg2
_raw_url = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/vaxguard")
# Strip any existing sslmode from URL to avoid conflicts
_db_url   = _raw_url.split("?")[0]

engine = create_engine(
    _db_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args={"sslmode": "require"},
)
SessionLocal = sessionmaker(bind=engine)


class SchedulerSession(Base):
    """
    Persists one negotiation session per child.
    Created by scheduler_node when it sends the first SMS slot offer.
    Updated by the Twilio webhook (sms-reply) on each parent reply.
    """
    __tablename__ = "scheduler_sessions"

    id             = Column(String(64),  primary_key=True)
    child_id       = Column(String(128), nullable=False, index=True)
    parent_phone   = Column(String(32),  nullable=False)
    risk_score     = Column(Integer,     default=0)
    attempt_number = Column(Integer,     default=1)
    offered_slot   = Column(Text,        nullable=True)   # human-readable slot
    offered_centre = Column(Text,        nullable=True)   # centre name
    status         = Column(String(32),  default="pending")  # pending | confirmed | escalated | failed
    confirmed_slot = Column(Text,        nullable=True)
    agent_log      = Column(Text,        default="")       # newline-separated timestamped log
    created_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
