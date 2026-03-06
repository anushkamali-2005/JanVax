"""
agents/graph.py
---------------
LangGraph StateGraph for VaxGuard multi-agent debate pipeline.
CRITICAL FILE — do not let Antigravity rewrite this without reference.

Flow:
  risk_analyst → devils_advocate → decision
                                      ↓ (conditional)
                             HIGH_RISK → action → memory → END
                             else     →           memory → END
"""

from typing import TypedDict, Optional, List, Any
from langgraph.graph import StateGraph, END
from agents.nodes import (
    risk_analyst_node,
    devils_advocate_node,
    decision_node,
    action_node,
    memory_node,
)
from agents.scheduler import scheduler_node


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

    # ── Filled by nodes (intermediate) ────────────────────────────────────────
    analyst_output:     Optional[str]
    advocate_output:    Optional[str]
    decision:           Optional[str]   # "HIGH_RISK" | "LOW_RISK" | "MONITOR"
    nearest_center:     Optional[dict]
    family_memory:      Optional[str]   # summary string from PostgreSQL
    escalate_to_doctor: Optional[bool]

    # ── Filled by action/memory nodes (outputs) ───────────────────────────────
    actions_taken:      Optional[dict]
    debate_log:         Optional[List[dict]]

    # ── Filled by scheduler_node ──────────────────────────────────────────────
    scheduler_session_id: Optional[str]   # UUID of the SchedulerSession row
    sms_sent:             Optional[bool]  # True once first SMS offer fired
    sms_confirmed:        Optional[bool]  # True once parent replies YES
    offered_slot:         Optional[str]   # human-readable slot string offered
    offered_centre:       Optional[str]   # centre name


# ── Routing function ──────────────────────────────────────────────────────────

def route_after_decision(state: AgentState) -> str:
    """Only go to action node if decision is HIGH_RISK."""
    if state.get("decision") == "HIGH_RISK":
        return "action"
    return "memory"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_agent_graph() -> Any:
    graph = StateGraph(AgentState)

    # Register nodes
    graph.add_node("risk_analyst",    risk_analyst_node)
    graph.add_node("devils_advocate", devils_advocate_node)
    graph.add_node("decider",         decision_node)
    graph.add_node("action",          action_node)
    graph.add_node("scheduler",       scheduler_node)
    graph.add_node("memory",          memory_node)

    # Linear edges
    graph.set_entry_point("risk_analyst")
    graph.add_edge("risk_analyst",    "devils_advocate")
    graph.add_edge("devils_advocate", "decider")

    # Conditional: HIGH_RISK → action, else skip to memory
    graph.add_conditional_edges(
        "decider",
        route_after_decision,
        {
            "action": "action",
            "memory": "memory",
        }
    )

    # action → scheduler (sends SMS + saves session), then → memory → END
    graph.add_edge("action",     "scheduler")
    graph.add_edge("scheduler",  "memory")
    graph.add_edge("memory",     END)

    return graph.compile()


# Singleton — import this in routers/agent.py
# Usage: result = agent_graph.invoke(initial_state)
agent_graph = build_agent_graph()
