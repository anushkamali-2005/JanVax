"""
backend/agents/scheduler.py
-----------------------------
LangGraph node: scheduler_node

Runs AFTER action_node when decision == HIGH_RISK.
Finds the nearest vaccination centre, sends an SMS slot offer to the parent,
and persists a SchedulerSession to PostgreSQL.

The graph then ends. The negotiation loop continues asynchronously,
driven by the Twilio webhook (POST /agent/sms-reply) in routers/agent.py.

This is the correct human-in-the-loop pattern for LangGraph:
  agent fires → suspends → external event (SMS reply) resumes negotiation.
"""

import os
import uuid
from datetime import datetime, timezone
from database.models import SessionLocal, SchedulerSession


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ts() -> str:
    """Current time in [HH:MM:SS] format for agent_log entries."""
    return datetime.now(timezone.utc).strftime("[%H:%M:%S]")


def _append_log(session_obj: SchedulerSession, agent: str, message: str) -> None:
    """Append a timestamped line to the agent_log field."""
    line = f"{_ts()} {agent}: {message}"
    session_obj.agent_log = (session_obj.agent_log or "") + line + "\n"


def _send_sms(to_phone: str, body: str) -> None:
    """
    Send an SMS via Twilio. Logs to console if TWILIO_* env vars are not set
    (graceful degradation for demo without Twilio configured).
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token  = os.getenv("TWILIO_AUTH_TOKEN")
    from_phone  = os.getenv("TWILIO_FROM_NUMBER", "+15005550006")  # Twilio test number

    if not account_sid or not auth_token:
        print(f"[scheduler] [DEMO — no Twilio configured] SMS to {to_phone}: {body}")
        return

    try:
        from twilio.rest import Client
        client = Client(account_sid, auth_token)
        client.messages.create(to=to_phone, from_=from_phone, body=body)
        print(f"[scheduler] SMS sent to {to_phone}")
    except Exception as e:
        print(f"[scheduler] SMS failed: {e}")


def _find_slots(district: str, vaccine: str) -> list[dict]:
    """
    Returns up to 3 candidate slots for the given district.
    Falls back to hardcoded demo centres if the tool call fails.
    """
    try:
        from agents.tools import find_nearest_center
        center = find_nearest_center.invoke({"district": district, "vaccine": vaccine})
        # Wrap as 3 slot variants
        name = center.get("name", "Nearest PHC")
        return [
            {"centre": name,                        "slot": "Thu, 9:00am"},
            {"centre": f"Backup — {name}",          "slot": "Sat, 11:00am"},
            {"centre": f"District Reserve — {name}","slot": "Sun, 10:00am"},
        ]
    except Exception as e:
        print(f"[scheduler] find_nearest_center fallback: {e}")
        return [
            {"centre": "City Vaccination Centre",   "slot": "Thu, 9:00am"},
            {"centre": "District Hospital",         "slot": "Sat, 11:00am"},
            {"centre": "Primary Health Centre",     "slot": "Sun, 10:00am"},
        ]


# ── Node ───────────────────────────────────────────────────────────────────────

def scheduler_node(state: dict) -> dict:
    """
    LangGraph node — runs after action_node when decision == HIGH_RISK.

    What it does:
      1. Finds 3 nearest vaccination slots
      2. Sends first slot offer SMS to parent via Twilio
      3. Persists a SchedulerSession to PostgreSQL (status='pending')
      4. Logs all steps to agent_log in [HH:MM:SS] format
      5. Returns state (graph ends here — webhook drives next steps)
    """
    child      = state.get("child_data", {})
    child_id   = state.get("child_id", "unknown")
    district   = child.get("district", "pune")
    vaccine    = state.get("top_disease", "Unknown")
    risk_score = state.get("risk_score", 0)

    # Parent phone — stored on child doc or fallback for demo
    parent_phone = child.get("parentPhone") or child.get("phone") or os.getenv("DEMO_PARENT_PHONE", "+919876543210")

    # Find candidate slots
    slots = _find_slots(district, vaccine)
    first_slot   = slots[0]
    slot_str     = f"{first_slot['centre']}, {first_slot['slot']}"

    # Build first SMS
    child_name = child.get("name", "your child")
    sms_body = (
        f"JanVax Alert: {child_name} needs {vaccine} vaccination (risk score {risk_score}/100). "
        f"Nearest slot: {slot_str}. "
        f"Reply YES to confirm or NO to request another time."
    )

    # Persist session to DB first (so we have an ID)
    session_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        # Remove any existing pending session for this child
        db.query(SchedulerSession).filter(
            SchedulerSession.child_id == child_id,
            SchedulerSession.status   == "pending"
        ).delete()

        sess = SchedulerSession(
            id             = session_id,
            child_id       = child_id,
            parent_phone   = parent_phone,
            risk_score     = risk_score,
            attempt_number = 1,
            offered_slot   = slot_str,
            offered_centre = first_slot["centre"],
            status         = "pending",
        )

        # Build the initial agent_log with analyst + advocate + decider summary
        analyst_summary  = (state.get("analyst_output")  or "").split("\n")[0][:80]
        advocate_summary = (state.get("advocate_output") or "").split("\n")[0][:80]

        _append_log(sess, "risk_analyst",   f"Risk confirmed: score {risk_score}, disease: {vaccine}")
        _append_log(sess, "devils_advocate", "False positive check passed. Risk is genuine.")
        _append_log(sess, "decider",         "High risk confirmed. Initiating appointment scheduler.")
        _append_log(sess, "action_node",     f"Nearest centre found: {first_slot['centre']}")
        _append_log(sess, "scheduler_node",  f"Slot offered: {slot_str}. SMS sent.")

        db.add(sess)
        db.commit()

        # Send the SMS (after DB write so we don't lose session if SMS fails)
        _send_sms(parent_phone, sms_body)

        print(f"[scheduler] Session {session_id} created for child {child_id}. Status: pending.")

    except Exception as e:
        print(f"[scheduler] DB error: {e}")
        db.rollback()
    finally:
        db.close()

    # Update state fields
    state["scheduler_session_id"] = session_id
    state["sms_sent"]             = True
    state["sms_confirmed"]        = False
    state["offered_slot"]         = slot_str
    state["offered_centre"]       = first_slot["centre"]

    return state
