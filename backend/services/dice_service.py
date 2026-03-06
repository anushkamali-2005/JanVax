import dice_ml, pandas as pd, pickle, json
from dice_ml import Dice

model   = pickle.load(open('backend/models/xgb_risk_model.pkl',   'rb'))
encoder = pickle.load(open('backend/models/district_encoder.pkl', 'rb'))
FEATURES= json.load( open('backend/models/feature_names.json',    'r'))

# Build DiCE Data object — describes feature types and ranges
FEATURE_META = {
    'age_months':       {'type': 'continuous', 'range': [0, 60]},
    'gender':           {'type': 'categorical', 'categories': [0, 1]},
    'district_enc':     {'type': 'categorical', 'categories': list(range(10))},
    'vax_count':        {'type': 'continuous', 'range': [0, 12]},
    'who_outbreak_flag':{'type': 'categorical', 'categories': [0, 1]},
    'family_history':   {'type': 'categorical', 'categories': [0, 1]},
    'missed_doses':     {'type': 'continuous', 'range': [0, 10]},
}

_dice_model = dice_ml.Model(model=model, backend='sklearn', model_type='classifier')

def generate_counterfactuals(features_dict: dict) -> list[dict]:
    """
    Given a child's feature vector, generate 3 counterfactual scenarios.
    Returns a list of human-readable action sentences.
    """
    df_query = pd.DataFrame([features_dict])
    df_query = df_query[FEATURES]

    dice_data = dice_ml.Data(
        dataframe     = df_query,
        continuous_features = ['age_months','vax_count','missed_doses'],
        outcome_name  = 'high_risk'
    )
    exp = Dice(dice_data, _dice_model, method='random')

    # Only allow changing actionable features (not age, not district)
    cf = exp.generate_counterfactuals(
        df_query,
        total_CFs            = 3,
        desired_class        = 'opposite',  # flip from high risk to low risk
        permitted_range      = {'vax_count': [0,12], 'missed_doses': [0,10]},
        features_to_vary     = ['vax_count', 'missed_doses', 'family_history'],
    )

    results = []
    original_score = features_dict.get('risk_score', 78)

    for i, cf_row in enumerate(cf.cf_examples_list[0].final_cfs_df.iterrows()):
        _, row = cf_row
        cf_prob  = float(model.predict_proba(pd.DataFrame([row[FEATURES]]))[0][1])
        cf_score = min(100, int(cf_prob * 100))
        sentence = _to_sentence(features_dict, row.to_dict(), original_score, cf_score, i+1)
        results.append({'scenario': i+1, 'new_score': cf_score, 'action': sentence})
    return results

def _to_sentence(original, cf, orig_score, new_score, n) -> str:
    """Translate a counterfactual row into a plain English action sentence."""
    changes = []
    if cf.get('vax_count', 0) > original.get('vax_count', 0):
        diff = int(cf['vax_count']) - int(original['vax_count'])
        changes.append(f'receiving {diff} more vaccine dose(s)')
    if cf.get('missed_doses', 0) < original.get('missed_doses', 0):
        changes.append('catching up on missed doses')
    if not changes: changes.append('following the vaccination schedule')
    action_str = ' and '.join(changes)
    return (f'Scenario {n}: By {action_str}, risk could drop '
            f'from {orig_score}/100 to {new_score}/100.')
