"""
ml/features.py
--------------
SINGLE SOURCE OF TRUTH for all ML feature definitions.
Import FEATURE_COLUMNS from here everywhere — never hardcode feature names.
If features change, change them ONLY here.

CRITICAL: engineer_features() input is a raw Firestore child document dict.
CRITICAL: Output dict keys must exactly match FEATURE_COLUMNS order.
"""

from typing import Optional

# ── Feature columns in exact training order ───────────────────────────────────
# XGBoost is order-sensitive — never reorder this list
FEATURE_COLUMNS = [
    "age_months",               # int   0-60: child age in months
    "vaccines_missed_count",    # int   0-15: total vaccines missed so far
    "days_overdue",             # int   0-365: days since most critical missed vaccine
    "district_outbreak_flag",   # bin   0/1: active WHO outbreak in child's district
    "sibling_history",          # bin   0/1: sibling had vaccine-preventable disease
    "gender_male",              # bin   0/1: one-hot (male=1, female/other=0)
    "state_high_risk",          # bin   0/1: state in India's high-risk list
    "reminder_ignored_count",   # int   0-10: how many reminders family ignored
]

TARGET_COLUMN = "is_high_risk"  # 1 = risk_score > 70, 0 = otherwise

# Indian states with historically lower immunization coverage (NFHS-5 data)
HIGH_RISK_STATES = {
    "uttar_pradesh", "bihar", "rajasthan", "madhya_pradesh",
    "jharkhand", "chhattisgarh", "uttarakhand", "assam",
    "nagaland", "arunachal_pradesh", "meghalaya",
}


def engineer_features(child_dict: dict) -> dict:
    """
    Transform a raw Firestore children/{childId} document into
    a model-ready feature dict with exactly FEATURE_COLUMNS keys.

    Args:
        child_dict: Raw document from Firebase Firestore

    Returns:
        dict with keys matching FEATURE_COLUMNS — ready for model.predict()
    """
    state_raw = child_dict.get("state", "").lower().replace(" ", "_")

    return {
        "age_months":            int(child_dict.get("ageMonths", 0)),
        "vaccines_missed_count": int(child_dict.get("vaccinesMissedCount", 0)),
        "days_overdue":          int(child_dict.get("daysOverdue", 0)),
        "district_outbreak_flag": int(bool(child_dict.get("districtOutbreakFlag", 0))),
        "sibling_history":       int(bool(child_dict.get("siblingHistory", False))),
        "gender_male":           int(child_dict.get("gender", "").lower() == "male"),
        "state_high_risk":       int(state_raw in HIGH_RISK_STATES),
        "reminder_ignored_count": int(child_dict.get("reminderIgnoreCount", 0)),
    }


def features_to_series(feature_dict: dict):
    """Returns a pandas Series with columns in correct FEATURE_COLUMNS order."""
    import pandas as pd
    return pd.DataFrame([feature_dict])[FEATURE_COLUMNS]
