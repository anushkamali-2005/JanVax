"""
ml/shap_explainer.py
--------------------
SHAP TreeExplainer wrapper for JanVax Risk Model.
"""

import os
import joblib
import logging
import numpy as np
import pandas as pd
import shap
from typing import Dict, List, Tuple, Any, Optional

from ml.features import FEATURE_COLUMNS, features_to_series

logger = logging.getLogger("vaxguard.ml.shap")

# ── Load model + build explainer once ────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/xgb_model.pkl")

_model: Optional[Any] = None
_explainer: Optional[shap.TreeExplainer] = None

def _load():
    global _model, _explainer
    if _model is not None:
        return
        
    if not os.path.exists(MODEL_PATH):
        logger.error("Model file missing at %s", MODEL_PATH)
        return

    try:
        _model     = joblib.load(MODEL_PATH)
        _explainer = shap.TreeExplainer(_model)
        logger.info("SHAP explainer initialized with model from %s", MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load model/explainer: %s", exc)

_load()


def get_risk_score(feature_dict: dict) -> int:
    """Returns integer risk score 0-100."""
    if _model is None:
        return 0
    try:
        df   = features_to_series(feature_dict)
        prob = _model.predict_proba(df)[0][1]
        return int(round(prob * 100))
    except Exception as exc:
        logger.error("get_risk_score error: %s", exc)
        return 0


def get_shap_values(feature_dict: dict) -> dict:
    """Returns SHAP values as {feature_name: float} dict."""
    if _explainer is None:
        return {}
    try:
        df          = features_to_series(feature_dict)
        shap_values = _explainer.shap_values(df)

        # Handle binary XGBoost output shapes
        if isinstance(shap_values, list):
            vals = shap_values[1][0]
        else:
            vals = shap_values[0]

        return {
            FEATURE_COLUMNS[i]: round(float(vals[i]), 4)
            for i in range(len(FEATURE_COLUMNS))
        }
    except Exception as exc:
        logger.error("get_shap_values error: %s", exc)
        return {}


def get_risk_and_shap(feature_dict: dict) -> Tuple[int, dict]:
    """Returns (risk_score, shap_values) in one call."""
    return get_risk_score(feature_dict), get_shap_values(feature_dict)


def get_top_features(shap_dict: dict, n: int = 3) -> List[Dict[str, Any]]:
    """Returns top N features sorted by absolute SHAP value."""
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
