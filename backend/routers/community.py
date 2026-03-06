import json
import os
from pathlib import Path
from fastapi import APIRouter
from services.firebase_service import get_all_districts_coverage

router = APIRouter()

# Load NFHS-5 baseline once at startup
_COVERAGE_JSON_PATH = Path(__file__).parent.parent / "data" / "india_coverage.json"
_NFHS5_BASELINE: dict[str, dict] = {}

def _load_nfhs5():
    global _NFHS5_BASELINE
    if _NFHS5_BASELINE:
        return
    if _COVERAGE_JSON_PATH.exists():
        with open(_COVERAGE_JSON_PATH) as f:
            data = json.load(f)
        for d in data.get("districts", []):
            _NFHS5_BASELINE[d["district"]] = d
        print(f"[community] Loaded NFHS-5 baseline: {len(_NFHS5_BASELINE)} districts")
    else:
        print("[community] ⚠️  india_coverage.json not found. Run fetch_live_data.py")

_load_nfhs5()

# Minimum real user records before switching from NFHS-5 to live coverage
MIN_SAMPLE_SIZE = 50


@router.get("/coverage")
async def get_coverage():
    """
    Returns district coverage data for the D3 herd immunity map.
    Merges NFHS-5 baseline with real Firestore data.
    """
    # Get real-time Firestore aggregations (from communityStats collection)
    firestore_districts = await get_all_districts_coverage()
    firestore_map = {d.get("district", ""): d for d in firestore_districts}

    merged = []

    # Start from NFHS-5 baseline — guarantees all 34 districts always present
    for district_slug, baseline in _NFHS5_BASELINE.items():
        live = firestore_map.get(district_slug, {})
        total_children = live.get("totalChildren", 0)

        if total_children >= MIN_SAMPLE_SIZE:
            # Enough real data — use live coverage
            merged.append({
                "district":      district_slug,
                "state":         baseline.get("state", "maharashtra"),
                "totalChildren": total_children,
                "mmrCoverage":   live.get("mmrCoverage",  baseline["mmrCoverage"]),
                "polioOPV":      live.get("polioOPV",     baseline["polioOPV"]),
                "bcgCoverage":   live.get("bcgCoverage",  baseline["bcgCoverage"]),
                "dptCoverage":   live.get("dptCoverage",  baseline.get("dptCoverage", baseline["dptCoverage"])),
                "herdRisk":      live.get("mmrCoverage",  baseline["mmrCoverage"]) < 0.70,
                "dataSource":    "live",
            })
        else:
            # Not enough real data — use NFHS-5 baseline with real child count
            merged.append({
                "district":      district_slug,
                "state":         baseline.get("state", "maharashtra"),
                "totalChildren": total_children,
                "mmrCoverage":   baseline["mmrCoverage"],
                "polioOPV":      baseline["polioOPV"],
                "bcgCoverage":   baseline["bcgCoverage"],
                "dptCoverage":   baseline.get("dptCoverage", baseline["polioOPV"]),
                "herdRisk":      baseline["herdRisk"],
                "dataSource":    "NFHS-5 (2019-21)",
            })

    # Add any Firestore districts not in NFHS-5 baseline
    for district_slug, live in firestore_map.items():
        if district_slug not in _NFHS5_BASELINE:
            merged.append({
                "district":      district_slug,
                "state":         live.get("state", "unknown"),
                "totalChildren": live.get("totalChildren", 0),
                "mmrCoverage":   live.get("mmrCoverage", 0),
                "polioOPV":      live.get("polioOPV", 0),
                "bcgCoverage":   live.get("bcgCoverage", 0),
                "dptCoverage":   live.get("dptCoverage", 0),
                "herdRisk":      live.get("mmrCoverage", 0) < 0.70,
                "dataSource":    "live",
            })

    # Summary stats for admin dashboard
    at_risk  = sum(1 for d in merged if d["herdRisk"])
    avg_mmr  = round(sum(d["mmrCoverage"] for d in merged) / max(len(merged), 1), 3)
    live_cnt = sum(1 for d in merged if d["dataSource"] == "live")

    return {
        "districts": merged,
        "meta": {
            "total_districts":   len(merged),
            "at_risk_districts": at_risk,
            "avg_mmr_coverage":  avg_mmr,
            "live_districts":    live_cnt,
            "nfhs5_districts":   len(merged) - live_cnt,
            "data_sources":      ["NFHS-5 (2019-21)", "Live Firestore"],
        }
    }
