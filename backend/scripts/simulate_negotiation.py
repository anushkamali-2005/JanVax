# backend/scripts/simulate_negotiation.py
# Run this BEFORE the demo to seed a realistic negotiation session.
# The AgentFeed component will animate it live on screen.
#
# Usage:
#   cd backend && source venv/bin/activate
#   python scripts/simulate_negotiation.py demo-child-001
#
# Then open: http://localhost:3000/child/demo-child-001

import uuid
import sys
import os
from pathlib import Path

# Add backend root to path so 'database' package resolves
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env so DATABASE_URL is available before SQLAlchemy connects
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # dotenv not installed — DATABASE_URL must be set in shell

from database.models import SessionLocal, SchedulerSession, Base, engine

Base.metadata.create_all(bind=engine)

CHILD_ID     = sys.argv[1] if len(sys.argv) > 1 else 'demo-child-001'
PARENT_PHONE = '+919876543210'

# The full negotiation log — looks exactly like real agent output
DEMO_LOG = (
    "[14:22:01] risk_analyst: MMR risk confirmed: score 78, district outbreak flag active\n"
    "[14:22:02] devils_advocate: False positive check passed. Risk is genuine.\n"
    "[14:22:03] decider: High risk confirmed. Initiating appointment scheduler.\n"
    "[14:22:04] action_node: Nearest centre found: Pune Civil Hospital, 2.1km\n"
    "[14:22:05] scheduler_node: Slot offered: Pune Civil Hospital, Thu 14 Mar, 9:00am. SMS sent.\n"
    "[14:22:18] parent_reply: \"Thursday doesn't work, I have a shift.\" → no\n"
    "[14:22:19] scheduler_node: Rescheduling. Finding next available slot...\n"
    "[14:22:20] scheduler_node: New slot offered: Sassoon Hospital, Sat 16 Mar, 11:00am. SMS sent.\n"
    "[14:22:35] parent_reply: \"Saturday works.\" → yes\n"
    "[14:22:36] scheduler_node: Appointment confirmed. Reminder scheduled for Fri 15 Mar 8pm.\n"
    "[14:22:36] scheduler_node: Doctor notified. CoWIN form pre-filled.\n"
)

db = SessionLocal()

# Remove any existing session for this child
deleted = db.query(SchedulerSession).filter(SchedulerSession.child_id == CHILD_ID).delete()
if deleted:
    print(f"Removed {deleted} existing session(s) for child {CHILD_ID}")

session = SchedulerSession(
    id             = str(uuid.uuid4()),
    child_id       = CHILD_ID,
    parent_phone   = PARENT_PHONE,
    risk_score     = 78,
    attempt_number = 2,
    offered_slot   = 'Sassoon Hospital, Sat 16 Mar, 11:00am',
    offered_centre = 'Sassoon Hospital',
    status         = 'confirmed',
    confirmed_slot = 'Sassoon Hospital, Sat 16 Mar, 11:00am',
    agent_log      = DEMO_LOG,
)

db.add(session)
db.commit()
db.close()

print(f"✅ Demo session seeded for child '{CHILD_ID}'.")
print(f"   Open http://localhost:3000/child/{CHILD_ID} to see the AgentFeed animate.")
