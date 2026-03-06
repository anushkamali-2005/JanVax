"""
backend/agents/tools.py
-------------------------
Standard tools available to the LangGraph agents.

CRITICAL: Sync functions called by nodes.
CRITICAL: Use proper logging instead of print().
CRITICAL: All external API calls (Twilio, httpx) should handle timeouts.
"""

import os
import json
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("vaxguard.agent.tools")


def find_nearest_center(district: str) -> str:
    """
    Mock lookup for the nearest Public Health Center (PHC).
    In production, this would use a GIS API or district health database.
    """
    try:
        # Check against a small mock dictionary of Indian districts
        centers = {
            "mumbai":    "Sion Hospital PHC",
            "pune":      "Kothrud Municipal Dispensary",
            "nagpur":    "Indira Gandhi PHC",
            "delhi":     "AIIMS Outreach Center",
            "bangalore": "Koramangala Health Hub",
            "hyderabad": "Jubilee Hills PHC",
            "chennai":   "Adyar Community Hospital",
        }
        
        # Normalize district for match
        key = district.lower().strip()
        if key in centers:
            return centers[key]
            
        # Mock external lookup via Government Health Facility API (Gov.in example)
        # We use a timeout to prevent blocking the worker thread forever
        # URL = "https://nhp.gov.in/healthfacilityfinder/api"
        # Since this is a demo, we return a Generic PHC
        return f"{district.title()} District Health Center"
        
    except Exception as exc:
        logger.error("find_nearest_center error for %s: %s", district, exc)
        return "Nearest Government Health Center (PHC)"


def send_sms(parent_uid: str, child_name: str, disease: str, center_name: str, 
             language: str = "en", risk_score: int = 0) -> Dict[str, Any]:
    """Wraps twilio_service.send_sms_message."""
    from services.twilio_service import send_sms_message
    try:
        return send_sms_message(parent_uid, child_name, disease, center_name, language, risk_score)
    except Exception as exc:
        logger.error("send_sms tool error: %s", exc)
        return {"sent": False, "error": str(exc)}


def send_push(parent_uid: str, child_name: str, disease: str, risk_score: int = 0) -> Dict[str, Any]:
    """
    Sends Web Push notification to the parent's registered browsers.
    Uses pywebpush with VAPID credentials.
    """
    from services.firebase_service import get_parent_push_token
    from pywebpush import webpush, WebPushException

    try:
        push_token_json = get_parent_push_token(parent_uid)
        if not push_token_json:
            return {"sent": False, "reason": "no_push_token"}

        subscription_info = json.loads(push_token_json)
        
        # Prepare payload
        payload = {
            "title": f"JanVax Alert: {child_name}",
            "body":  f"Next due: {disease}. Risk: {risk_score}/100. Please check instructions.",
            "icon":  "/logo192.png",
            "data":  {"url": "/dashboard"}
        }

        private_key = os.getenv("VAPID_PRIVATE_KEY")
        email       = os.getenv("VAPID_EMAIL", "vaxguard@dummy.com")

        if not private_key:
            logger.warning("VAPID_PRIVATE_KEY not set. Skipping push.")
            return {"sent": False, "reason": "missing_vapid_key"}

        webpush(
            subscription_info = subscription_info,
            data              = json.dumps(payload),
            vapid_private_key = private_key,
            vapid_claims      = {"sub": f"mailto:{email}"}
        )
        logger.info("Push notification sent to uid: %s", parent_uid)
        return {"sent": True}

    except WebPushException as ex:
        logger.error("WebPush failed: %s", ex)
        return {"sent": False, "error": str(ex)}
    except Exception as exc:
        logger.error("send_push tool error: %s", exc)
        return {"sent": False, "error": str(exc)}


def alert_doctor(parent_uid: str, child_id: str, risk_score: int, disease: str) -> Dict[str, Any]:
    """Wraps twilio_service.alert_doctor_message."""
    from services.twilio_service import alert_doctor_message
    import asyncio

    try:
        # alert_doctor_message is async in the service now
        # but this tool is called synchronously by the LangGraph node.
        # Run in a new event loop or use run() if already in one.
        # Since agents run in a threadpool (from agent.py router), 
        # there is no running loop in this thread usually.
        return asyncio.run(alert_doctor_message(parent_uid, child_id, risk_score, disease))
    except Exception as exc:
        logger.error("alert_doctor tool error: %s", exc)
        return {"sent": False, "error": str(exc)}
