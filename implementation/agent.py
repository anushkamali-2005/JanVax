"""
backend/routers/agent.py
-------------------------
POST /agent/trigger    — runs LangGraph multi-agent debate pipeline
GET  /agent/decisions/{child_id} — fetch past agent decisions for audit UI

BUGS FIXED vs original:
  FIX-1  asyncio.get_event_loop() deprecated and raises DeprecationWarning in
         Python 3.10+. Inside an async function, use asyncio.get_running_loop().
"""

import json
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

router    = APIRouter()
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
    Runs synchronous graph in thread pool (never blocks FastAPI event loop).
    Persists decision + debate log to PostgreSQL.
    Hashes decision record on Polygon (fire-and-forget background task).
    """
    # ── 1. Fetch child data ────────────────────────────────────────────────
    child_data = await get_child_doc(req.child_id)
    if not child_data:
        raise HTTPException(status_code=404, detail="Child not found")

    # ── 2. Fetch SHAP values from PostgreSQL ───────────────────────────────
    shap_values: dict = {}
    async with get_session() as session:
        row = await session.execute(
            text("SELECT shap_values FROM ai_predictions WHERE id = :pid"),
            {"pid": req.prediction_id}
        )
        result = row.fetchone()
        if result and result[0]:
            shap_values = result[0]

    # ── 3. Load family memory (PostgreSQL agent_memory table) ──────────────
    family_memory = load_family_memory(req.parent_uid)

    # ── 4. Build initial graph state ───────────────────────────────────────
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

    # ── 5. Run synchronous LangGraph in thread pool ────────────────────────
    # FIX-1: use get_running_loop(), not get_event_loop()
    loop        = asyncio.get_running_loop()
    final_state = await loop.run_in_executor(
        _executor,
        lambda: agent_graph.invoke(initial_state)
    )

    # ── 6. Build canonical decision record for hashing ────────────────────
    decision_record = {
        "child_id":      req.child_id,
        "prediction_id": req.prediction_id,
        "decision":      final_state.get("decision"),
        "actions_taken": final_state.get("actions_taken", {}),
        "debate_log":    final_state.get("debate_log", []),
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }
    record_hash = compute_hash(decision_record)

    # ── 7. Persist to PostgreSQL ───────────────────────────────────────────
    agent_decision_id = None
    async with get_session() as session:
        result = await session.execute(text("""
            INSERT INTO agent_decisions
                (child_id, prediction_id, analyst_output, advocate_output,
                 decision, actions_taken, debate_log, record_hash)
            VALUES
                (:child_id, :prediction_id, :analyst, :advocate,
                 :decision, :actions::jsonb, :debate_log::jsonb, :hash)
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

    # ── 8. Hash on Polygon — fire and forget ──────────────────────────────
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
    """Returns past agent decisions for a child. Used by the audit dashboard."""
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
