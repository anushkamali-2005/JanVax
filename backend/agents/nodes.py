"""
agents/nodes.py
---------------
All five LangGraph node functions for VaxGuard.

BUGS FIXED vs original:
  FIX-1  Nodes now return {**state, key: new_value} instead of mutating state
         in-place. LangGraph compiled graphs pass an immutable state snapshot
         to each node — mutating it then returning the same object loses updates.
  FIX-2  debate_log built as a local list and merged into return dict.
         The old _append_log() mutated state["debate_log"] in-place which
         failed to persist across nodes when state is a snapshot copy.
  FIX-3  Import changed to langchain_core.prompts (langchain.prompts deprecated).
"""

import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from agents.tools import find_nearest_center, send_sms, send_push, alert_doctor
from agents.memory import save_family_memory

# ── Shared LLM instance ───────────────────────────────────────────────────────
llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.1,
    api_key=os.getenv("OPENAI_API_KEY"),
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log_entry(node: str, output: str) -> dict:
    return {"node": node, "output": output}

def _get_log(state: dict) -> list:
    """Returns a copy of debate_log — never None, never the original object."""
    existing = state.get("debate_log")
    return list(existing) if isinstance(existing, list) else []


# ── Node 1: Risk Analyst ──────────────────────────────────────────────────────

def risk_analyst_node(state: dict) -> dict:
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a child health risk analyst for an Indian vaccination system. "
         "Analyze the vaccination data and argue whether this child needs immediate attention. "
         "Be specific. Reference the SHAP feature values as evidence. "
         "Consider Indian context: district outbreaks are serious, age windows matter. "
         "Respond in 3-4 sentences. "
         "End your response with exactly: VERDICT: HIGH or VERDICT: LOW"
        ),
        ("human",
         "Child age: {age_months} months\n"
         "Risk score: {risk_score}/100\n"
         "Top disease at risk: {top_disease}\n"
         "SHAP feature contributions (higher = more risk): {shap_values}\n"
         "District outbreak active: {outbreak_flag}\n"
         "Days overdue on most critical vaccine: {days_overdue}\n"
         "Vaccines missed total: {vaccines_missed}\n"
        )
    ])

    child  = state["child_data"]
    result = (prompt | llm).invoke({
        "age_months":      child.get("ageMonths", 0),
        "risk_score":      state["risk_score"],
        "top_disease":     state["top_disease"],
        "shap_values":     str(state["shap_values"]),
        "outbreak_flag":   "YES" if child.get("districtOutbreakFlag", 0) else "NO",
        "days_overdue":    child.get("daysOverdue", 0),
        "vaccines_missed": child.get("vaccinesMissedCount", 0),
    })

    log = _get_log(state)
    log.append(_log_entry("risk_analyst", result.content))
    return {**state, "analyst_output": result.content, "debate_log": log}


# ── Node 2: Devil's Advocate ──────────────────────────────────────────────────

def devils_advocate_node(state: dict) -> dict:
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a medical devil's advocate. Your job is to challenge risk assessments "
         "to prevent unnecessary alerts that erode parent trust. "
         "Check: Is the child truly overdue or borderline? "
         "Is the risk score inflated by a single feature? "
         "Is the district outbreak flag reliable? "
         "Respond in 3-4 sentences. "
         "End with exactly: CHALLENGE: VALID (analyst overstated risk) "
         "or CHALLENGE: WEAK (analyst is correct, risk is real)"
        ),
        ("human",
         "Analyst assessment: {analyst_output}\n"
         "Raw risk score: {risk_score}/100\n"
         "Family has ignored previous alerts: {ignore_count} times\n"
         "Child age: {age_months} months\n"
         "Days overdue: {days_overdue}\n"
        )
    ])

    child  = state["child_data"]
    result = (prompt | llm).invoke({
        "analyst_output": state["analyst_output"],
        "risk_score":     state["risk_score"],
        "ignore_count":   child.get("reminderIgnoreCount", 0),
        "age_months":     child.get("ageMonths", 0),
        "days_overdue":   child.get("daysOverdue", 0),
    })

    log = _get_log(state)
    log.append(_log_entry("devils_advocate", result.content))
    return {**state, "advocate_output": result.content, "debate_log": log}


# ── Node 3: Decision ──────────────────────────────────────────────────────────

