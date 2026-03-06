"""
demo_ml_pipeline.py
-------------------
End-to-End ML Pipeline Demonstration for Evaluators.
This script demonstrates:
1. Fetching raw data from Firebase
2. Engineering correct ML features (all 8 features)
3. Running XGBoost prediction & SHAP Explainer
4. Generating DiCE counterfactuals
5. Generating an OpenAI Natural Language Explanation
"""

import sys
import os
import json
import asyncio
from pathlib import Path

# Add backend directory to path so we can import modules
sys.path.append(str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

import firebase_admin
from firebase_admin import credentials, firestore

from ml.features import engineer_features, FEATURE_COLUMNS
from ml.shap_explainer import get_risk_and_shap, get_top_features
from ml.dice_explainer import get_counterfactuals
from services.llm_service import generate_nl_explanation

# Initialize Firebase (read mode)
cred_path = str(Path(__file__).parent.parent / "backend" / "firebase-admin-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

async def run_end_to_end_demo():
    print("="*60)
    print("🚀 JANVAX END-TO-END ML PIPELINE DEMONSTRATION")
    print("="*60)

    # 1. Fetch a high-risk child from the database
    print("\n[1/5] Fetching a high-risk child from Firestore...")
    kids = db.collection("children").where("riskScore", ">=", 70).limit(1).get()
    
    if not kids:
        print("❌ No high-risk children found in database. Run seed script first.")
        return
        
    child_doc = kids[0].to_dict()
    print(f"✅ Found child: {child_doc['name']} (Age: {child_doc['ageMonths']} months)")
    print(f"   Raw Data snippet: District={child_doc['district']}, Missed={child_doc['vaccinesMissedCount']}")

    # 2. Engineer Features
    print("\n[2/5] Engineering ML Features from Raw Data...")
    features = engineer_features(child_doc)
    print("✅ Generated exact feature vector for XGBoost:")
    for key, value in features.items():
        print(f"   - {key:25} : {value}")

    # 3. Model Prediction & SHAP
    print("\n[3/5] Running XGBoost Prediction & SHAP Explainer...")
    risk_score, shap_values = get_risk_and_shap(features)
    print(f"✅ Predicted Risk Score: {risk_score}/100")
    
    print("   SHAP Values (Feature Impact):")
    # Show ALL features sorted by impact
    all_top_features = get_top_features(shap_values, n=8)  
    for f in all_top_features:
        icon = "📈" if f["direction"] == "increases_risk" else "📉"
        print(f"   {icon} {f['feature']:25} | Impact: {f['value']:.4f}")

    # 4. DiCE Counterfactuals
    print("\n[4/5] Generating DiCE Counterfactuals (What-If Scenarios)...")
    try:
        cf_list = get_counterfactuals(features, n=2)
        if not cf_list:
            print("   (No reasonable counterfactuals found for this specific case)")
        for i, cf in enumerate(cf_list, 1):
            print(f"   Scenario {i}: {cf['change_description']} -> New Risk: {cf['new_score']}")
    except Exception as e:
        print(f"   ⚠️ DiCE Generation Failed (Requires training data cache): {e}")
        cf_list = []

    # 5. Natural Language Explanation (LLM)
    print("\n[5/5] Generating Actionable AI Explanation (OpenAI gpt-4o)...")
    # We pass the top 4 most impactful features to the LLM
    top_4_features = get_top_features(shap_values, n=4)
    nl_exp = await generate_nl_explanation(
        child_name=child_doc['name'],
        risk_score=risk_score,
        top_features=top_4_features,
        counterfactuals=cf_list,
        language="en"
    )
    
    print("\n📝 FINAL EXPLANATION:")
    print("-" * 60)
    print(nl_exp)
    print("-" * 60)
    print("\n✅ End-to-End ML Pipeline Complete.")

if __name__ == "__main__":
    asyncio.run(run_end_to_end_demo())
