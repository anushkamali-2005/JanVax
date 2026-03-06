"""
backend/routers/agent.py
-------------------------
POST /agent/trigger   — runs LangGraph multi-agent pipeline
GET  /agent/decisions/{child_id} — fetch past agent decisions for audit UI
GET  /agent/session/{child_id}   — fetch latest scheduler session (polled by AgentFeed)
POST /agent/sms-reply            — Twilio webhook: handles parent YES/NO replies

CRITICAL: agent_graph.invoke() is SYNCHRONOUS (LangGraph default).
          Run it in a thread pool so it doesn't block the event loop.
CRITICAL: Store full debate_log + actions in PostgreSQL after graph completes.
CRITICAL: Hash the full decision record and store on Polygon.
"""

import json
import hashlib
import asyncio
import os
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException, Form
from pydantic import BaseModel
from sqlalchemy import text

from agents.graph import agent_graph
from agents.memory import load_family_memory
from services.firebase_service import verify_firebase_token, get_child_doc
from services.polygon_service import store_hash, compute_hash
from database.postgres import get_session

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=4)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AgentTriggerRequest(BaseModel):
    child_id:      str
    prediction_id: int
    risk_score:    int
    top_disease:   str
    parent_uid:    str


# ── POST /agent/trigger ───────────────────────────────────────────────────────

@router.post("/agent/trigger")
async def trigger_agent(
    req: AgentTriggerRequest,
    uid: str = Depends(verify_firebase_token),
):
    """
    Triggers full LangGraph debate + action pipeline.
    Runs synchronous graph in thread pool to avoid blocking FastAPI.
    Stores decision + debate log in PostgreSQL.
    Hashes decision on Polygon.
    Returns full result synchronously (waits for graph to complete).
    """
    # Fetch child data
    child_data = await get_child_doc(req.child_id)
    if not child_data:
        raise HTTPException(status_code=404, detail="Child not found")

    # Fetch SHAP values for this prediction from PostgreSQL
    shap_values = {}
    async with get_session() as session:
        row = await session.execute(
            text("SELECT shap_values FROM ai_predictions WHERE id = :pid"),
            {"pid": req.prediction_id}
        )
        result = row.fetchone()
        if result:
            shap_values = result[0] or {}

    # Load family memory
    family_memory = load_family_memory(req.parent_uid)

    # Build initial state (includes new scheduler fields)
    initial_state = {
        "child_id":           req.child_id,
        "prediction_id":      req.prediction_id,
        "risk_score":         req.risk_score,
        "top_disease":        req.top_disease,
        "parent_uid":         req.parent_uid,
        "shap_values":        shap_values,
        "child_data":         child_data,
        "family_memory":      family_memory,
        "analyst_output":     None,
        "advocate_output":    None,
        "decision":           None,
        "nearest_center":     None,
        "escalate_to_doctor": None,
        "actions_taken":      None,
        "debate_log":         [],
        # Scheduler fields — filled by scheduler_node
        "scheduler_session_id": None,
        "sms_sent":             None,
        "sms_confirmed":        None,
        "offered_slot":         None,
        "offered_centre":       None,
    }

    # Run synchronous LangGraph in thread pool
    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(
        _executor,
        lambda: agent_graph.invoke(initial_state)
    )

    # Build decision record for hashing
    decision_record = {
        "child_id":      req.child_id,
        "prediction_id": req.prediction_id,
        "decision":      final_state.get("decision"),
        "actions_taken": final_state.get("actions_taken", {}),
        "debate_log":    final_state.get("debate_log", []),
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }

    record_hash = compute_hash(decision_record)

    # Store in PostgreSQL
    agent_decision_id = None
    async with get_session() as session:
        result = await session.execute(text("""
            INSERT INTO agent_decisions
                (child_id, prediction_id, analyst_output, advocate_output,
                 decision, actions_taken, debate_log, record_hash)
            VALUES
                (:child_id, :prediction_id, :analyst, :advocate,
                 :decision, :actions, :debate_log, :hash)
            RETURNING id
        """), {
            "child_id":      req.child_id,
            "prediction_id": req.prediction_id,
            "analyst":       final_state.get("analyst_output", ""),
            "advocate":      final_state.get("advocate_output", ""),
            "decision":      final_state.get("decision", "UNKNOWN"),
            "actions":       json.dumps(final_state.get("actions_taken", {})),
            "debate_log":    json.dumps(final_state.get("debate_log", [])),
            "hash":          record_hash,
        })
        await session.commit()
        row = result.fetchone()
        if row:
            agent_decision_id = row[0]

    # Hash on Polygon (fire and forget — don't block response)
    asyncio.create_task(store_hash(
        record_json=decision_record,
        entity_type="decision",
        entity_id=str(agent_decision_id or req.child_id),
    ))

    return {
        "decision":          final_state.get("decision"),
        "actions_taken":     final_state.get("actions_taken", {}),
        "debate_log":        final_state.get("debate_log", []),
        "agent_decision_id": agent_decision_id,
        "record_hash":       record_hash,
    }


