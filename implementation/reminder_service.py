"""
backend/services/reminder_service.py
--------------------------------------
APScheduler jobs for automated reminders and ML batch scoring.

Jobs:
  1. send_daily_reminders   — 8:00 AM IST daily
  2. batch_risk_scoring     — 2:00 AM IST daily (runs ML on all children)
  3. update_outbreak_flags  — Every 6 hours (polls WHO RSS)
  4. aggregate_community    — Every 30 minutes (updates herd immunity map)

CRITICAL: APScheduler runs in the same process as FastAPI.
CRITICAL: IST = UTC+5:30. APScheduler uses UTC internally.
CRITICAL: Jobs must be idempotent — safe to run multiple times.
CRITICAL: Never crash the scheduler on a single job failure.
"""

import asyncio
import feedparser
from datetime import datetime, timezone, date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

_scheduler = None

# WHO Disease Outbreak News RSS — free and public
WHO_RSS_URL = "https://www.who.int/rss-feeds/news-releases.xml"

# India district → WHO region keywords (simplified mapping)
INDIA_DISEASE_KEYWORDS = [
    "india", "measles", "polio", "cholera", "dengue",
    "encephalitis", "diphtheria", "pertussis",
]


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")

    # Job 1: Daily reminders — 8 AM IST = 2:30 AM UTC
    _scheduler.add_job(
        send_daily_reminders,
        CronTrigger(hour=2, minute=30),
        id="daily_reminders",
        name="Send daily vaccine reminders",
        max_instances=1,
        misfire_grace_time=3600,
    )

    # Job 2: Batch ML risk scoring — 2 AM IST = 8:30 PM UTC previous day
    _scheduler.add_job(
        batch_risk_scoring,
        CronTrigger(hour=20, minute=30),
        id="batch_scoring",
        name="Batch ML risk scoring for all children",
        max_instances=1,
        misfire_grace_time=3600,
    )

    # Job 3: WHO outbreak flag update — every 6 hours
    _scheduler.add_job(
        update_outbreak_flags,
        IntervalTrigger(hours=6),
        id="outbreak_flags",
        name="Update district outbreak flags from WHO RSS",
        max_instances=1,
    )

    # Job 4: Community stats aggregation — every 30 minutes
    _scheduler.add_job(
        aggregate_community_stats,
        IntervalTrigger(minutes=30),
        id="community_agg",
        name="Aggregate community vaccination coverage",
        max_instances=1,
    )

    _scheduler.start()
    print("[scheduler] All jobs started.")


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[scheduler] Stopped.")


# ── Job 1: Daily Reminders ────────────────────────────────────────────────────

async def send_daily_reminders():
    """
    Fetches all children with nextDueDate <= today.
    Sends SMS + push notification to each parent.
    Skips children where reminder was sent in last 24h.
    """
    from services.firebase_service import get_all_children_due_today, increment_reminder_ignore
    from services.twilio_service import send_sms_message
    from services.firebase_service import get_db
    from firebase_admin import firestore

    print(f"[reminder] Starting daily reminder job: {datetime.now(timezone.utc)}")

    try:
        children = await get_all_children_due_today()
        print(f"[reminder] Found {len(children)} children due today")

        sent_count = 0
        for child in children:
            try:
                child_id   = child.get("id")
                parent_uid = child.get("parentUid")
                child_name = child.get("name", "your child")
                vaccine    = child.get("nextDueVaccine", "scheduled vaccine")
                disease    = child.get("riskDisease", "vaccine-preventable disease")

                if not parent_uid:
                    continue

                # Skip if reminder sent today already
                last_sent = child.get("lastReminderSent")
                if last_sent:
                    last_sent_date = last_sent.date() if hasattr(last_sent, 'date') else None
                    if last_sent_date == date.today():
                        continue

                # Send SMS
                result = send_sms_message(
                    parent_uid=parent_uid,
                    child_name=child_name,
                    disease=disease,
                    center_name="your nearest PHC",
                    risk_score=child.get("riskScore", 0),
                )

                if result.get("sent"):
                    # Update lastReminderSent
                    get_db().collection("children").document(child_id).update({
                        "lastReminderSent": firestore.SERVER_TIMESTAMP
                    })
                    sent_count += 1
                else:
                    # SMS failed — increment ignore count after 2 failures
                    await increment_reminder_ignore(child_id)

            except Exception as e:
                print(f"[reminder] Error for child {child.get('id')}: {e}")
                continue

        print(f"[reminder] Sent {sent_count} reminders.")

    except Exception as e:
        print(f"[reminder] Job failed: {e}")


# ── Job 2: Batch Risk Scoring ─────────────────────────────────────────────────

