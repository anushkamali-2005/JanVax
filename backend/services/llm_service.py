"""
backend/services/llm_service.py
-----------------------------------
OpenAI API wrapper for natural language explanations.
Replaces the previous Gemini implementation.

CRITICAL: Uses gpt-4o or gpt-3.5-turbo.
CRITICAL: Language codes: "en", "hi", "ta", "mr", "bn", "te"
CRITICAL: Handle missing API keys gracefully (return English fallbacks).
"""

import os
import json
import logging
from typing import Optional, Dict, List, Any
from openai import OpenAI

logger = logging.getLogger("vaxguard.llm")

# Lazy client initialization
_client: Optional[OpenAI] = None

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "mr": "Marathi",
    "bn": "Bengali",
    "te": "Telugu",
}

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


def _get_client() -> Optional[OpenAI]:
    """Lazily initializes the OpenAI client."""
    global _client
    if _client is not None:
        return _client
        
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set. Natural language explanations will use fallbacks.")
        return None
        
    try:
        _client = OpenAI(api_key=api_key)
        logger.info("OpenAI client initialized successfully.")
        return _client
    except Exception as exc:
        logger.error("Failed to initialize OpenAI client: %s", exc)
        return None


async def generate_nl_explanation(
    child_name:       str,
    risk_score:       int,
    top_features:     List[Dict[str, Any]],
    counterfactuals:  List[Dict[str, Any]],
    language:         str = "en",
) -> str:
    """
    Generates a plain-language paragraph explaining the risk score using OpenAI.
    """
    client = _get_client()
    lang_name = LANGUAGE_NAMES.get(language, "English")

    def _fallback():
        return (
            f"{child_name} has a risk score of {risk_score}/100. "
            f"The main reasons are: {', '.join(f['feature'] for f in top_features[:2])}. "
            f"Please visit your nearest vaccination center as soon as possible."
        )

    if not client:
        return _fallback()

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
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=300
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("OpenAI explanation generation failed: %s", exc)
        return _fallback()


async def generate_glossary_explanation(
    vaccine_name: str,
    language:     str = "en",
) -> Dict[str, str]:
    """Generates glossary entry for a vaccine using OpenAI."""
    client = _get_client()
    lang_name = LANGUAGE_NAMES.get(language, "English")

    fallback = {
        "what_is_it":   f"{vaccine_name} is a vaccine that protects children from disease.",
        "prevents":     "Vaccine-preventable disease",
        "side_effects": "Mild fever or soreness at injection site for 1-2 days.",
        "when_given":   "As per your doctor's recommendation.",
    }

    if not client:
        return fallback

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
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content.strip())
    except Exception as exc:
        logger.error("OpenAI glossary generation failed: %s", exc)
        return fallback