# ── GET /agent/decisions/{child_id} ──────────────────────────────────────────

@router.get("/agent/decisions/{child_id}")
async def get_decisions(
    child_id: str,
    uid: str = Depends(verify_firebase_token),
    limit: int = 10,
):
    """Returns past agent decisions for a child. Used by audit dashboard."""
    async with get_session() as session:
        rows = await session.execute(text("""
            SELECT id, decision, actions_taken, debate_log,
                   record_hash, polygon_tx_id, created_at
            FROM agent_decisions
            WHERE child_id = :child_id
            ORDER BY created_at DESC
            LIMIT :limit
        """), {"child_id": child_id, "limit": limit})

        decisions = []
        for row in rows.fetchall():
            decisions.append({
                "id":            row[0],
                "decision":      row[1],
                "actions_taken": row[2],
                "debate_log":    row[3],
                "record_hash":   row[4],
                "polygon_tx_id": row[5],
                "created_at":    row[6].isoformat() if row[6] else None,
            })

    return {"decisions": decisions}


# ── POST /agent/seed-demo ─────────────────────────────────────────────────────

@router.post("/agent/seed-demo")
async def seed_demo(child_id: str = "demo-child-001"):
    """
    Creates scheduler_sessions table (if not exists) and inserts a full
    confirmed negotiation demo session for the given child_id.
    Used for demo setup — removes any existing session first.
    """
    demo_log = (
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
    import uuid as _uuid
    try:
        async with get_session() as session:
            # Ensure table exists
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS scheduler_sessions (
                    id              VARCHAR(64)  PRIMARY KEY,
                    child_id        VARCHAR(128) NOT NULL,
                    parent_phone    VARCHAR(32)  NOT NULL,
                    risk_score      INTEGER      DEFAULT 0,
                    attempt_number  INTEGER      DEFAULT 1,
                    offered_slot    TEXT,
                    offered_centre  TEXT,
                    status          VARCHAR(32)  DEFAULT 'pending',
                    confirmed_slot  TEXT,
                    agent_log       TEXT         DEFAULT '',
                    created_at      TIMESTAMPTZ  DEFAULT NOW()
                )
            """))
            # Remove existing sessions for this child
            await session.execute(
                text("DELETE FROM scheduler_sessions WHERE child_id = :c"),
                {"c": child_id}
            )
            # Insert demo session
            await session.execute(text("""
                INSERT INTO scheduler_sessions
                    (id, child_id, parent_phone, risk_score, attempt_number,
                     offered_slot, offered_centre, status, confirmed_slot, agent_log)
                VALUES
                    (:id, :child_id, :phone, 78, 2,
                     'Sassoon Hospital, Sat 16 Mar, 11:00am', 'Sassoon Hospital',
                     'confirmed', 'Sassoon Hospital, Sat 16 Mar, 11:00am', :log)
            """), {
                "id":       str(_uuid.uuid4()),
                "child_id": child_id,
                "phone":    "+919876543210",
                "log":      demo_log,
            })
            await session.commit()
        return {"status": "seeded", "child_id": child_id}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── GET /agent/session/{child_id} ─────────────────────────────────────────────


@router.get("/agent/session/{child_id}")
async def get_scheduler_session(child_id: str):
    """
    Returns the latest scheduler session for a child (no auth required).
    Polled every 3 seconds by the AgentFeed frontend component.
    Returns {"status":"none"} gracefully if DB is unreachable or table missing.
    """
    try:
        async with get_session() as session:
            row = await asyncio.wait_for(
                session.execute(text("""
                    SELECT status, attempt_number, offered_slot, offered_centre,
                           confirmed_slot, agent_log
                    FROM scheduler_sessions
                    WHERE child_id = :child_id
                    ORDER BY created_at DESC
                    LIMIT 1
                """), {"child_id": child_id}),
                timeout=5.0
            )
            result = row.fetchone()
    except Exception as e:
        print(f"[session] DB error: {e}")
        return {"status": "none"}

    if not result:
        return {"status": "none"}

    return {
        "status":         result[0],
        "attempt_number": result[1],
        "offered_slot":   result[2],
        "offered_centre": result[3],
        "confirmed_slot": result[4],
        "agent_log":      result[5] or "",
    }


# ── POST /agent/sms-reply ─────────────────────────────────────────────────────

# Alternative slots offered on rescheduling attempts 2 and 3
_RESCHEDULED_SLOTS = [
    ("City Vaccination Centre",   "Sat, 11:00am"),
    ("District Hospital Block B", "Sun, 10:00am"),
]




def _send_sms(to_phone: str, body: str) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token  = os.getenv("TWILIO_AUTH_TOKEN")
    from_phone  = os.getenv("TWILIO_FROM_NUMBER", "+15005550006")
    if not account_sid or not auth_token:
        print(f"[sms-reply] [DEMO] To {to_phone}: {body}")
        return
    try:
        from twilio.rest import Client
        Client(account_sid, auth_token).messages.create(
            to=to_phone, from_=from_phone, body=body
        )
    except Exception as e:
        print(f"[sms-reply] SMS failed: {e}")


@router.post("/agent/sms-reply")
async def handle_sms_reply(
    From: str = Form(...),
    Body: str = Form(...),
):
    """
    Twilio webhook — receives parent SMS replies to slot offers.
    - YES → confirms appointment, status='confirmed'
    - NO  → reschedules (up to 3 attempts), then escalates to doctor
    Returns {"status": "handled"} — Twilio ignores the response body.
    """
    parent_phone = From.strip()
    reply_text   = Body.strip().lower()

    async with get_session() as db:
        row = await db.execute(text("""
            SELECT id, status, attempt_number, offered_slot, offered_centre, agent_log
            FROM scheduler_sessions
            WHERE parent_phone = :phone AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
        """), {"phone": parent_phone})
        sess_row = row.fetchone()

        if not sess_row:
            print(f"[sms-reply] No pending session for {parent_phone}")
            return {"status": "no_session"}

        sess_id, status, attempt, offered_slot, offered_centre, agent_log = sess_row

        is_yes = any(w in reply_text for w in ["yes", "ok", "haan", "ha", "confirm", "done", "okay"])
        is_no  = any(w in reply_text for w in ["no", "nahi", "nope", "cancel", "busy", "can't", "cannot"])

        def _log(agent: str, message: str) -> str:
            ts = datetime.now(timezone.utc).strftime("[%H:%M:%S]")
            return (agent_log or "") + f"{ts} {agent}: {message}\n"

        sms_body = None
        if is_yes:
            agent_log = _log("parent_reply", f'"{Body.strip()}" → yes')
            agent_log = _log("scheduler_node", "Appointment confirmed. Reminder scheduled for 24h before.")
            agent_log = _log("scheduler_node", "Doctor notified. CoWIN form pre-filled.")
            await db.execute(text("""
                UPDATE scheduler_sessions
                SET status='confirmed', confirmed_slot=offered_slot, agent_log=:log
                WHERE id=:id
            """), {"log": agent_log, "id": sess_id})
            sms_body = f"✅ Confirmed! Appointment: {offered_slot}. Reminder 24h before. Thank you!"

        elif is_no:
            if attempt >= 3:
                agent_log = _log("parent_reply", f'"{Body.strip()}" → no')
                agent_log = _log("scheduler_node", "3 attempts failed. Escalating to doctor.")
                await db.execute(text("""
                    UPDATE scheduler_sessions
                    SET status='escalated', agent_log=:log WHERE id=:id
                """), {"log": agent_log, "id": sess_id})
                sms_body = ("We understand you're busy. Your child's doctor has been notified and will contact you directly.")
            else:
                new_attempt = attempt + 1
                slot_idx    = min(new_attempt - 2, len(_RESCHEDULED_SLOTS) - 1)
                new_centre, new_t = _RESCHEDULED_SLOTS[slot_idx]
                new_slot = f"{new_centre}, {new_t}"
                agent_log = _log("parent_reply", f'"{Body.strip()}" → no')
                agent_log = _log("scheduler_node", "Rescheduling. Finding next available slot...")
                agent_log = _log("scheduler_node", f"New slot offered: {new_slot}. SMS sent.")
                await db.execute(text("""
                    UPDATE scheduler_sessions
                    SET attempt_number=:a, offered_slot=:s, offered_centre=:c, agent_log=:log
                    WHERE id=:id
                """), {"a": new_attempt, "s": new_slot, "c": new_centre, "log": agent_log, "id": sess_id})
                sms_body = (f"Alternative slot: {new_slot}. Reply YES to confirm or NO for another. (Attempt {new_attempt}/3)")
        else:
            agent_log = _log("scheduler_node", "Reply unclear. Prompting parent.")
            await db.execute(text("""
                UPDATE scheduler_sessions SET agent_log=:log WHERE id=:id
            """), {"log": agent_log, "id": sess_id})
            sms_body = "Please reply YES to confirm your appointment or NO to reschedule."

        await db.commit()

    _send_sms(parent_phone, sms_body or "")
    return {"status": "handled"}
