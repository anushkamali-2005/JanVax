"""
backend/services/twilio_service.py
------------------------------------
Twilio SMS sending with Indian language message templates.
All 5 languages pre-written — no LLM needed for reminders.

CRITICAL: Twilio free trial only sends to verified numbers.
          For demo: verify judge/team numbers in Twilio console.
CRITICAL: USSD response must be plain text, max 160 chars per menu item.
CRITICAL: build_sms_message returns plain text — no HTML, no emoji in SMS.
"""

import os
from twilio.rest import Client

# ── Message templates — all 5 Indian languages ───────────────────────────────
# {child_name}, {disease}, {center_name}, {risk_score} are placeholders

SMS_TEMPLATES = {
    "en": (
        "VaxGuard Alert: {child_name} needs {disease} vaccination. "
        "Risk score: {risk_score}/100. "
        "Nearest center: {center_name}. "
        "Please visit as soon as possible. Reply STOP to unsubscribe."
    ),
    "hi": (
        "VaxGuard सूचना: {child_name} को {disease} का टीका लगवाना जरूरी है। "
        "जोखिम स्कोर: {risk_score}/100। "
        "निकटतम केंद्र: {center_name}। "
        "कृपया जल्द से जल्द जाएं।"
    ),
    "mr": (
        "VaxGuard सूचना: {child_name} ला {disease} लस देणे आवश्यक आहे। "
        "धोका स्कोर: {risk_score}/100। "
        "जवळचे केंद्र: {center_name}। "
        "कृपया लवकरात लवकर भेट द्या।"
    ),
    "ta": (
        "VaxGuard அறிவிப்பு: {child_name} க்கு {disease} தடுப்பூசி தேவை. "
        "ஆபத்து மதிப்பெண்: {risk_score}/100. "
        "அருகிலுள்ள மையம்: {center_name}. "
        "தயவுசெய்து விரைவில் செல்லுங்கள்."
    ),
    "bn": (
        "VaxGuard সতর্কতা: {child_name} এর {disease} টিকা দেওয়া দরকার। "
        "ঝুঁকি স্কোর: {risk_score}/100। "
        "নিকটতম কেন্দ্র: {center_name}। "
        "অনুগ্রহ করে যত তাড়াতাড়ি সম্ভব যান।"
    ),
    "te": (
        "VaxGuard హెచ్చరిక: {child_name} కి {disease} టీకా అవసరం. "
        "ప్రమాద స్కోర్: {risk_score}/100. "
        "సమీప కేంద్రం: {center_name}. "
        "దయచేసి వీలైనంత త్వరగా వెళ్ళండి."
    ),
}

# Disease name translations
DISEASE_NAMES = {
    "measles":       {"en": "Measles (MMR)",     "hi": "खसरा (MMR)",       "mr": "गोवर (MMR)",       "ta": "தட்டம்மை (MMR)", "bn": "হাম (MMR)",        "te": "మీజిల్స్ (MMR)"},
    "polio":         {"en": "Polio",              "hi": "पोलियो",            "mr": "पोलिओ",            "ta": "போலியோ",          "bn": "পোলিও",            "te": "పోలియో"},
    "tuberculosis":  {"en": "Tuberculosis (BCG)", "hi": "टीबी (BCG)",        "mr": "क्षयरोग (BCG)",   "ta": "காச நோய் (BCG)",  "bn": "যক্ষ্মা (BCG)",   "te": "క్షయ (BCG)"},
    "hepatitis_b":   {"en": "Hepatitis B",        "hi": "हेपेटाइटिस बी",    "mr": "हिपॅटायटिस बी",  "ta": "ஹெபடைடிஸ் B",   "bn": "হেপাটাইটিস বি",  "te": "హెపటైటిస్ B"},
    "diphtheria":    {"en": "Diphtheria (DPT)",   "hi": "डिप्थीरिया (DPT)", "mr": "घटसर्प (DPT)",   "ta": "டிப்தீரியா (DPT)","bn": "ডিপথেরিয়া (DPT)","te": "డిప్తీరియా (DPT)"},
}


