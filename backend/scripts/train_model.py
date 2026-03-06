import pandas as pd, numpy as np, pickle, json, mlflow
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, roc_auc_score
import os

df = pd.read_csv('backend/data/training_data.csv')

# Encode district string → integer
le = LabelEncoder()
df['district_enc'] = le.fit_transform(df['district'])

FEATURES = ['age_months','gender','district_enc','vax_count',
            'who_outbreak_flag','family_history','missed_doses']

X = df[FEATURES]
y = df['high_risk']

X_train,X_test,y_train,y_test = train_test_split(X,y,test_size=0.2,random_state=42)

model = XGBClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    use_label_encoder=False,
    eval_metric='logloss',
    random_state=42
)

model.fit(X_train, y_train,
          eval_set=[(X_test, y_test)], verbose=50)

# Evaluate
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:,1]
auc    = roc_auc_score(y_test, y_prob)
print(classification_report(y_test, y_pred))
print(f'AUC: {auc:.4f}')

# Save model + encoder
os.makedirs('backend/models', exist_ok=True)
pickle.dump(model, open('backend/models/xgb_risk_model.pkl', 'wb'))
pickle.dump(le,    open('backend/models/district_encoder.pkl','wb'))
json.dump(FEATURES,open('backend/models/feature_names.json','w'))

# Log to MLflow
mlflow.set_experiment('JanVax_Risk_Engine')
with mlflow.start_run():
    mlflow.log_param('n_estimators', 200)
    mlflow.log_metric('auc', auc)
    mlflow.xgboost.log_model(model, 'xgb_risk_model')
    print(f'Model logged to MLflow. AUC = {auc:.4f}')

print('Model saved to backend/models/')
