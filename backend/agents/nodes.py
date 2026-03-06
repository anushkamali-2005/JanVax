"""
backend/agents/nodes.py
-------------------------
Individual nodes for LangGraph state machine.

Nodes:
  1. risk_analyst_node: Analyzes ML prediction + SHAP + features.
  2. devils_advocate_node: Challenges the analyst's bias.
  3. decision_node: Final judge + escalation logic.
  4. action_node: Executes tools (SMS, Push, Alert Doctor).
  5. memory_node: Updates PostgreSQL family memory.

CRITICAL: Nodes are called synchronously by LangGraph.
CRITICAL: Use proper logging instead of print().
CRITICAL: Use ChatGoogleGenerativeAI from LangChain for consistent LLM calls.
"""

import json
import logging
from typing import Dict, Any, List
from datetime import datetime, timezone

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from agents.tools import find_nearest_center, send_sms, send_push, alert_doctor
from agents.memory import save_family_memory

logger = logging.getLogger("vaxguard.agent.nodes")


def _get_llm():
    """Returns LangChain wrapper for OpenAI."""
    return ChatOpenAI(model="gpt-4o")


# ── Node 1: Risk Analyst ───────────────────────────────────────────────────────

def risk_analyst_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Look specifically at the SHAP values and feature dict.
    Summarize WHY the child is high risk.
    """
    logger.info("Running Risk Analyst for child %s", state["child_id"])
    
    child_data = state["child_data"]
    risk_score = state["risk_score"]
    shap_vals  = state["shap_values"]
    
    prompt = f"""
You are the "Risk Analyst" for the JanVax AI system.
A child has been flagged as high risk (Score: {risk_score}/100).
Child details: {json.dumps(child_data)}
ML Model SHAP values (top risk drivers): {json.dumps(shap_vals)}

Review the data and provide a concise (2-3 sentences) clinical summary of the risk.
Focus on the most important features that pushed the score higher.
"""
    try:
        llm = _get_llm()
        response = llm.invoke([SystemMessage(content=prompt)])
        output = response.content
        
        # Append to debate log
        debate_log = state.get("debate_log", [])
        debate_log.append({
            "role":    "Risk Analyst",
            "content": output,
            "ts":      datetime.now(timezone.utc).isoformat()
        })
        
        return {"analyst_output": output, "debate_log": debate_log}
    except Exception as exc:
        logger.error("Risk Analyst failure: %s", exc)
        return {"analyst_output": "Error in risk analysis.", "debate_log": state.get("debate_log", [])}


# ── Node 2: Devil's Advocate ──────────────────────────────────────────────────

def devils_advocate_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Challenge the analyst. Look for socio-economic reasons or 
    missing context (e.g. maybe the family just moved).
    """
    logger.info("Running Devil's Advocate for child %s", state["child_id"])

    analyst_output = state["analyst_output"]
    child_data     = state["child_data"]
    memory         = state.get("family_memory", "")

    prompt = f"""
You are the "Devil's Advocate". Your job is to challenge the Risk Analyst's bias.
Risk Analyst says: "{analyst_output}"
Child data: {json.dumps(child_data)}
Past family history: "{memory}"

Are there any reasons why this risk might be overestimated? 
(e.g. data reporting lag, rural access issues, family recently moved).
Provide a concise counter-point (2-3 sentences).
"""
    try:
        llm = _get_llm()
        response = llm.invoke([SystemMessage(content=prompt)])
        output = response.content

        debate_log = state.get("debate_log", [])
        debate_log.append({
            "role":    "Devil's Advocate",
            "content": output,
            "ts":      datetime.now(timezone.utc).isoformat()
        })

        return {"advocate_output": output, "debate_log": debate_log}
    except Exception as exc:
        logger.error("Devil's Advocate failure: %s", exc)
        return {"advocate_output": "Error in counter-analysis.", "debate_log": state.get("debate_log", [])}


