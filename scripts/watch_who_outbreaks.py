import os
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / "backend" / ".env")

ROOT      = Path(__file__).parent.parent
OUT_FILE  = ROOT / "backend" / "data" / "outbreak_alerts.json"
OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

# ── WHO RSS feeds ─────────────────────────────────────────────────────────────
# All public, no auth
RSS_FEEDS = [
    {
        "name": "WHO Disease Outbreak News",
        "url":  "https://www.who.int/rss-feeds/news-releases.xml",
        "region_filter": ["india", "searo", "south-east asia"],
    },
    {
        "name": "WHO SEARO Health Alerts",
        "url":  "https://www.who.int/southeastasia/feeds",
        "region_filter": ["india"],
    },
]

# Disease keywords → mapped to IAP vaccine codes for alert matching
DISEASE_MAP = {
    "measles":           {"code": "MMR-1",   "vaccine": "MMR",        "severity": "HIGH"},
    "rubella":           {"code": "MMR-1",   "vaccine": "MMR",        "severity": "MEDIUM"},
    "polio":             {"code": "OPV-0",   "vaccine": "OPV/IPV",    "severity": "HIGH"},
    "poliovirus":        {"code": "OPV-0",   "vaccine": "OPV/IPV",    "severity": "HIGH"},
    "diphtheria":        {"code": "DPT-1",   "vaccine": "DPT",        "severity": "HIGH"},
    "pertussis":         {"code": "DPT-1",   "vaccine": "DPT",        "severity": "MEDIUM"},
    "whooping cough":    {"code": "DPT-1",   "vaccine": "DPT",        "severity": "MEDIUM"},
    "tetanus":           {"code": "DPT-1",   "vaccine": "DPT",        "severity": "MEDIUM"},
    "hepatitis b":       {"code": "HEP-B0",  "vaccine": "HepB",       "severity": "MEDIUM"},
    "hepatitis a":       {"code": "HEP-A1",  "vaccine": "HepA",       "severity": "LOW"},
    "typhoid":           {"code": "TYPHOID", "vaccine": "Typhoid",    "severity": "MEDIUM"},
    "japanese encephalitis": {"code": "JE-1","vaccine": "JE",         "severity": "HIGH"},
    "rotavirus":         {"code": "ROTA-1",  "vaccine": "Rotavirus",  "severity": "MEDIUM"},
    "cholera":           {"code": None,       "vaccine": "None",       "severity": "MEDIUM"},
}

# India state/district mentions to extract location from alert text
INDIA_STATES = [
    "maharashtra", "uttar pradesh", "bihar", "rajasthan", "madhya pradesh",
    "kerala", "karnataka", "tamil nadu", "west bengal", "gujarat",
    "andhra pradesh", "telangana", "odisha", "jharkhand", "chhattisgarh",
    "assam", "pune", "mumbai", "delhi", "nagpur", "nashik",
]


def parse_rss_feed(feed_url: str, region_filters: list) -> list:
    """Fetches and parses a WHO RSS feed. Returns list of relevant alert dicts."""
    alerts = []
    try:
        feed = feedparser.parse(feed_url)
        for entry in feed.entries[:30]:
            title   = entry.get("title",   "").lower()
            summary = entry.get("summary", "").lower()
            link    = entry.get("link",    "")
            content = title + " " + summary

            # Check if India-relevant
            is_india = any(kw in content for kw in ["india"] + INDIA_STATES)
            is_region = any(kw in content for kw in region_filters)
            if not (is_india or is_region):
                continue

            # Identify disease
            matched_disease = None
            matched_info    = None
            for disease, info in DISEASE_MAP.items():
                if disease in content:
                    matched_disease = disease
                    matched_info    = info
                    break

            if not matched_disease:
                continue

            # Extract location mentions
            locations = [loc for loc in INDIA_STATES if loc in content]

            alerts.append({
                "title":       entry.get("title", ""),
                "date":        entry.get("published", datetime.now(timezone.utc).isoformat()),
                "link":        link,
                "disease":     matched_disease,
                "vaccine_code": matched_info["code"],
                "vaccine":     matched_info["vaccine"],
                "severity":    matched_info["severity"],
                "locations":   locations,
                "affects_india": is_india,
                "source":      "WHO Disease Outbreak News",
            })

    except Exception as e:
        print(f"  RSS fetch error ({feed_url[:50]}): {e}")

    return alerts


def update_firestore_flags(alerts: list):
    """
    Sets districtOutbreakFlag=1 in Firestore for districts matching alert locations.
    Only updates if disease is HIGH or MEDIUM severity.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs

        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./backend/firebase-admin-key.json")
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        db = fs.client()

        updated = 0
        for alert in alerts:
            if alert["severity"] not in ("HIGH", "MEDIUM"):
                continue

            for location in alert.get("locations", []):
                loc_slug = location.replace(" ", "_")
                # Find children in this district and set outbreak flag
                children = db.collection("children") \
                             .where("district", "==", loc_slug) \
                             .stream()
                batch = db.batch()
                count = 0
                for child in children:
                    batch.update(child.reference, {"districtOutbreakFlag": 1})
                    count += 1
                    if count % 400 == 0:
                        batch.commit()
                        batch = db.batch()
                batch.commit()
                updated += count

        print(f"  Updated districtOutbreakFlag for {updated} children")

    except Exception as e:
        print(f"  Firestore update error: {e}")
        print("  (Firestore not initialized — alerts saved to JSON only)")


def main():
    print("Fetching WHO outbreak alerts...")
    all_alerts = []

    for feed_config in RSS_FEEDS:
        print(f"  Checking: {feed_config['name']}")
        alerts = parse_rss_feed(feed_config["url"], feed_config["region_filter"])
        all_alerts.extend(alerts)
        print(f"    Found {len(alerts)} India-relevant alerts")

    # Deduplicate by title
    seen_titles = set()
    unique_alerts = []
    for alert in all_alerts:
        if alert["title"] not in seen_titles:
            seen_titles.add(alert["title"])
            unique_alerts.append(alert)

    # Save to JSON
    output = {
        "alerts":      unique_alerts,
        "total":       len(unique_alerts),
        "fetched_at":  datetime.now(timezone.utc).isoformat(),
        "source":      "WHO Disease Outbreak News RSS",
    }
    with open(OUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n{'=' * 50}")
    if unique_alerts:
        print(f"WARNING: {len(unique_alerts)} India-relevant WHO alerts found:")
        for a in unique_alerts:
            print(f"   [{a['severity']}] {a['disease'].title()} - {a['title'][:60]}")
        print(f"\nUpdating Firestore outbreak flags...")
        update_firestore_flags(unique_alerts)
    else:
        print("OK: No active India-relevant WHO alerts at this time.")

    print(f"\n- Saved to: {OUT_FILE}")
    print(f"  Load this in frontend /community page for the alert banner.")


if __name__ == "__main__":
    main()
