"""
ml/train.py
-----------
XGBoost training pipeline with MLflow tracking.
Called by GitHub Actions weekly retraining cron.

CRITICAL: Validation gate — model only deploys if val_accuracy >= 0.90.
"""

import os
import sys
import json
import joblib
import logging
import pandas as pd
import numpy as np
import mlflow
import mlflow.xgboost
import xgboost as xgb

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, confusion_matrix

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from ml.features import FEATURE_COLUMNS, TARGET_COLUMN

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("vaxguard.ml.train")

ACCURACY_GATE     = 0.90
MODEL_OUTPUT      = os.path.join(os.path.dirname(__file__), "../models/xgb_model.pkl")
MLFLOW_MODEL_NAME = "VaxGuardRiskModel"


def load_data() -> pd.DataFrame:
    """Loads and combines all training data sources from ml/data/."""
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    dfs = []
    
    data_files = ["who_immunization.csv", "icmr_child_health.csv", "synthetic_records.csv"]
    for fname in data_files:
        fpath = os.path.join(data_dir, fname)
        if os.path.exists(fpath):
            df = pd.read_csv(fpath)
            dfs.append(df)
            logger.info("Loaded %s: %d rows", fname, len(df))

    if not dfs:
        logger.error("No training data found in %s", data_dir)
        raise FileNotFoundError(f"No training data found in {data_dir}.")

    combined = pd.concat(dfs, ignore_index=True)
    logger.info("Combined: %d total rows", len(combined))
    return combined


def train_model() -> float:
    """Full training pipeline with MLflow logging and model registry."""
    mlflow.set_experiment("VaxGuard-Risk-Model")

    logger.info("Starting training pipeline...")
    df = load_data()

    # Validate columns
    missing = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in training data: {missing}")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN].astype(int)

    logger.info("Class distribution: %s", y.value_counts().to_dict())

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    with mlflow.start_run() as run:
        logger.info("MLflow run started: %s", run.info.run_id)

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

        # Log artifacts
        importance = dict(zip(FEATURE_COLUMNS, model.feature_importances_.tolist()))
        mlflow.log_dict(importance, "feature_importance.json")
        mlflow.log_dict({"confusion_matrix": cm}, "confusion_matrix.json")

        logger.info("Validation Accuracy: %.4f", val_accuracy)
        logger.info("Validation F1:       %.4f", val_f1)
        logger.info("Validation AUC:      %.4f", val_auc)

        mlflow.xgboost.log_model(model, "xgb_model")

        # ── Deployment Gate ────────────────────────────────────────────────
        if val_accuracy >= ACCURACY_GATE:
            os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
            joblib.dump(model, MODEL_OUTPUT)
            
            # Register in registry
            model_uri = f"runs:/{run.info.run_id}/xgb_model"
            mlflow.register_model(model_uri, MLFLOW_MODEL_NAME)

            mlflow.log_param("deployed", True)
            logger.info("✅ Model DEPLOYED to %s", MODEL_OUTPUT)
        else:
            mlflow.log_param("deployed", False)
            logger.warning("❌ Model REJECTED: accuracy %.4f < %.2f threshold", 
                           val_accuracy, ACCURACY_GATE)

    return val_accuracy


if __name__ == "__main__":
    acc = train_model()
    sys.exit(0 if acc >= ACCURACY_GATE else 1)
