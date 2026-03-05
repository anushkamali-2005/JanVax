"""
backend/routers/agent.py
-------------------------
POST /agent/trigger — runs LangGraph multi-agent pipeline
GET  /agent/decisions/{child_id} — fetch past agent decisions for audit UI

CRITICAL: agent_graph.invoke() is SYNCHRONOUS (LangGraph default).
          Run it in a thread pool so it doesn't block the event loop.
CRITICAL: Store full debate_log + actions in PostgreSQL after graph completes.
CRITICAL: Hash the full decision record and store on Polygon.
"""

import json
import hashlib
import asyncio
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
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

    # Build initial state
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
