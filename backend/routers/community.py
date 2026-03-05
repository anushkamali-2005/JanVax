"""
backend/routers/community.py
---------------------------
/community/coverage endpoint for the herd immunity map.
"""

from fastapi import APIRouter
from services.firebase_service import get_db

router = APIRouter()

@router.get("/coverage")
async def get_community_coverage():
    """
    Returns aggregated vaccination coverage by district.
    Read-only public endpoint for D3 map.
    """
    db = get_db()
    # Fetch from communityStats collection (aggregated by reminder_service)
    docs = db.collection("communityStats").stream()
    
    districts = []
    for doc in docs:
        districts.append(doc.to_dict())
        
    return {"districts": districts}
