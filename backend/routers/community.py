"""
backend/routers/community.py
---------------------------
/community/coverage endpoint for the herd immunity map.
"""

import logging

from fastapi import APIRouter
from services.firebase_service import get_db

logger = logging.getLogger("vaxguard.community")

router = APIRouter()


@router.get("/coverage")
async def get_community_coverage():
    """
    Returns aggregated vaccination coverage by district.
    Read-only public endpoint for D3 map.
    """
    try:
        db = get_db()
        docs = db.collection("communityStats").stream()

        districts = []
        for doc in docs:
            data = doc.to_dict()
            # Ensure coverage values are 0-100 percentages (not 0-1 ratios)
            for key in ("mmrCoverage", "polioOPV", "bcgCoverage", "dptCoverage"):
                val = data.get(key, 0)
                if isinstance(val, (int, float)) and val <= 1:
                    data[key] = round(val * 100, 1)
            districts.append(data)

        return {"districts": districts}

    except Exception as exc:
        logger.error("Failed to fetch community coverage: %s", exc)
        return {"districts": []}
