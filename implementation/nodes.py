"""
agents/nodes.py
---------------
All five LangGraph node functions for VaxGuard.
Each node takes AgentState, mutates it, returns it.

CRITICAL: Every node must return the full state dict — not just what it changed.
CRITICAL: debate_log must be initialized before appending (check for None).
CRITICAL: LLM is gemini-1.5-flash — cheap, fast, sufficient for this task.
"""

import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from agents.tools import find_nearest_center, send_sms, send_push, alert_doctor
from agents.memory import save_family_memory

# ── Shared LLM instance ───────────────────────────────────────────────────────
# temperature=0.1 keeps outputs consistent — this is a health system, not creative
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    temperature=0.1,
    google_api_key=os.getenv("GEMINI_API_KEY"),
)


# ── Helper ────────────────────────────────────────────────────────────────────

def _append_log(state: dict, node: str, output: str) -> None:
    """Safe append to debate_log — initializes list if None."""
    if state.get("debate_log") is None:
        state["debate_log"] = []
    state["debate_log"].append({"node": node, "output": output})


# ── Node 1: Risk Analyst ──────────────────────────────────────────────────────

def risk_analyst_node(state: dict) -> dict:
    """
    Analyzes SHAP evidence and child data.
    Argues FOR high risk if evidence supports it.
    Must end with: VERDICT: HIGH or VERDICT: LOW
    """
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

    child = state["child_data"]
    chain = prompt | llm
    result = chain.invoke({
        "age_months":     child.get("ageMonths", 0),
        "risk_score":     state["risk_score"],
        "top_disease":    state["top_disease"],
        "shap_values":    str(state["shap_values"]),
        "outbreak_flag":  "YES" if child.get("districtOutbreakFlag", 0) else "NO",
        "days_overdue":   child.get("daysOverdue", 0),
        "vaccines_missed": child.get("vaccinesMissedCount", 0),
    })

    state["analyst_output"] = result.content
    _append_log(state, "risk_analyst", result.content)
    return state


# ── Node 2: Devil's Advocate ──────────────────────────────────────────────────

def devils_advocate_node(state: dict) -> dict:
    """
    Challenges the analyst's assessment.
    Looks for false positives, borderline cases, data quality issues.
    Must end with: CHALLENGE: VALID or CHALLENGE: WEAK
    """
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

    child = state["child_data"]
    chain = prompt | llm
    result = chain.invoke({
        "analyst_output": state["analyst_output"],
        "risk_score":     state["risk_score"],
        "ignore_count":   child.get("reminderIgnoreCount", 0),
        "age_months":     child.get("ageMonths", 0),
        "days_overdue":   child.get("daysOverdue", 0),
    })

    state["advocate_output"] = result.content
    _append_log(state, "devils_advocate", result.content)
    return state


# ── Node 3: Decision ──────────────────────────────────────────────────────────

