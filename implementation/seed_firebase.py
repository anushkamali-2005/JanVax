"""
scripts/seed_firebase.py
-------------------------
Seeds Firebase Firestore with 500 realistic fake children
across 20 Maharashtra districts for the D3 herd immunity map demo.

Run: python scripts/seed_firebase.py
Requires: FIREBASE_CREDENTIALS_PATH set in environment or .env

CRITICAL: Run this BEFORE the hackathon demo.
CRITICAL: Sets districtOutbreakFlag=1 for Pune (for Arjun demo account).
CRITICAL: Creates realistic coverage gaps — some districts < 70% MMR.
"""

import os
import sys
import random
from datetime import date, timedelta

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../backend/.env"))

import firebase_admin
from firebase_admin import credentials, firestore

# ── Init Firebase ─────────────────────────────────────────────────────────────
cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./backend/firebase-admin-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ── Maharashtra districts with realistic coverage gaps ────────────────────────
DISTRICTS = [
    # (name, mmr_rate, polio_rate, bcg_rate)  — rates = fraction who have it
    ("pune",          0.67, 0.91, 0.94),
    ("mumbai",        0.88, 0.95, 0.97),
    ("nashik",        0.72, 0.88, 0.91),
    ("nagpur",        0.81, 0.92, 0.95),
    ("aurangabad",    0.61, 0.84, 0.88),
    ("solapur",       0.58, 0.79, 0.86),
    ("kolhapur",      0.74, 0.90, 0.93),
    ("amravati",      0.65, 0.85, 0.89),
    ("nanded",        0.54, 0.77, 0.83),
    ("latur",         0.60, 0.81, 0.87),
    ("satara",        0.76, 0.89, 0.92),
    ("sangli",        0.78, 0.91, 0.94),
    ("jalgaon",       0.63, 0.83, 0.88),
    ("dhule",         0.55, 0.78, 0.84),
    ("raigad",        0.70, 0.87, 0.91),
    ("thane",         0.85, 0.93, 0.96),
    ("chandrapur",    0.62, 0.82, 0.88),
    ("yavatmal",      0.57, 0.80, 0.85),
    ("osmanabad",     0.52, 0.75, 0.81),
    ("washim",        0.49, 0.73, 0.79),
]

MALE_NAMES   = ["Arjun", "Aarav", "Vihaan", "Rohan", "Dev", "Kiran", "Rahul",
                "Siddharth", "Aditya", "Pranav", "Vivek", "Nikhil", "Rajan", "Mohan"]
FEMALE_NAMES = ["Priya", "Sneha", "Ananya", "Kavya", "Pooja", "Isha", "Meera",
                "Divya", "Ankita", "Nandini", "Shruti", "Swati", "Riya", "Diya"]

IAP_VACCINES = [
    ("BCG",    "BCG",    0),
    ("OPV-0",  "OPV Birth Dose", 0),
    ("DPT-1",  "DPT Dose 1",     6),
    ("OPV-1",  "OPV Dose 1",     6),
    ("MMR-1",  "MMR Dose 1",     9),
    ("DPT-2",  "DPT Dose 2",     10),
    ("DPT-3",  "DPT Dose 3",     14),
    ("MMR-2",  "MMR Dose 2",     15),
    ("TYPHOID","Typhoid",        24),
]


def random_dob(age_months_min: int, age_months_max: int) -> date:
    age_months = random.randint(age_months_min, age_months_max)
    dob = date.today() - timedelta(days=age_months * 30)
    return dob


