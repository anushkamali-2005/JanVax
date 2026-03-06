"""
ml/dice_explainer.py
--------------------
DiCE counterfactual generator for JanVax Risk Model.
"""

import os
import joblib
import logging
import pandas as pd
import dice_ml
from typing import List, Dict, Any, Optional

from ml.features import FEATURE_COLUMNS, TARGET_COLUMN

logger = logging.getLogger("vaxguard.ml.dice")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/xgb_model.pkl")
DATA_PATH  = os.path.join(os.path.dirname(__file__), "data/synthetic_records.csv")

# ── Actionable vs Immutable Features ──────────────────────────────────────────

ACTIONABLE_FEATURES = [
    "vaccines_missed_count",
    "days_overdue",
    "reminder_ignored_count",
]

IMMUTABLE_FEATURES = [
    "age_months",
    "gender_male",
    "state_high_risk",
    "district_outbreak_flag",
    "sibling_history",
]

_dice_exp: Optional[dice_ml.Dice] = None


def _load():
    global _dice_exp
    if _dice_exp is not None:
        return

    if not os.path.exists(MODEL_PATH) or not os.path.exists(DATA_PATH):
        logger.error("Required ML files missing (model or training data)")
        return

    try:
        model    = joblib.load(MODEL_PATH)
        train_df = pd.read_csv(DATA_PATH)[FEATURE_COLUMNS + [TARGET_COLUMN]]

        d = dice_ml.Data(
            dataframe=train_df,
            continuous_features=[
                "age_months", "vaccines_missed_count",
                "days_overdue", "reminder_ignored_count",
            ],
            outcome_name=TARGET_COLUMN,
        )
        m = dice_ml.Model(model=model, backend="sklearn")
        _dice_exp = dice_ml.Dice(d, m, method="random")
        logger.info("DiCE explainer initialized.")
    except Exception as exc:
        logger.error("Failed to initialize DiCE: %s", exc)


def get_counterfactuals(feature_dict: dict, n: int = 2) -> List[Dict[str, Any]]:
    """
    Returns list of human-readable counterfactual explanations.
    """
    _load()
    if _dice_exp is None:
        return []

    try:
        input_df = pd.DataFrame([feature_dict])[FEATURE_COLUMNS]

        cfs = _dice_exp.generate_counterfactuals(
            input_df,
            total_CFs=n,
            desired_class=0,
            features_to_vary=ACTIONABLE_FEATURES,
        )

        results = []
        cf_df = cfs.cf_examples_list[0].final_cfs_df

        if cf_df is None or len(cf_df) == 0:
            return []

        # Load model again to score CFs (cheap if cached by OS)
        model = joblib.load(MODEL_PATH)

        for _, row in cf_df.iterrows():
            cf_dict = row.to_dict()

            # Find what changed vs original
            changes = {
                k: cf_dict[k]
                for k in ACTIONABLE_FEATURES
                if abs(cf_dict.get(k, 0) - feature_dict.get(k, 0)) > 0.01
            }

            cf_input  = pd.DataFrame([cf_dict])[FEATURE_COLUMNS]
            new_prob  = model.predict_proba(cf_input)[0][1]
            new_score = int(round(new_prob * 100))

            description = _describe_changes(changes)
            if description:
                results.append({
                    "change_description": description,
                    "new_score":          new_score,
                    "feature_changes":    changes,
                })

        return results

    except Exception as exc:
        logger.error("DiCE generation failed: %s", exc)
        return []


def _describe_changes(changes: dict) -> str:
    """Convert feature changes into a human-readable sentence."""
    parts = []

    if "days_overdue" in changes and changes["days_overdue"] < 5:
        parts.append("get vaccinated within the next 7 days")

    if "vaccines_missed_count" in changes and changes["vaccines_missed_count"] == 0:
        parts.append("complete all pending vaccines")

    if "reminder_ignored_count" in changes and changes["reminder_ignored_count"] == 0:
        parts.append("respond to health reminders")

    if not parts:
        return ""

    return "If " + " and ".join(parts)
