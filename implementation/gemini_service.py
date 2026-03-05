"""
backend/services/gemini_service.py
-----------------------------------
Gemini API wrapper for natural language explanations.
Called by /explain endpoint after SHAP + DiCE are computed.

CRITICAL: Uses gemini-1.5-flash — fast and cheap for this use case.
CRITICAL: Language codes: "en", "hi", "ta", "mr", "bn", "te"
CRITICAL: Never call Gemini inside LangGraph nodes — only in FastAPI routers.
          (LangGraph nodes use ChatGoogleGenerativeAI directly via LangChain)
"""

import os
import google.generativeai as genai

# Initialize once at module load
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
_model = genai.GenerativeModel("gemini-1.5-flash")

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "mr": "Marathi",
    "bn": "Bengali",
    "te": "Telugu",
}

# Human-readable feature name map for the prompt
FEATURE_LABELS = {
    "age_months":             "child's age",
    "vaccines_missed_count":  "number of missed vaccines",
    "days_overdue":           "days overdue on vaccination",
    "district_outbreak_flag": "active disease outbreak nearby",
    "sibling_history":        "sibling history of vaccine-preventable disease",
    "gender_male":            "child's gender",
    "state_high_risk":        "high-risk state",
    "reminder_ignored_count": "missed reminder responses",
}


async def generate_nl_explanation(
    child_name:       str,
    risk_score:       int,
    top_features:     list,  # from shap_explainer.get_top_features()
    counterfactuals:  list,  # from dice_explainer.get_counterfactuals()
    language:         str = "en",
) -> str:
    """
    Generates a plain-language paragraph explaining the risk score.
    Written for Indian parents — simple, warm, actionable.

    Returns explanation string. Returns fallback English on error.
    """
    lang_name = LANGUAGE_NAMES.get(language, "English")

    # Format top features for prompt
    feature_lines = "\n".join([
        f"- {FEATURE_LABELS.get(f['feature'], f['feature'])}: "
        f"{'increases' if f['direction'] == 'increases_risk' else 'decreases'} risk "
        f"(importance: {abs(f['value']):.2f})"
        for f in top_features
    ])

    # Format counterfactuals for prompt
    cf_lines = "\n".join([
        f"- {cf['change_description']} → risk drops to {cf['new_score']}/100"
        for cf in counterfactuals
    ]) if counterfactuals else "- Getting vaccinated soon would significantly reduce risk."

    prompt = f"""
You are a friendly health assistant for an Indian vaccination app.
Write a short paragraph (3-5 sentences) explaining this child's vaccination risk to their parent.
Write in {lang_name}. Use simple words. Be warm and helpful, not scary.
End with one clear action the parent should take.

Child's name: {child_name}
Risk score: {risk_score}/100 (above 70 = high risk)

Main reasons for this score:
{feature_lines}

What would reduce the risk:
{cf_lines}

Write only the explanation paragraph. No headers, no bullet points.
"""

    try:
        response = _model.generate_content(prompt)
        return response.text.strip()

    except Exception as e:
        print(f"[gemini_service] Error: {e}")
        # Fallback English explanation — never return empty string
        return (
            f"{child_name} has a risk score of {risk_score}/100. "
            f"The main reasons are: {', '.join(f['feature'] for f in top_features[:2])}. "
            f"Please visit your nearest vaccination center as soon as possible."
        )


async def generate_glossary_explanation(
    vaccine_name: str,
    language:     str = "en",
) -> dict:
    """
    Generates glossary entry for a vaccine not in glossary.json.
    Returns dict with: what_is_it, prevents, side_effects, when_given
    """
    lang_name = LANGUAGE_NAMES.get(language, "English")

    prompt = f"""
You are a medical information assistant for Indian parents.
Explain the vaccine "{vaccine_name}" in simple {lang_name}.
Respond with ONLY a JSON object with these exact keys:
{{
  "what_is_it": "one sentence explaining what this vaccine is",
  "prevents": "what diseases it prevents",
  "side_effects": "common normal side effects (fever, mild swelling etc.)",
  "when_given": "at what age it is given in India"
}}
No markdown, no extra text. Only the JSON object.
"""

    try:
        response = _model.generate_content(prompt)
        import json
        text = response.text.strip()
        # Strip markdown code blocks if Gemini adds them
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    except Exception as e:
        print(f"[gemini_service] glossary error: {e}")
        return {
            "what_is_it":   f"{vaccine_name} is a vaccine that protects children from disease.",
            "prevents":     "Vaccine-preventable disease",
            "side_effects": "Mild fever or soreness at injection site for 1-2 days.",
            "when_given":   "As per your doctor's recommendation.",
        }