# ── Node 3: Decision Judge ───────────────────────────────────────────────────

def decision_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Final decision maker. Escalate to doctor if risk is extreme OR 
    if family has ignored multiple alerts.
    """
    logger.info("Running Decision Judge for child %s", state["child_id"])

    analyst    = state["analyst_output"]
    advocate   = state["advocate_output"]
    risk_score = state["risk_score"]
    memory     = state.get("family_memory", "")

    prompt = f"""
You are the "Senior Public Health Officer". You make the final call.
Analyst views: "{analyst}"
Devil's Advocate views: "{advocate}"
Current Risk Score: {risk_score}
Family History: "{memory}"

DECIDE:
1. "ALERT_FAMILY": Send standard SMS/Push.
2. "ESCALATE_TO_DOCTOR": Risk is critical (>90) or family has ignored 2+ prior alerts.
3. "MONITOR": Risk is moderate, no immediate action.

Respond with ONLY one word.
"""
    try:
        llm = _get_llm()
        response = llm.invoke([SystemMessage(content=prompt)])
        decision = response.content.strip().upper()

        debate_log = state.get("debate_log", [])
        debate_log.append({
            "role":    "Decision Judge",
            "content": f"Final Decision: {decision}",
            "ts":      datetime.now(timezone.utc).isoformat()
        })

        return {"decision": decision, "debate_log": debate_log}
    except Exception as exc:
        logger.error("Decision Judge failure: %s", exc)
        return {"decision": "ALERT_FAMILY", "debate_log": state.get("debate_log", [])}


# ── Node 4: Action Execution ──────────────────────────────────────────────────

def action_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Executes the physical actions based on node 3 decision."""
    logger.info("Running Action Node for child %s, Decision: %s", state["child_id"], state["decision"])
    
    decision   = state["decision"]
    child_id   = state["child_id"]
    parent_uid = state["parent_uid"]
    child_name = state["child_data"].get("name", "Child")
    disease    = state["top_disease"]
    risk_score = state["risk_score"]
    
    actions_taken = {}

    if decision in ("ALERT_FAMILY", "ESCALATE_TO_DOCTOR"):
        # 1. Find nearest PHC (Public Health Center)
        center = find_nearest_center(state["child_data"].get("district", "India"))
        actions_taken["nearest_center"] = center
        
        # 2. Send localized SMS
        sms_res = send_sms(parent_uid, child_name, disease, center, risk_score=risk_score)
        actions_taken["sms_sent"] = sms_res.get("sent", False)
        
        # 3. Send Push Notification
        push_res = send_push(parent_uid, child_name, disease, risk_score=risk_score)
        actions_taken["push_sent"] = push_res.get("sent", False)

    if decision == "ESCALATE_TO_DOCTOR":
        # 4. Alert registered Doctor
        doc_res = alert_doctor(parent_uid, child_id, risk_score, disease)
        actions_taken["doctor_alerted"] = doc_res.get("sent", False)

    return {"actions_taken": actions_taken, "nearest_center": actions_taken.get("nearest_center")}


# ── Node 5: Memory Storage ─────────────────────────────────────────────────────

def memory_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """Updates the PostgreSQL memory table with a summary of this debate."""
    logger.info("Running Memory Node for child %s", state["child_id"])

    parent_uid = state["parent_uid"]
    analyst    = state["analyst_output"]
    decision   = state["decision"]
    actions    = state.get("actions_taken", {})
    
    summary = f"Risk analyst noted: {analyst[:100]}... Decision was {decision}. Actions: {json.dumps(actions)}."
    
    save_family_memory(
        family_uid      = parent_uid,
        summary         = summary,
        last_action     = decision,
        ignore_count    = 1 if decision == "ESCALATE_TO_DOCTOR" else 0, # simplified
        escalate_direct = (decision == "ESCALATE_TO_DOCTOR")
    )
    
    return {}
