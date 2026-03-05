"""
backend/routers/predict.py
--------------------------
/predict and /explain endpoints.
This is the most complex router — glues ML, SHAP, DiCE, Gemini, Polygon.

CRITICAL: /predict auto-triggers agent if risk_score > 70 (background task).
CRITICAL: /explain fetches prediction from PostgreSQL by prediction_id.
CRITICAL: Gemini explanation is generated in parent's language.
CRITICAL: Every prediction is hashed + stored on Polygon via verify service.
"""

import json
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ml.features import engineer_features, HIGH_RISK_STATES
from ml.shap_explainer import get_risk_and_shap, get_top_features
from ml.dice_explainer import get_counterfactuals
from services.firebase_service import get_child_doc, get_user_language
from services.gemini_service import generate_nl_explanation
from services.polygon_service import store_hash
from services.firebase_service import verify_firebase_token
from database.postgres import get_session
from sqlalchemy import text

logger = logging.getLogger("vaxguard.predict")

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    child_id:              str
    age_months:            int
    gender:                str
    vaccines_missed_count: int
    days_overdue:          int
    district_outbreak_flag: int
    sibling_history:       int
    top_missed_vaccine:    str


class ExplainRequest(BaseModel):
    prediction_id: int
    child_id:      str
    language:      str = "en"


# ── POST /predict ─────────────────────────────────────────────────────────────

@router.post("/predict")
async def predict(
    req: PredictRequest,
    background_tasks: BackgroundTasks,
    uid: str = Depends(verify_firebase_token),
):
    """
    Runs risk model for a child.
    Auto-triggers agent pipeline if risk_score > 70.
    Stores prediction in PostgreSQL and hashes on Polygon.
    """
    # Build feature dict from request
    # We use req fields directly (already validated by Pydantic)
    # rather than fetching from Firestore again — avoids extra DB call
    feature_dict = {
        "age_months":             req.age_months,
        "vaccines_missed_count":  req.vaccines_missed_count,
        "days_overdue":           req.days_overdue,
        "district_outbreak_flag": req.district_outbreak_flag,
        "sibling_history":        req.sibling_history,
        "gender_male":            int(req.gender.lower() == "male"),
        "state_high_risk":        0,   # will be filled from Firestore below
        "reminder_ignored_count": 0,   # will be filled from Firestore below
    }

    # Fetch child doc to get state + reminder count (not passed in request)
    child_doc = await get_child_doc(req.child_id)
    if not child_doc:
        raise HTTPException(status_code=404, detail="Child not found")

    # Update features with Firestore data
    state_raw = child_doc.get("state", "").lower().replace(" ", "_")
    feature_dict["state_high_risk"]       = int(state_raw in HIGH_RISK_STATES)
    feature_dict["reminder_ignored_count"] = int(child_doc.get("reminderIgnoreCount", 0))

    # Run model + SHAP in one call
    risk_score, shap_values = get_risk_and_shap(feature_dict)

    # Determine risk level
    if risk_score >= 70:
        risk_level = "HIGH"
    elif risk_score >= 40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # Determine top disease (simplified — map from top_missed_vaccine)
    disease_map = {
        "MMR-1": "measles", "MMR-2": "measles",
        "OPV-0": "polio",   "IPV-1": "polio",
        "BCG":   "tuberculosis",
        "DPT-1": "diphtheria", "DPT-2": "diphtheria", "DPT-3": "diphtheria",
        "HEP-B0": "hepatitis_b", "HEP-A1": "hepatitis_a",
    }
    top_disease = disease_map.get(req.top_missed_vaccine, req.top_missed_vaccine.lower())

    # Get MLflow model version for display
    try:
        import mlflow
        client = mlflow.tracking.MlflowClient()
        versions = client.get_latest_versions("VaxGuardRiskModel", stages=["Production", "None"])
        model_version = f"v{versions[0].version}" if versions else "v1.0"
    except Exception:
        model_version = "v1.0"

    # Build prediction record for hashing
    prediction_record = {
        "child_id":      req.child_id,
        "model_version": model_version,
        "risk_score":    risk_score,
        "top_disease":   top_disease,
        "shap_values":   shap_values,
        "input_features": feature_dict,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }

    # Hash and store on Polygon (background — don't block response)
    record_hash = hashlib.sha256(
        json.dumps(prediction_record, sort_keys=True).encode()
    ).hexdigest()

    background_tasks.add_task(_store_prediction, prediction_record, record_hash, uid, req.child_id)

    # Auto-trigger agent if HIGH risk
    if risk_score >= 70:
        background_tasks.add_task(
            _trigger_agent,
            child_id=req.child_id,
            risk_score=risk_score,
            top_disease=top_disease,
            parent_uid=uid,
            shap_values=shap_values,
            child_data=child_doc,
        )

    # Save prediction_id will be set in background — return 0 as placeholder
    # Frontend should use child_id + timestamp to correlate if needed
    return {
        "child_id":      req.child_id,
        "model_version": model_version,
        "risk_scores":   {top_disease: risk_score},
        "top_disease":   top_disease,
        "top_score":     risk_score,
        "risk_level":    risk_level,
        "record_hash":   record_hash,
    }