def seed_child(district_name: str, mmr_rate: float, polio_rate: float,
               bcg_rate: float, parent_uid: str) -> str:
    """Creates one fake child document. Returns child_id."""
    gender = random.choice(["male", "female"])
    name   = random.choice(MALE_NAMES if gender == "male" else FEMALE_NAMES)
    dob    = random_dob(0, 48)
    age_months = (date.today() - dob).days // 30

    # Determine which vaccines this child has (based on coverage rates + age)
    missed_vaccines = []
    missed_count    = 0

    for code, vac_name, target_age_months in IAP_VACCINES:
        if target_age_months > age_months:
            continue   # too young, skip

        # Apply district coverage rates
        if "MMR" in code:
            has_vaccine = random.random() < mmr_rate
        elif "OPV" in code:
            has_vaccine = random.random() < polio_rate
        elif code == "BCG":
            has_vaccine = random.random() < bcg_rate
        else:
            has_vaccine = random.random() < 0.82   # general coverage

        if not has_vaccine:
            missed_vaccines.append(code)
            missed_count += 1

    # Days overdue = how long since most overdue vaccine should have been given
    days_overdue = 0
    if missed_count > 0:
        # Random overdue duration
        days_overdue = random.randint(15, 180)

    # Next due vaccine
    next_due_code = missed_vaccines[0] if missed_vaccines else None
    next_due_date = (date.today() - timedelta(days=days_overdue)).isoformat() if days_overdue else None

    # Risk score (simplified — actual ML runs in batch job)
    risk_score = min(100, missed_count * 20 + (days_overdue // 10))

    child_ref = db.collection("children").document()
    child_data = {
        "childId":              child_ref.id,
        "parentUid":            parent_uid,
        "name":                 name,
        "dob":                  dob.isoformat(),
        "ageMonths":            age_months,
        "gender":               gender,
        "district":             district_name,
        "state":                "Maharashtra",
        "vaccinesMissedCount":  missed_count,
        "daysOverdue":          days_overdue,
        "districtOutbreakFlag": 1 if district_name == "pune" else 0,
        "siblingHistory":       int(random.random() < 0.08),
        "reminderIgnoreCount":  random.randint(0, 2) if missed_count > 0 else 0,
        "riskScore":            risk_score,
        "riskDisease":          "measles" if "MMR-1" in missed_vaccines else "diphtheria",
        "nextDueVaccine":       next_due_code or "",
        "nextDueDate":          next_due_date or "",
        "lastReminderSent":     None,
        "createdAt":            firestore.SERVER_TIMESTAMP,
    }
    child_ref.set(child_data)

    # Add vaccine records for vaccines they DID receive
    for code, vac_name, target_age_months in IAP_VACCINES:
        if target_age_months > age_months:
            continue
        if code in missed_vaccines:
            continue

        date_given = dob + timedelta(days=target_age_months * 30 + random.randint(-7, 14))
        record_ref = child_ref.collection("vaccineRecords").document()
        record_ref.set({
            "recordId":     record_ref.id,
            "childId":      child_ref.id,
            "vaccineName":  vac_name,
            "vaccineCode":  code,
            "dateGiven":    date_given.isoformat(),
            "batchNumber":  f"BATCH{random.randint(1000, 9999)}",
            "centerName":   f"PHC {district_name.title()}",
            "source":       "seed",
            "verified":     False,
            "polygonHash":  "",
            "polygonTxId":  "",
            "createdAt":    firestore.SERVER_TIMESTAMP,
        })

    return child_ref.id


def main():
    # Create a fake parent UID for seed data
    seed_parent_uid = "seed_parent_001"

    total = 0
    for district_name, mmr_rate, polio_rate, bcg_rate in DISTRICTS:
        count_per_district = 25   # 25 × 20 districts = 500 children
        print(f"Seeding {count_per_district} children in {district_name}...")

        for _ in range(count_per_district):
            try:
                seed_child(district_name, mmr_rate, polio_rate, bcg_rate, seed_parent_uid)
                total += 1
            except Exception as e:
                print(f"  Error: {e}")

    print(f"\n✅ Seeded {total} children across {len(DISTRICTS)} Maharashtra districts.")
    print("Run seed_demo_account.py next to create the Arjun demo account.")


if __name__ == "__main__":
    main()
