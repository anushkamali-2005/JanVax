from fastapi import APIRouter
from pydantic import BaseModel
import pickle, json, shap, numpy as np
from services.who_feed import get_who_flag
from database.models import SessionLocal, PredictionLog
import hashlib, uuid
from datetime import datetime

router = APIRouter(prefix='/predict', tags=['predict'])

# Load model and encoder once at import time
model   = pickle.load(open('backend/models/xgb_risk_model.pkl',   'rb'))
encoder = pickle.load(open('backend/models/district_encoder.pkl', 'rb'))
FEATURES= json.load( open('backend/models/feature_names.json',    'r'))

# SHAP explainer — built once, reused for every request
explainer = shap.TreeExplainer(model)

class ChildInput(BaseModel):
    child_id:       str
    age_months:     int
    gender:         int      # 0 = female, 1 = male
    district:       str      # e.g. 'Pune'
    vax_count:      int      # number of vaccines already given
    family_history: int = 0  # 1 if family has relevant disease history
    missed_doses:   int = 0  # number of missed scheduled doses
    language:       str = 'english'

@router.post('')
async def predict_risk(child: ChildInput):
    # 1. Encode district
    try:
        district_enc = int(encoder.transform([child.district])[0])
    except ValueError:
        district_enc = 0   # unknown district → use baseline

    # 2. Assemble feature vector
    who_flag = get_who_flag()
    features = np.array([[
        float(child.age_months),
        float(child.gender),
        float(district_enc),
        float(child.vax_count),
        float(who_flag),
        float(child.family_history),
        float(child.missed_doses),
    ]])

    # 3. Predict
    prob       = float(model.predict_proba(features)[0][1])
    risk_score = min(100, int(prob * 100 + 0.5))

    # 4. SHAP — per-feature contribution values
    shap_values = explainer.shap_values(features)
    # For binary XGBoost, shap_values is a list [class_0, class_1]
    vals = shap_values[1][0] if isinstance(shap_values, list) else shap_values[0]
    shap_dict = {FEATURES[i]: round(float(vals[i]),4) for i in range(len(FEATURES))}

    # 5. Log to database for audit trail
    bundle = {
        'child_id':    child.child_id,
        'risk_score':  risk_score,
        'shap_values': shap_dict,
        'timestamp':   datetime.utcnow().isoformat()
    }
    bh = hashlib.sha256(json.dumps(bundle, sort_keys=True).encode()).hexdigest()

    db = SessionLocal()
    db.add(PredictionLog(
        id=str(uuid.uuid4()), child_id=child.child_id,
        risk_score=risk_score, shap_values=json.dumps(shap_dict),
        model_version='v2.3', blockchain_hash=bh,
        action_taken='pending'
    ))
    db.commit(); db.close()

    # 6. Return
    response = {
        'child_id':         child.child_id,
        'risk_score':       risk_score,
        'high_risk':        risk_score >= 70,
        'who_flag_active':  bool(who_flag),
        'shap_values':      shap_dict,
        'model_version':    'v2.3',
        'blockchain_hash':  bh,
    }
    # Trigger agentic pipeline if score >= 70
    if risk_score >= 70:
        from agents.graph import run_agent
        import asyncio
        asyncio.create_task(run_agent({
            'child': child.dict(), 'risk_score': risk_score,
            'shap_values': shap_dict
        }))
    return response
