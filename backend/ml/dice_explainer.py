"""
ml/dice_explainer.py
--------------------
DiCE counterfactual generator.
Answers: "What would need to change to lower the risk score?"

CRITICAL: DiCE needs the training dataframe at init time — load once.
CRITICAL: desired_class=0 means "flip to NOT high_risk" — this is correct.
CRITICAL: Only perturb actionable features — not age_months (can't change a child's age).
CRITICAL: Returns human-readable strings, not raw feature dicts.
"""

import os
import joblib
import pandas as pd
import dice_ml

from ml.features import FEATURE_COLUMNS, TARGET_COLUMN

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../backend/models/xgb_model.pkl")
DATA_PATH  = os.path.join(os.path.dirname(__file__), "data/synthetic_records.csv")

# Features a parent can actually act on — do not include age_months or gender_male
ACTIONABLE_FEATURES = [
    "vaccines_missed_count",
    "days_overdue",
    "reminder_ignored_count",
]

# Features that are fixed / not actionable
IMMUTABLE_FEATURES = [
    "age_months",
    "gender_male",
    "state_high_risk",
    "district_outbreak_flag",
    "sibling_history",
]

_dice_exp = None


def _load():
    global _dice_exp
    if _dice_exp is not None:
        return

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Training data not found: {DATA_PATH}. Run synthetic_seed.py first.")

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


def get_counterfactuals(feature_dict: dict, n: int = 2) -> list[dict]:
    """
    Returns list of human-readable counterfactual explanations.

    Each item: {
        "change_description": "Get vaccinated in next 7 days",
        "new_score": 12,
        "feature_changes": {"days_overdue": 0, "vaccines_missed_count": 0}
    }

    Returns empty list on failure — never raises, never crashes the API.
    """
    try:
        _load()

        input_df = pd.DataFrame([feature_dict])[FEATURE_COLUMNS]

        cfs = _dice_exp.generate_counterfactuals(
            input_df,
            total_CFs=n,
            desired_class=0,                    # flip to NOT high_risk
            features_to_vary=ACTIONABLE_FEATURES,
        )

        results = []
        cf_df = cfs.cf_examples_list[0].final_cfs_df

        if cf_df is None or len(cf_df) == 0:
            return []

        model = joblib.load(MODEL_PATH)

        for _, row in cf_df.iterrows():
            cf_dict = row.to_dict()

            # Find what changed vs original
            changes = {
                k: cf_dict[k]
                for k in ACTIONABLE_FEATURES
                if abs(cf_dict.get(k, 0) - feature_dict.get(k, 0)) > 0.01
            }

            # New risk score for this counterfactual
            cf_input  = pd.DataFrame([cf_dict])[FEATURE_COLUMNS]
            new_prob  = model.predict_proba(cf_input)[0][1]
            new_score = int(round(new_prob * 100))

            # Build human-readable description
            description = _describe_changes(changes)
            if description:
                results.append({
                    "change_description": description,
                    "new_score":          new_score,
                    "feature_changes":    changes,
                })

        return results

    except Exception as e:
        print(f"[dice_explainer] Error: {e}")
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
