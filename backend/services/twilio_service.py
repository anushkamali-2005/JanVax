"""
backend/services/twilio_service.py
------------------------------------
Twilio SMS sending with Indian language message templates.
All 5 languages pre-written — no LLM needed for reminders.

CRITICAL: Twilio free trial only sends to verified numbers.
CRITICAL: build_sms_message returns plain text — no HTML, no emoji in SMS.
"""

import os
import logging
import asyncio
from typing import Optional, Tuple, Dict, Any
from twilio.rest import Client

logger = logging.getLogger("vaxguard.twilio")

# ── Message templates — all 5 Indian languages ───────────────────────────────

SMS_TEMPLATES = {
    "en": (
        "JanVax Alert: {child_name} needs {disease} vaccination. "
        "Risk score: {risk_score}/100. "
        "Nearest center: {center_name}. "
        "Please visit as soon as possible. Reply STOP to unsubscribe."
    ),
    "hi": (
        "JanVax सूचना: {child_name} को {disease} का टीका लगवाना जरूरी है। "
        "जोखिम स्कोर: {risk_score}/100। "
        "निकटतम केंद्र: {center_name}। "
        "कृपया जल्द से जल्द जाएं।"
    ),
    "mr": (
        "JanVax सूचना: {child_name} ला {disease} लस देणे आवश्यक आहे। "
        "धोका स्कोर: {risk_score}/100। "
        "जवळचे केंद्र: {center_name}। "
        "कृपया लवकरात लवकर भेट द्या।"
    ),
    "ta": (
        "JanVax அறிவிப்பு: {child_name} க்கு {disease} தடுப்பூசி தேவை. "
        "ஆபத்து மதிப்பெண்: {risk_score}/100. "
        "அருகிலுள்ள மையம்: {center_name}. "
        "தயவுசெய்து விரைவில் செல்லுங்கள்."
    ),
    "bn": (
        "JanVax সতর্কতা: {child_name} এর {disease} টিকা দেওয়া দরকার। "
        "ঝুঁকি স্কোর: {risk_score}/100। "
        "নিকটতম কেন্দ্র: {center_name}। "
        "অনুগ্রহ করে যত তাড়াতাড়ি সম্ভব যান।"
    ),
    "te": (
        "JanVax హెచ్చరిక: {child_name} కి {disease} టీకా అవసరం. "
        "ప్రమాద స్కోర్: {risk_score}/100. "
        "సమీప కేంద్రం: {center_name}. "
        "దయచేసి వీలైనంత త్వరగా వెళ్ళండి."
    ),
}

DISEASE_NAMES = {
    "measles":       {"en": "Measles (MMR)",     "hi": "खसरा (MMR)",       "mr": "गोवर (MMR)",       "ta": "தட்டம்மை (MMR)", "bn": "হাম (MMR)",        "te": "మీజిల్స్ (MMR)"},
    "polio":         {"en": "Polio",              "hi": "पोलियो",            "mr": "पोलिओ",            "ta": "போலியோ",          "bn": "পোলিও",            "te": "పోలియో"},
    "tuberculosis":  {"en": "Tuberculosis (BCG)", "hi": "टीबी (BCG)",        "mr": "क्षयरोग (BCG)",   "ta": "காச நோய் (BCG)",  "bn": "যক্ষ্মা (BCG)",   "te": "క్షయ (BCG)"},
    "hepatitis_b":   {"en": "Hepatitis B",        "hi": "हेपेटाइटिस बी",    "mr": "हिपॅटायटिस बी",  "ta": "ஹெபடைடிஸ் B",   "bn": "হেপাটাইটিস বি",  "te": "హెపటైటిస్ B"},
    "diphtheria":    {"en": "Diphtheria (DPT)",   "hi": "डिप्थीरिया (DPT)", "mr": "घटसर्प (DPT)",   "ta": "டிப்தீரியா (DPT)","bn": "ডিপথেরিয়া (DPT)","te": "డిప్తీరియా (DPT)"},
}


def build_sms_message(child_name: str, disease: str, center_name: str,
                       risk_score: int, language: str = "en") -> str:
    """Returns localized SMS message string."""
    template = SMS_TEMPLATES.get(language, SMS_TEMPLATES["en"])
    disease_translations = DISEASE_NAMES.get(disease, {})
    localized_disease = disease_translations.get(language, disease_translations.get("en", disease))

    return template.format(
        child_name=child_name,
        disease=localized_disease,
        center_name=center_name,
        risk_score=risk_score,
    )


def send_sms_message(parent_uid: str, child_name: str, disease: str,
                      center_name: str, language: str = "en",
                      risk_score: int = 0) -> Dict[str, Any]:
    """Sends SMS via Twilio. Sync version for tools."""
    from services.firebase_service import get_parent_phone_and_language

    try:
        phone, lang = get_parent_phone_and_language(parent_uid)
        if language == "en" and lang != "en":
            language = lang

        if not phone:
            logger.warning("No phone number for uid: %s", parent_uid)
            return {"sent": False, "reason": "no_phone"}

        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token  = os.getenv("TWILIO_AUTH_TOKEN")
        from_phone  = os.getenv("TWILIO_FROM_NUMBER")

        if not all([account_sid, auth_token, from_phone]):
            logger.error("Twilio credentials missing")
            return {"sent": False, "reason": "credentials_missing"}

        message_body = build_sms_message(child_name, disease, center_name, risk_score, language)

        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            body=message_body,
            from_=from_phone,
            to=phone,
        )
        logger.info("SMS sent to %s*** sid=%s", phone[:6], msg.sid)
        return {"sent": True, "sid": msg.sid}

    except Exception as exc:
        logger.error("Twilio send_sms_message error: %s", exc)
        return {"sent": False, "error": str(exc)}


async def alert_doctor_message(parent_uid: str, child_id: str,
                                risk_score: int, disease: str) -> Dict[str, Any]:
    """Sends urgent SMS to doctor."""
    from services.firebase_service import get_doctor_phone_for_family, get_child_doc

    try:
        doctor_phone = get_doctor_phone_for_family(parent_uid)
        if not doctor_phone:
            logger.warning("No doctor registered for family %s", parent_uid)
            return {"sent": False, "reason": "no_doctor_registered"}

        # Get child name (use await since we are in async context here)
        child = await get_child_doc(child_id)
        child_name = child.get("name", "Patient") if child else "Patient"

        message = (
            f"[JanVax URGENT] {child_name} (ID: {child_id[:8]}) "
            f"has missed critical vaccinations. "
            f"Risk: {risk_score}/100 for {disease}. "
            f"Family has not responded to multiple reminders. "
            f"Please follow up."
        )

        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token  = os.getenv("TWILIO_AUTH_TOKEN")
        from_phone  = os.getenv("TWILIO_FROM_NUMBER")

        client = Client(account_sid, auth_token)
        # Twilio API call is blocking, but we are in async context, so wrap it
        msg = await asyncio.to_thread(
            client.messages.create,
            body=message,
            from_=from_phone,
            to=doctor_phone
        )
        logger.info("Urgent doctor alert sent to %s***", doctor_phone[:6])
        return {"sent": True, "sid": msg.sid, "target": "doctor"}

    except Exception as exc:
        logger.error("twilio alert_doctor_message error: %s", exc)
        return {"sent": False, "error": str(exc)}
