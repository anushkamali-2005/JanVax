from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import google.generativeai as genai, os, json
from services.dice_service import generate_counterfactuals

router = APIRouter(prefix='/explain', tags=['explain'])
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
gemini = genai.GenerativeModel('gemini-1.5-flash')

class ExplainInput(BaseModel):
    child_name:     str
    risk_score:     int
    shap_values:    dict   # from /predict response
    features:       dict   # original feature dict
    language:       str = 'english'

FEATURE_LABELS = {
    'age_months':        'Child age',
    'vax_count':         'Vaccines received so far',
    'who_outbreak_flag': 'Active disease outbreak in region',
    'missed_doses':      'Missed vaccination doses',
    'family_history':    'Family disease history',
    'district_enc':      'District risk level',
    'gender':            'Gender',
}

@router.post('')
async def explain_risk(data: ExplainInput):
    print(f"DEBUG: /explain received data: {data.dict()}")
    # 1. Top SHAP features — sort by absolute value, take top 5
    sorted_shap = sorted(data.shap_values.items(),
                         key=lambda x: abs(x[1]), reverse=True)[:5]
    shap_readable = [
        {'feature': FEATURE_LABELS.get(k,k), 'contribution': v, 'direction': 'increases' if v>0 else 'decreases'}
        for k, v in sorted_shap
    ]

    # 2. DiCE counterfactuals
    try:
        # Map input features to the exact column names the backend expect for DiCE
        # (Assuming they match the FEATURES list in predict.py)
        dice_input = {
            'age_months':        data.features.get('age_months', 12),
            'gender':            data.features.get('gender', 1),
            'district_enc':      data.features.get('district_enc', 0),
            'vax_count':         data.features.get('vax_count', 1),
            'who_outbreak_flag': data.features.get('who_outbreak_flag', 0),
            'family_history':    data.features.get('family_history', 0),
            'missed_doses':      data.features.get('missed_doses', 0),
            'risk_score':        data.risk_score
        }
        counterfactuals = generate_counterfactuals(dice_input)
    except Exception as e:
        print(f'DiCE error: {e}')
        # Fallback counterfactual if DiCE fails
        new_score = max(5, data.risk_score - 60)
        counterfactuals = [{
            'scenario': 1,
            'new_score': new_score,
            'action': f'By completing overdue vaccinations, risk could drop from {data.risk_score}/100 to {new_score}/100.'
        }]

    # 3. Gemini natural language explanation
    top_reason = shap_readable[0]['feature'] if shap_readable else 'vaccination history'
    top_cf     = counterfactuals[0]['action'] if counterfactuals else ''

    prompt = f'''
You are a friendly health advisor explaining a child's vaccination risk to a parent in India.
Speak in {data.language}. Keep it under 60 words. Use simple language, no jargon.
Be reassuring but clear about the urgency.

Child name: {data.child_name}
Risk score: {data.risk_score}/100 — {'high risk' if data.risk_score >= 70 else 'moderate risk'}
Top reason: {top_reason}
What would help: {top_cf}

Write 2-3 sentences that a non-medical parent will immediately understand.
End with one concrete action they should take today.
    '''

    try:
        gem_resp    = gemini.generate_content(prompt)
        explanation = gem_resp.text
    except Exception as e:
        print(f'Gemini error: {e}')
        explanation = (f'{data.child_name} has a risk score of {data.risk_score}/100, '
                       f'mainly due to {top_reason}. {top_cf} '
                       f'Please contact your nearest health centre today.')

    return {
        'risk_score':       data.risk_score,
        'shap_features':    shap_readable,
        'counterfactuals':  counterfactuals,
        'explanation':      explanation,    # For older frontend versions
        'nl_explanation':   explanation,    # For standardized API
        'language':         data.language,
    }
