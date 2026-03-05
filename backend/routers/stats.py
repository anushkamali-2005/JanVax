"""
backend/routers/stats.py
-----------------------
/stats endpoint for MLOps dashboard.
"""

from fastapi import APIRouter, Depends
from services.firebase_service import verify_firebase_token
from services.firebase_service import get_db

router = APIRouter()

@router.get("/stats")
async def get_model_stats(uid: str = Depends(verify_firebase_token)):
    """
    Returns latest model performance stats.
    Accessed by admins via Dashboard.
    """
    db = get_db()
    # Fetch from modelStats collection
    doc = db.collection("modelStats").document("latest").get()
    
    if doc.exists:
        return doc.to_dict()
    
    # Fallback / Initial values
    return {
        "model_version":       "v1.0",
        "training_accuracy":   0.92,
        "validation_accuracy": 0.90,
        "training_records":    1000,
        "last_trained":        "2024-03-01T00:00:00Z",
        "drift_detected":      False,
    }