def decision_node(state: dict) -> dict:
    """
    Reads analyst + advocate. Makes final call.
    Also sets escalate_to_doctor flag if family has ignored >= 2 alerts.

    Decision rules:
      score >= 70 AND VERDICT: HIGH AND CHALLENGE: WEAK → HIGH_RISK
      score >= 70 BUT CHALLENGE: VALID                  → MONITOR
      score < 70                                        → LOW_RISK

    Output must contain exactly one of:
      DECISION: HIGH_RISK
      DECISION: LOW_RISK
      DECISION: MONITOR

    And exactly one of:
      ESCALATE: true
      ESCALATE: false
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a senior medical decision maker. "
         "Read the analyst and devil's advocate arguments and make a final decision. "
         "Apply these rules strictly:\n"
         "  - Score >= 70 AND analyst VERDICT HIGH AND challenge WEAK → HIGH_RISK\n"
         "  - Score >= 70 BUT challenge VALID → MONITOR\n"
         "  - Score < 70 → LOW_RISK\n"
         "Also: if the family has ignored 2 or more alerts, set escalation to true "
         "(skip SMS to parent, alert doctor directly instead).\n"
         "Your response MUST contain exactly these two lines and nothing else:\n"
         "DECISION: HIGH_RISK\n"
         "ESCALATE: false"
        ),
        ("human",
         "Risk score: {risk_score}/100\n"
         "Analyst said: {analyst_output}\n"
         "Advocate said: {advocate_output}\n"
         "Family ignored alert count: {ignore_count}\n"
        )
    ])

    child = state["child_data"]
    ignore_count = child.get("reminderIgnoreCount", 0)

    chain = prompt | llm
    result = chain.invoke({
        "risk_score":      state["risk_score"],
        "analyst_output":  state["analyst_output"],
        "advocate_output": state["advocate_output"],
        "ignore_count":    ignore_count,
    })

    text = result.content.upper()

    # Parse decision — fallback to MONITOR if LLM is ambiguous
    if "HIGH_RISK" in text:
        state["decision"] = "HIGH_RISK"
    elif "LOW_RISK" in text:
        state["decision"] = "LOW_RISK"
    else:
        state["decision"] = "MONITOR"

    # Parse escalation — also force-escalate if family ignored >= 2 alerts
    state["escalate_to_doctor"] = (
        "ESCALATE: TRUE" in text or ignore_count >= 2
    )

    _append_log(state, "decision", result.content)
    return state


# ── Node 4: Action ────────────────────────────────────────────────────────────

def action_node(state: dict) -> dict:
    """
    Only runs if decision == HIGH_RISK.
    Fires LangChain tools: find center, send SMS or alert doctor, send push.

    IMPORTANT: This node does NOT call the LLM — it only calls tools.
    Tools are deterministic wrappers around external APIs.
    """
    actions = {}
    child = state["child_data"]

    # ── Tool 1: Find nearest vaccination center ────────────────────────────
    try:
        center = find_nearest_center.invoke({
            "district": child.get("district", "pune"),
            "vaccine":  state["top_disease"],
        })
        state["nearest_center"] = center
        actions["nearest_center"] = center.get("name", "Nearest PHC")
        actions["appointment_booked"] = True
    except Exception as e:
        actions["nearest_center"] = "Could not fetch center"
        actions["appointment_booked"] = False
        print(f"[action_node] find_nearest_center error: {e}")

    # ── Tool 2: SMS to parent OR alert doctor (escalation path) ───────────
    if state.get("escalate_to_doctor"):
        try:
            alert_doctor.invoke({
                "parent_uid": state["parent_uid"],
                "child_id":   state["child_id"],
                "child_name": child.get("name", "Child"),
                "risk_score": state["risk_score"],
                "disease":    state["top_disease"],
                "center":     state.get("nearest_center", {}),
            })
            actions["doctor_alerted"] = True
            actions["sms_sent"] = False
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
            actions["sms_sent"] = True
            actions["doctor_alerted"] = False
        except Exception as e:
            actions["sms_sent"] = False
            print(f"[action_node] send_sms error: {e}")

    # ── Tool 3: Web push notification ─────────────────────────────────────
    try:
        send_push.invoke({
            "parent_uid": state["parent_uid"],
            "title":      f"⚠️ {child.get('name', 'Your child')} needs vaccination",
            "body":       f"Risk score: {state['risk_score']}/100 for {state['top_disease']}. Tap to see details.",
        })
        actions["push_sent"] = True
    except Exception as e:
        actions["push_sent"] = False
        print(f"[action_node] send_push error: {e}")

    state["actions_taken"] = actions
    _append_log(state, "action", str(actions))
    return state


# ── Node 5: Memory ────────────────────────────────────────────────────────────

def memory_node(state: dict) -> dict:
    """
    Always runs (last node before END).
    Saves interaction summary to PostgreSQL agent_memory table.
    This is what makes the agent remember family history across sessions.
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
            escalate_direct=state.get("escalate_to_doctor", False),
        )
    except Exception as e:
        # Never crash the graph on memory failure
        print(f"[memory_node] save_family_memory error: {e}")

    _append_log(state, "memory", f"Saved: {summary[:100]}...")
    return state