# ── POST /explain ─────────────────────────────────────────────────────────────

@router.post("/explain")
async def explain(
    req: ExplainRequest,
    uid: str = Depends(verify_firebase_token),
):
    """
    Returns SHAP, DiCE counterfactuals, and Gemini NL explanation
    for a previously computed prediction.
    """
    # Fetch prediction from PostgreSQL
    async with get_session() as session:
        row = await session.execute(
            text("SELECT shap_values, input_features, risk_score FROM ai_predictions "
                 "WHERE id = :pid AND child_id = :cid"),
            {"pid": req.prediction_id, "cid": req.child_id}
        )
        pred = row.fetchone()

    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")

    shap_values   = pred.shap_values    # already a dict from JSONB
    input_features = pred.input_features
    risk_score     = pred.risk_score

    # DiCE counterfactuals
    counterfactuals = get_counterfactuals(input_features, n=2)

    # Top 3 features for Gemini prompt
    top_features = get_top_features(shap_values, n=3)

    # Gemini NL explanation
    child_doc   = await get_child_doc(req.child_id)
    child_name  = child_doc.get("name", "your child") if child_doc else "your child"

    nl_explanation    = await generate_nl_explanation(
        child_name=child_name,
        risk_score=risk_score,
        top_features=top_features,
        counterfactuals=counterfactuals,
        language=req.language,
    )
    nl_explanation_en = await generate_nl_explanation(
        child_name=child_name,
        risk_score=risk_score,
        top_features=top_features,
        counterfactuals=counterfactuals,
        language="en",
    ) if req.language != "en" else nl_explanation

    return {
        "shap_values":      shap_values,
        "counterfactuals":  counterfactuals,
        "nl_explanation":   nl_explanation,
        "nl_explanation_en": nl_explanation_en,
    }


# ── Background helpers ────────────────────────────────────────────────────────

async def _store_prediction(record: dict, record_hash: str, parent_uid: str, child_id: str) -> None:
    """Stores prediction in PostgreSQL and hash on Polygon."""
    try:
        # Store on Polygon
        tx_id = await store_hash(record_json=record, entity_type="prediction", entity_id=child_id)

        # Store in PostgreSQL
        async with get_session() as session:
            await session.execute(text("""
                INSERT INTO ai_predictions
                    (child_id, parent_uid, model_version, risk_score, risk_disease,
                     shap_values, input_features, record_hash, polygon_tx_id)
                VALUES
                    (:child_id, :parent_uid, :model_version, :risk_score, :risk_disease,
                     :shap_values, :input_features, :record_hash, :polygon_tx_id)
            """), {
                "child_id":      child_id,
                "parent_uid":    parent_uid,
                "model_version": record["model_version"],
                "risk_score":    record["risk_score"],
                "risk_disease":  record["top_disease"],
                "shap_values":   json.dumps(record["shap_values"]),
                "input_features": json.dumps(record["input_features"]),
                "record_hash":   record_hash,
                "polygon_tx_id": tx_id,
            })
            await session.commit()
    except Exception as exc:
        logger.error("Failed to store prediction for child %s: %s", child_id, exc)


async def _trigger_agent(
    child_id: str,
    risk_score: int,
    top_disease: str,
    parent_uid: str,
    shap_values: dict,
    child_data: dict,
) -> None:
    """Triggers LangGraph agent graph for high-risk child."""
    try:
        from agents.graph import agent_graph
        initial_state = {
            "child_id":           child_id,
            "prediction_id":      0,
            "risk_score":         risk_score,
            "top_disease":        top_disease,
            "parent_uid":         parent_uid,
            "shap_values":        shap_values,
            "child_data":         child_data,
            "analyst_output":     None,
            "advocate_output":    None,
            "decision":           None,
            "nearest_center":     None,
            "family_memory":      None,
            "escalate_to_doctor": None,
            "actions_taken":      None,
            "debate_log":         [],
        }
        agent_graph.invoke(initial_state)
    except Exception as exc:
        logger.error("Agent trigger failed for child %s: %s", child_id, exc)