def decision_node(state: dict) -> dict:
    """
    Rules:
      score >= 70 AND VERDICT: HIGH AND CHALLENGE: WEAK  → HIGH_RISK
      score >= 70 BUT CHALLENGE: VALID                   → MONITOR
      score < 70                                         → LOW_RISK
    Escalates to doctor if family ignored >= 2 alerts.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a senior medical decision maker. "
         "Read the analyst and devil's advocate arguments and make a final decision. "
         "Apply these rules strictly:\n"
         "  - Score >= 70 AND analyst VERDICT HIGH AND challenge WEAK → HIGH_RISK\n"
         "  - Score >= 70 BUT challenge VALID → MONITOR\n"
         "  - Score < 70 → LOW_RISK\n"
         "Also: if the family has ignored 2 or more alerts, set escalation to true.\n"
         "Your response MUST contain exactly these two lines:\n"
         "DECISION: <HIGH_RISK|MONITOR|LOW_RISK>\n"
         "ESCALATE: <true|false>"
        ),
        ("human",
         "Risk score: {risk_score}/100\n"
         "Analyst said: {analyst_output}\n"
         "Advocate said: {advocate_output}\n"
         "Family ignored alert count: {ignore_count}\n"
        )
    ])

    child        = state["child_data"]
    ignore_count = child.get("reminderIgnoreCount", 0)

    result     = (prompt | llm).invoke({
        "risk_score":      state["risk_score"],
        "analyst_output":  state["analyst_output"],
        "advocate_output": state["advocate_output"],
        "ignore_count":    ignore_count,
    })

    text_upper = result.content.upper()

    if "HIGH_RISK" in text_upper:
        decision = "HIGH_RISK"
    elif "LOW_RISK" in text_upper:
        decision = "LOW_RISK"
    else:
        decision = "MONITOR"

    escalate = ("ESCALATE: TRUE" in text_upper) or (ignore_count >= 2)

    log = _get_log(state)
    log.append(_log_entry("decision", result.content))

    return {
        **state,
        "decision":           decision,
        "escalate_to_doctor": escalate,
        "debate_log":         log,
    }


# ── Node 4: Action ────────────────────────────────────────────────────────────

def action_node(state: dict) -> dict:
    """
    Runs only when decision == HIGH_RISK.
    Calls tools — no LLM calls here.
    """
    actions        = {}
    child          = state["child_data"]
    nearest_center = state.get("nearest_center") or {}

    # Tool 1: Find nearest center
    try:
        center = find_nearest_center.invoke({
            "district": child.get("district", "pune"),
            "vaccine":  state["top_disease"],
        })
        nearest_center               = center
        actions["nearest_center"]    = center.get("name", "Nearest PHC")
        actions["appointment_booked"] = True
    except Exception as e:
        actions["nearest_center"]    = "Could not fetch center"
        actions["appointment_booked"] = False
        print(f"[action_node] find_nearest_center error: {e}")

    # Tool 2: SMS or doctor escalation
    if state.get("escalate_to_doctor"):
        try:
            alert_doctor.invoke({
                "parent_uid": state["parent_uid"],
                "child_id":   state["child_id"],
                "child_name": child.get("name", "Child"),
                "risk_score": state["risk_score"],
                "disease":    state["top_disease"],
                "center":     nearest_center,
            })
            actions["doctor_alerted"] = True
            actions["sms_sent"]       = False
        except Exception as e:
            actions["doctor_alerted"] = False
            print(f"[action_node] alert_doctor error: {e}")
    else:
        try:
            send_sms.invoke({
                "parent_uid":  state["parent_uid"],
                "child_name":  child.get("name", "your child"),
                "disease":     state["top_disease"],
                "center_name": actions.get("nearest_center", "your nearest PHC"),
                "risk_score":  state["risk_score"],
            })
            actions["sms_sent"]       = True
            actions["doctor_alerted"] = False
        except Exception as e:
            actions["sms_sent"] = False
            print(f"[action_node] send_sms error: {e}")

    # Tool 3: Push notification
    try:
        send_push.invoke({
            "parent_uid": state["parent_uid"],
            "title":      f"⚠️ {child.get('name', 'Your child')} needs vaccination",
            "body":       (
                f"Risk score: {state['risk_score']}/100 "
                f"for {state['top_disease']}. Tap to see details."
            ),
        })
        actions["push_sent"] = True
    except Exception as e:
        actions["push_sent"] = False
        print(f"[action_node] send_push error: {e}")

    log = _get_log(state)
    log.append(_log_entry("action", str(actions)))

    return {
        **state,
        "nearest_center": nearest_center,
        "actions_taken":  actions,
        "debate_log":     log,
    }


# ── Node 5: Memory ────────────────────────────────────────────────────────────

def memory_node(state: dict) -> dict:
    """
    Always runs as last node before END.
    Persists interaction to PostgreSQL — never crashes graph on failure.
    """
    decision    = state.get("decision", "UNKNOWN")
    actions     = state.get("actions_taken", {})
    risk_score  = state.get("risk_score", 0)
    top_disease = state.get("top_disease", "unknown")

    summary = (
        f"Last assessment: {top_disease} risk score {risk_score}/100. "
        f"Decision: {decision}. "
        f"Actions taken: {actions}. "
        f"Escalated to doctor: {state.get('escalate_to_doctor', False)}."
    )

    try:
        save_family_memory(
            family_uid=state["parent_uid"],
            summary=summary,
            last_action=decision,
            ignore_count=state["child_data"].get("reminderIgnoreCount", 0),
            escalate_direct=bool(state.get("escalate_to_doctor", False)),
        )
    except Exception as e:
        print(f"[memory_node] save_family_memory error: {e}")

    log = _get_log(state)
    log.append(_log_entry("memory", f"Saved: {summary[:100]}..."))
    return {**state, "debate_log": log}
