"""
ml/train.py
-----------
XGBoost training pipeline with MLflow tracking.
Called by GitHub Actions weekly retraining cron.
Also callable manually: python ml/train.py

CRITICAL: Validation gate — model only deploys if val_accuracy >= 0.90.
CRITICAL: Model saved to backend/models/xgb_model.pkl on pass.
CRITICAL: MLflow run always logged regardless of pass/fail.
"""

import os
import sys
import json
import joblib
import pandas as pd
import numpy as np
import mlflow
import mlflow.xgboost
import xgboost as xgb

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.preprocessing import label_binarize

# Add project root to path when run directly
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from ml.features import FEATURE_COLUMNS, TARGET_COLUMN

ACCURACY_GATE   = 0.90
MODEL_OUTPUT    = os.path.join(os.path.dirname(__file__), "../backend/models/xgb_model.pkl")
MLFLOW_MODEL_NAME = "VaxGuardRiskModel"


def load_data(data_path: str = None) -> pd.DataFrame:
    """
    Loads and combines all training data sources.
    Looks for CSVs in ml/data/ directory.
    """
    data_dir = os.path.join(os.path.dirname(__file__), "data")

    dfs = []
    for fname in ["who_immunization.csv", "icmr_child_health.csv", "synthetic_records.csv"]:
        fpath = os.path.join(data_dir, fname)
        if os.path.exists(fpath):
            df = pd.read_csv(fpath)
            dfs.append(df)
            print(f"  Loaded {fname}: {len(df)} rows")

    if not dfs:
        raise FileNotFoundError(
            f"No training data found in {data_dir}. "
            "Run: python scripts/seed_firebase.py first, or add CSVs to ml/data/"
        )

    combined = pd.concat(dfs, ignore_index=True)
    print(f"  Combined: {len(combined)} total rows")
    return combined


def train_model(data_path: str = None) -> float:
    """
    Full training pipeline.
    Returns val_accuracy.
    Deploys model if accuracy >= ACCURACY_GATE.
    """
    mlflow.set_experiment("VaxGuard-Risk-Model")

    print("Loading data...")
    df = load_data(data_path)

    # Validate all required columns exist
    missing = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in training data: {missing}")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN].astype(int)

    print(f"Class distribution: {y.value_counts().to_dict()}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y,   # preserve class balance in both splits
    )

    with mlflow.start_run() as run:
        print(f"MLflow run: {run.info.run_id}")

        # ── Hyperparameters ────────────────────────────────────────────────
        params = {
            "n_estimators":      200,
            "max_depth":         6,
            "learning_rate":     0.1,
            "subsample":         0.8,
            "colsample_bytree":  0.8,
            "min_child_weight":  3,
            "gamma":             0.1,
            "use_label_encoder": False,
            "eval_metric":       "logloss",
            "random_state":      42,
        }
        mlflow.log_params(params)

        # ── Train ──────────────────────────────────────────────────────────
        model = xgb.XGBClassifier(**params)
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        # ── Evaluate ───────────────────────────────────────────────────────
        y_pred      = model.predict(X_test)
        y_pred_prob = model.predict_proba(X_test)[:, 1]

        val_accuracy = accuracy_score(y_test, y_pred)
        val_f1       = f1_score(y_test, y_pred, zero_division=0)
        val_auc      = roc_auc_score(y_test, y_pred_prob)
        cm           = confusion_matrix(y_test, y_pred).tolist()

        mlflow.log_metric("val_accuracy",    val_accuracy)
        mlflow.log_metric("val_f1",          val_f1)
        mlflow.log_metric("val_auc",         val_auc)
        mlflow.log_metric("train_records",   len(X_train))
        mlflow.log_metric("test_records",    len(X_test))

        # Feature importance
        importance = dict(zip(FEATURE_COLUMNS, model.feature_importances_.tolist()))
        mlflow.log_dict(importance, "feature_importance.json")
        mlflow.log_dict({"confusion_matrix": cm}, "confusion_matrix.json")

        print(f"  val_accuracy: {val_accuracy:.4f}")
        print(f"  val_f1:       {val_f1:.4f}")
        print(f"  val_auc:      {val_auc:.4f}")

        # Log model to MLflow
        mlflow.xgboost.log_model(model, "xgb_model")

        # ── Validation gate ────────────────────────────────────────────────
        if val_accuracy >= ACCURACY_GATE:
            # Deploy: save to backend/models/
            os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
            joblib.dump(model, MODEL_OUTPUT)

            # Register in MLflow model registry
            model_uri = f"runs:/{run.info.run_id}/xgb_model"
            mlflow.register_model(model_uri, MLFLOW_MODEL_NAME)

            mlflow.log_param("deployed", True)
            print(f"✅ Model DEPLOYED to {MODEL_OUTPUT}")
        else:
            mlflow.log_param("deployed", False)
            print(f"❌ Model REJECTED: {val_accuracy:.4f} < {ACCURACY_GATE} threshold")
            print("   Previous model remains in production.")

    return val_accuracy


if __name__ == "__main__":
    acc = train_model()
    sys.exit(0 if acc >= ACCURACY_GATE else 1)
