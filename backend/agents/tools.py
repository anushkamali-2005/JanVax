"""
agents/tools.py
---------------
LangChain tool definitions for the action_node.
These are deterministic wrappers — no LLM inside tools.

CRITICAL: @tool decorator makes these callable via .invoke({})
CRITICAL: Tool input is always a dict when called via .invoke()
"""

import os
import httpx
from langchain.tools import tool


# ── Tool 1: Find nearest vaccination center ───────────────────────────────────

@tool
def find_nearest_center(district: str, vaccine: str) -> dict:
    """
    Finds the nearest vaccination center for a given Indian district.
    Uses OpenStreetMap Overpass API — completely free, no key needed.
    Returns: {name, address, distance, phone, lat, lon}
    """
    # Overpass API query for clinics/hospitals/PHCs near district centroid
    # We geocode district name using Nominatim first, then query Overpass
    try:
        # Step 1: Geocode district to get lat/lon
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        geo_resp = httpx.get(nominatim_url, params={
            "q":      f"{district}, India",
            "format": "json",
            "limit":  1,
        }, headers={"User-Agent": "VaxGuardAI/1.0"}, timeout=10)

        geo_data = geo_resp.json()
        if not geo_data:
            return {"name": f"PHC {district.title()}", "address": district, "distance": "Unknown"}

        lat = float(geo_data[0]["lat"])
        lon = float(geo_data[0]["lon"])

        # Step 2: Overpass query — find clinics/hospitals within 10km
        overpass_query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="clinic"](around:10000,{lat},{lon});
          node["amenity"="hospital"](around:10000,{lat},{lon});
          node["amenity"="health_post"](around:10000,{lat},{lon});
        );
        out body 3;
        """
        overpass_resp = httpx.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": overpass_query},
            timeout=25,
        )
        overpass_data = overpass_resp.json()
        elements = overpass_data.get("elements", [])

        if elements:
            el = elements[0]
            tags = el.get("tags", {})
            return {
                "name":     tags.get("name", f"PHC {district.title()}"),
                "address":  tags.get("addr:full", tags.get("addr:street", district)),
                "phone":    tags.get("phone", tags.get("contact:phone", "N/A")),
                "distance": "Nearby",
                "lat":      el.get("lat", lat),
                "lon":      el.get("lon", lon),
            }

    except Exception as e:
        print(f"[find_nearest_center] Overpass error: {e}")

    # Fallback — return generic PHC name so action_node never crashes
    return {
        "name":     f"Primary Health Centre, {district.title()}",
        "address":  district,
        "phone":    "104",   # India's health helpline
        "distance": "Nearby",
    }


# ── Tool 2: Send SMS to parent ────────────────────────────────────────────────

@tool
def send_sms(parent_uid: str, child_name: str, disease: str,
             center_name: str, risk_score: int) -> dict:
    """
    Sends Twilio SMS to parent's registered phone number.
    Fetches phone + language from Firebase before sending.
    Message is in parent's preferred language.
    Returns: {sent: bool, sid: str}
    """
    from twilio.rest import Client
    from services.firebase_service import get_parent_phone_and_language
    from services.twilio_service import build_sms_message

    try:
        phone, language = get_parent_phone_and_language(parent_uid)
        message_body = build_sms_message(
            child_name=child_name,
            disease=disease,
            center_name=center_name,
            risk_score=risk_score,
            language=language,
        )

        client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN"),
        )
        msg = client.messages.create(
            body=message_body,
            from_=os.getenv("TWILIO_FROM_NUMBER"),
            to=phone,
        )
        return {"sent": True, "sid": msg.sid}

    except Exception as e:
        print(f"[send_sms] Twilio error: {e}")
        return {"sent": False, "error": str(e)}


# ── Tool 3: Send web push notification ───────────────────────────────────────

@tool
def send_push(parent_uid: str, title: str, body: str) -> dict:
    """
    Sends Web Push notification to parent's browser/device.
    Fetches push subscription token from Firebase users/{uid}.pushToken
    Returns: {sent: bool}
    """
    from pywebpush import webpush, WebPushException
    from services.firebase_service import get_parent_push_token
    import json

    try:
        push_token_json = get_parent_push_token(parent_uid)
        if not push_token_json:
            return {"sent": False, "reason": "No push token registered"}

        subscription = json.loads(push_token_json)

        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, "icon": "/icon-192.png"}),
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY"),
            vapid_claims={"sub": f"mailto:{os.getenv('VAPID_EMAIL')}"},
        )
        return {"sent": True}

    except WebPushException as e:
        print(f"[send_push] WebPush error: {e}")
        return {"sent": False, "error": str(e)}
    except Exception as e:
        print(f"[send_push] General error: {e}")
        return {"sent": False, "error": str(e)}


# ── Tool 4: Alert doctor directly ────────────────────────────────────────────

@tool
def alert_doctor(parent_uid: str, child_id: str, child_name: str,
                 risk_score: int, disease: str, center: dict) -> dict:
    """
    Used when family has ignored >= 2 alerts.
    Finds associated doctor from Firestore users collection and sends SMS.
    Falls back to sending SMS to parent if no doctor is registered.
    Returns: {sent: bool, target: "doctor" | "parent_fallback"}
    """
    from twilio.rest import Client
    from services.firebase_service import get_doctor_phone_for_family

    try:
        doctor_phone = get_doctor_phone_for_family(parent_uid)
        center_name  = center.get("name", "nearest PHC") if isinstance(center, dict) else "nearest PHC"

        if not doctor_phone:
            # Fallback: send to parent with stronger language
            from agents.tools import send_sms
            send_sms.invoke({
                "parent_uid":  parent_uid,
                "child_name":  child_name,
                "disease":     disease,
                "center_name": center_name,
                "risk_score":  risk_score,
            })
            return {"sent": True, "target": "parent_fallback"}

        message = (
            f"[VaxGuard URGENT] Child {child_name} has missed critical vaccinations. "
            f"Risk score: {risk_score}/100 for {disease}. "
            f"Family has not responded to 2+ reminders. "
            f"Nearest center: {center_name}. Please follow up."
        )

        client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN"),
        )
        msg = client.messages.create(
            body=message,
            from_=os.getenv("TWILIO_FROM_NUMBER"),
            to=doctor_phone,
        )
        return {"sent": True, "target": "doctor", "sid": msg.sid}

    except Exception as e:
        print(f"[alert_doctor] Error: {e}")
        return {"sent": False, "error": str(e)}
