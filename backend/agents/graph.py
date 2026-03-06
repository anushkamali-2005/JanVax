"""
backend/agents/graph.py
---------------
LangGraph StateGraph for JanVax multi-agent debate pipeline.

Flow:
  risk_analyst → devils_advocate → decision
                                      ↓ (conditional)
             (ALERT/ESCALATE) → action → memory → END
             (MONITOR/OTHER)  →           memory → END
"""

import logging
from typing import TypedDict, Optional, List, Any
from langgraph.graph import StateGraph, END
from agents.nodes import (
    risk_analyst_node,
    devils_advocate_node,
    decision_node,
    action_node,
    memory_node,
)

logger = logging.getLogger("vaxguard.agent.graph")

# ── State ─────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    # ── Set before graph starts (inputs) ──────────────────────────────────────
    child_id:           str
    prediction_id:      int
    risk_score:         int
    top_disease:        str
    parent_uid:         str
    shap_values:        dict          # {feature_name: float}
    child_data:         dict          # full Firestore children/{childId} doc
    family_memory:      Optional[str] # summary string from PostgreSQL

    # ── Filled by nodes (intermediate) ────────────────────────────────────────
    analyst_output:     Optional[str]
    advocate_output:    Optional[str]
    decision:           Optional[str]   # "ALERT_FAMILY" | "ESCALATE_TO_DOCTOR" | "MONITOR"
    nearest_center:     Optional[str]
    escalate_to_doctor: Optional[bool]  # flag derived from decision for internal logic

    # ── Filled by action/memory nodes (outputs) ───────────────────────────────
    actions_taken:      Optional[dict]
    debate_log:         Optional[List[dict]]


# ── Routing function ──────────────────────────────────────────────────────────

def route_after_decision(state: AgentState) -> str:
    """Only go to action node if decision requires intervention."""
    decision = state.get("decision", "").upper()
    if decision in ("ALERT_FAMILY", "ESCALATE_TO_DOCTOR"):
        logger.info("Routing to ACTION node based on decision: %s", decision)
        return "action"
    
    logger.info("Skipping ACTION node (Decision: %s)", decision)
    return "memory"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_agent_graph() -> Any:
    graph = StateGraph(AgentState)

    # Register nodes
    graph.add_node("risk_analyst",    risk_analyst_node)
    graph.add_node("devils_advocate", devils_advocate_node)
    graph.add_node("decision",        decision_node)
    graph.add_node("action",          action_node)
    graph.add_node("memory",          memory_node)

    # Linear edges
    graph.set_entry_point("risk_analyst")
    graph.add_edge("risk_analyst",    "devils_advocate")
    graph.add_edge("devils_advocate", "decision")

    # Conditional: ALERT/ESCALATE → action, else skip to memory
    graph.add_conditional_edges(
        "decision",
        route_after_decision,
        {
            "action": "action",
            "memory": "memory",
        }
    )

    graph.add_edge("action", "memory")
    graph.add_edge("memory", END)

    return graph.compile()


# Singleton — import this in routers/agent.py
agent_graph = build_agent_graph()
logger.info("LangGraph agent pipeline compiled and ready.")
