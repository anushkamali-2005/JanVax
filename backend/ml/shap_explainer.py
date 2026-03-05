"""
ml/shap_explainer.py
--------------------
SHAP TreeExplainer wrapper for XGBoost risk model.
Returns SHAP values as clean {feature: float} dict for the API.

CRITICAL: explainer is created once at module load — expensive to recreate.
CRITICAL: shap_values[0] is the array for the positive class (HIGH_RISK).
CRITICAL: Import this in backend/routers/predict.py — do not recreate explainer per request.
"""

import os
import joblib
import numpy as np
import pandas as pd
import shap

from ml.features import FEATURE_COLUMNS, features_to_series

# ── Load model + build explainer once ────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../backend/models/xgb_model.pkl")

_model    = None
_explainer = None

def _load():
    global _model, _explainer
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. "
                "Run: python ml/train.py first."
            )
        _model    = joblib.load(MODEL_PATH)
        _explainer = shap.TreeExplainer(_model)

_load()


# ── Public API ────────────────────────────────────────────────────────────────

def get_risk_score(feature_dict: dict) -> int:
    """
    Returns integer risk score 0-100.
    = probability of HIGH_RISK class × 100, rounded.
    """
    df   = features_to_series(feature_dict)
    prob = _model.predict_proba(df)[0][1]   # index 1 = HIGH_RISK class
    return int(round(prob * 100))


def get_shap_values(feature_dict: dict) -> dict:
    """
    Returns SHAP values as {feature_name: float} dict.
    Positive value = pushes risk score UP.
    Negative value = pushes risk score DOWN.
    """
    df          = features_to_series(feature_dict)
    shap_values = _explainer.shap_values(df)

    # For binary XGBoost: shap_values is shape (1, n_features)
    # or (2, 1, n_features) — handle both
    if isinstance(shap_values, list):
        vals = shap_values[1][0]   # positive class
    else:
        vals = shap_values[0]

    return {
        FEATURE_COLUMNS[i]: round(float(vals[i]), 4)
        for i in range(len(FEATURE_COLUMNS))
    }


def get_risk_and_shap(feature_dict: dict) -> tuple[int, dict]:
    """
    Returns (risk_score, shap_values) in one call.
    Avoids running model twice when both are needed.
    """
    df          = features_to_series(feature_dict)
    prob        = _model.predict_proba(df)[0][1]
    risk_score  = int(round(prob * 100))
    shap_vals   = get_shap_values(feature_dict)
    return risk_score, shap_vals


def get_top_features(shap_dict: dict, n: int = 3) -> list[dict]:
    """
    Returns top N features sorted by absolute SHAP value.
    Used by the Gemini NL explanation prompt.
    e.g. [{"feature": "days_overdue", "value": 0.42, "direction": "increases_risk"}]
    """
    sorted_features = sorted(
        shap_dict.items(),
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:n]

    return [
        {
            "feature":   feat,
            "value":     val,
            "direction": "increases_risk" if val > 0 else "decreases_risk",
        }
        for feat, val in sorted_features
    ]