def build_sms_message(child_name: str, disease: str, center_name: str,
                       risk_score: int, language: str = "en") -> str:
    """
    Returns localized SMS message string.
    Falls back to English if language not supported.
    Translates disease name if translation available.
    """
    template = SMS_TEMPLATES.get(language, SMS_TEMPLATES["en"])

    # Translate disease name if available
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
                      risk_score: int = 0) -> dict:
    """
    Sends SMS via Twilio. Fetches phone from Firebase internally.
    Called from LangChain tool (sync context).
    Returns {sent: bool, sid: str}
    """
    from services.firebase_service import get_parent_phone_and_language

    try:
        phone, lang = get_parent_phone_and_language(parent_uid)
        # Use language from Firebase if not explicitly passed
        if language == "en" and lang != "en":
            language = lang

        if not phone:
            print(f"[twilio] No phone number for uid: {parent_uid}")
            return {"sent": False, "reason": "no_phone"}

        message_body = build_sms_message(child_name, disease, center_name, risk_score, language)

        client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN"),
        )
        msg = client.messages.create(
            body=message_body,
            from_=os.getenv("TWILIO_FROM_NUMBER"),
            to=phone,
        )
        print(f"[twilio] SMS sent to {phone[:6]}*** sid={msg.sid}")
        return {"sent": True, "sid": msg.sid}

    except Exception as e:
        print(f"[twilio] send_sms_message error: {e}")
        return {"sent": False, "error": str(e)}


def alert_doctor_message(parent_uid: str, child_id: str,
                          risk_score: int, disease: str) -> dict:
    """
    Sends urgent SMS to doctor when family has ignored 2+ alerts.
    Always in English (doctors).
    """
    from services.firebase_service import get_doctor_phone_for_family, get_child_doc
    import asyncio

    try:
        doctor_phone = get_doctor_phone_for_family(parent_uid)
        if not doctor_phone:
            return {"sent": False, "reason": "no_doctor_registered"}

        # Get child name sync
        loop = asyncio.new_event_loop()
        child = loop.run_until_complete(get_child_doc(child_id))
        loop.close()
        child_name = child.get("name", "Patient") if child else "Patient"

        message = (
            f"[VaxGuard URGENT] {child_name} (ID: {child_id[:8]}) "
            f"has missed critical vaccinations. "
            f"Risk: {risk_score}/100 for {disease}. "
            f"Family has not responded to multiple reminders. "
            f"Please follow up."
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
        return {"sent": True, "sid": msg.sid, "target": "doctor"}

    except Exception as e:
        print(f"[twilio] alert_doctor_message error: {e}")
        return {"sent": False, "error": str(e)}


# ── USSD handler ──────────────────────────────────────────────────────────────

def handle_ussd_request(session_id: str, phone_number: str,
                         service_code: str, text: str) -> str:
    """
    Handles incoming USSD request from Twilio gateway.
    Called from routers/reminders.py POST /ussd endpoint.

    text="" = first menu (user dialed *123#)
    text="1" = user selected option 1
    text="1*2" = user selected option 1 then option 2

    Returns TwiML-style USSD response string.
    CON = continue (show menu again)
    END = end session
    """
    from services.firebase_service import get_db

    steps = text.split("*") if text else []

    # ── Level 0: Main menu ────────────────────────────────────────────────
    if not steps or steps == [""]:
        return (
            "CON Welcome to VaxGuard\n"
            "1. Check vaccine status\n"
            "2. Next due vaccine\n"
            "3. Nearest center\n"
            "4. Help"
        )

    # ── Level 1: Handle main menu selection ───────────────────────────────
    choice = steps[0]

    if choice == "1":
        # Check vaccine status — look up by phone number
        try:
            db = get_db()
            users = db.collection("users").where("phone", "==", phone_number).limit(1).stream()
            user_doc = next(iter(users), None)
            if not user_doc:
                return "END Phone not registered. Visit vaxguard.vercel.app to sign up."

            parent_uid = user_doc.id
            children = db.collection("children").where("parentUid", "==", parent_uid).stream()
            child_list = list(children)

            if not child_list:
                return "END No children registered. Visit vaxguard.vercel.app to add a child."

            lines = ["CON Vaccine Status:"]
            for child_doc in child_list[:3]:  # max 3 to fit USSD screen
                data = child_doc.to_dict()
                status = "OK" if not data.get("nextDueDate") else f"Due: {data.get('nextDueDate', 'N/A')}"
                lines.append(f"{data.get('name','Child')}: {status}")
            return "\n".join(lines)

        except Exception as e:
            print(f"[ussd] error: {e}")
            return "END Service unavailable. Call 104 for help."

    elif choice == "2":
        return (
            "END To check next due vaccine, visit vaxguard.vercel.app "
            "or call 104 (free health helpline)."
        )

    elif choice == "3":
        return (
            "END Find nearest PHC: dial 104 or visit nhp.gov.in/healthfacilityfinder"
        )

    elif choice == "4":
        return (
            "END VaxGuard Help:\n"
            "Website: vaxguard.vercel.app\n"
            "Health helpline: 104 (free)"
        )

    return "END Invalid option. Please try again."