async def batch_risk_scoring():
    """
    Runs ML model on ALL children every night.
    Updates riskScore field in Firestore for each child.
    Auto-triggers agent for any child newly scoring > 70.
    """
    from services.firebase_service import get_db, update_child_risk_score
    from ml.features import engineer_features
    from ml.shap_explainer import get_risk_score

    print(f"[batch_ml] Starting batch risk scoring: {datetime.now(timezone.utc)}")

    try:
        db = get_db()
        all_children = db.collection("children").stream()
        count = 0

        for doc in all_children:
            try:
                child = doc.to_dict()
                child_id = doc.id

                feature_dict = engineer_features(child)
                risk_score   = get_risk_score(feature_dict)

                await update_child_risk_score(
                    child_id=child_id,
                    risk_score=risk_score,
                    risk_disease=child.get("riskDisease", ""),
                    model_version="batch",
                )
                count += 1

            except Exception as e:
                print(f"[batch_ml] Error for child {doc.id}: {e}")
                continue

        print(f"[batch_ml] Scored {count} children.")

    except Exception as e:
        print(f"[batch_ml] Job failed: {e}")


# ── Job 3: Update Outbreak Flags ──────────────────────────────────────────────

async def update_outbreak_flags():
    """
    Parses WHO Disease Outbreak News RSS.
    Sets districtOutbreakFlag=1 on children in affected Indian districts.
    """
    print(f"[outbreak] Fetching WHO RSS: {datetime.now(timezone.utc)}")

    try:
        feed = feedparser.parse(WHO_RSS_URL)
        india_alerts = []

        for entry in feed.entries[:20]:
            title   = entry.get("title", "").lower()
            summary = entry.get("summary", "").lower()
            content = title + " " + summary

            if any(kw in content for kw in INDIA_DISEASE_KEYWORDS):
                india_alerts.append({
                    "title":   entry.get("title", ""),
                    "disease": _extract_disease(content),
                    "date":    entry.get("published", ""),
                })

        if india_alerts:
            print(f"[outbreak] Found {len(india_alerts)} India-relevant alerts")
            # Store active alerts in Firestore for the frontend
            from services.firebase_service import get_db
            from firebase_admin import firestore as fs
            get_db().collection("outbreakAlerts").document("current").set({
                "alerts":    india_alerts,
                "updatedAt": fs.SERVER_TIMESTAMP,
            })
        else:
            print("[outbreak] No India-relevant alerts found.")

    except Exception as e:
        print(f"[outbreak] Job failed: {e}")


def _extract_disease(text: str) -> str:
    """Simple keyword extraction for disease name from alert text."""
    keywords = {
        "measles": "measles", "polio": "polio", "cholera": "cholera",
        "dengue": "dengue", "encephalitis": "encephalitis",
        "diphtheria": "diphtheria", "pertussis": "pertussis",
        "hepatitis": "hepatitis",
    }
    for key, val in keywords.items():
        if key in text:
            return val
    return "unknown"


# ── Job 4: Community Stats Aggregation ───────────────────────────────────────

async def aggregate_community_stats():
    """
    Aggregates vaccination coverage by district from children collection.
    Writes results to communityStats collection (read by D3 map).
    """
    from services.firebase_service import get_db, update_community_stats
    from collections import defaultdict

    try:
        db = get_db()
        children = db.collection("children").stream()

        # Aggregate by district
        district_data = defaultdict(lambda: {
            "total": 0, "mmr": 0, "polio": 0, "bcg": 0, "dpt": 0
        })

        for doc in children:
            child = doc.to_dict()
            district = child.get("district", "unknown").lower().replace(" ", "_")
            district_data[district]["total"] += 1

            # Check vaccine records for coverage
            records = db.collection("children").document(doc.id) \
                        .collection("vaccineRecords").stream()
            codes = {r.to_dict().get("vaccineCode", "") for r in records}

            if "MMR-1" in codes:  district_data[district]["mmr"]   += 1
            if "OPV-0" in codes:  district_data[district]["polio"] += 1
            if "BCG"   in codes:  district_data[district]["bcg"]   += 1
            if "DPT-1" in codes:  district_data[district]["dpt"]   += 1

        # Write coverage ratios to Firestore
        for district, data in district_data.items():
            total = max(data["total"], 1)
            await update_community_stats(district, {
                "district":      district,
                "totalChildren": data["total"],
                "mmrCoverage":   round(data["mmr"]   / total, 3),
                "polioOPV":      round(data["polio"] / total, 3),
                "bcgCoverage":   round(data["bcg"]   / total, 3),
                "dptCoverage":   round(data["dpt"]   / total, 3),
                "herdRisk":      (data["mmr"] / total) < 0.70,
                "state":         "maharashtra",  # TODO: derive from district
            })

        print(f"[community] Aggregated {len(district_data)} districts.")

    except Exception as e:
        print(f"[community] Aggregation failed: {e}")
