import os
import sys
import random
import pandas as pd
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / "backend" / ".env")

import firebase_admin
from firebase_admin import credentials, firestore

ROOT       = Path(__file__).parent.parent
NFHS5_PATH = ROOT / "ml" / "data" / "nfhs5_districts.csv"

if not NFHS5_PATH.exists():
    print("ERROR: nfhs5_districts.csv not found.")
    print("   Run: python scripts/fetch_live_data.py first")
    sys.exit(1)

cred_path = str(ROOT / "backend" / "firebase-admin-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

SEED_PARENT_UID = "seed_parent_nfhs5"

MALE_NAMES   = ["Arjun", "Aarav", "Vihaan", "Rohan", "Dev", "Kiran", "Rahul",
                "Siddharth", "Aditya", "Pranav", "Vivek", "Nikhil", "Rajan"]
FEMALE_NAMES = ["Priya", "Sneha", "Ananya", "Kavya", "Pooja", "Isha", "Meera",
                "Divya", "Ankita", "Nandini", "Shruti", "Swati", "Riya"]

IAP_VACCINES = [
    ("BCG",    "BCG",            0),
    ("OPV-0",  "OPV Birth Dose", 0),
    ("DPT-1",  "DPT Dose 1",     6),
    ("OPV-1",  "OPV Dose 1",     6),
    ("MMR-1",  "MMR Dose 1",     9),
    ("DPT-2",  "DPT Dose 2",     10),
    ("DPT-3",  "DPT Dose 3",     14),
    ("MMR-2",  "MMR Dose 2",     15),
    ("TYPHOID","Typhoid",        24),
]


def delete_existing_seed_children():
    """Removes previous seed data to avoid duplicates."""
    print("Deleting old seed children...")
    docs = db.collection("children").where("parentUid", "==", SEED_PARENT_UID).stream()
    batch = db.batch()
    count = 0
    for doc in docs:
        # Also delete vaccine records subcollection
        for sub in doc.reference.collection("vaccineRecords").stream():
            batch.delete(sub.reference)
        batch.delete(doc.reference)
        count += 1
        if count % 400 == 0:   # Firestore batch limit is 500
            batch.commit()
            batch = db.batch()
    batch.commit()
    print(f"  Deleted {count} old seed children")


def seed_child_from_nfhs5(district: str, state: str,
                           mcv1_pct: float, dtp3_pct: float,
                           bcg_pct: float) -> str:
    """
    Creates one child whose vaccine coverage gap reflects real NFHS-5 rates.
    mcv1_pct etc. are 0-100 percentages from NFHS-5.
    """
    gender   = random.choice(["male", "female"])
    name     = random.choice(MALE_NAMES if gender == "male" else FEMALE_NAMES)
    dob      = date.today() - timedelta(days=random.randint(6, 48) * 30)
    age_months = (date.today() - dob).days // 30

    # Miss probability per vaccine, calibrated to real dropout rates
    miss_prob = {
        "MMR": 1 - (mcv1_pct / 100),
        "DPT": 1 - (dtp3_pct / 100),
        "BCG": 1 - (bcg_pct  / 100),
    }

    missed_vaccines = []
    for code, vac_name, target_age in IAP_VACCINES:
        if target_age > age_months:
            continue
        if "MMR" in code:
            p = miss_prob["MMR"]
        elif code.startswith("DPT"):
            p = miss_prob["DPT"]
        elif code == "BCG":
            p = miss_prob["BCG"]
        else:
            p = miss_prob["DPT"] * 0.85

        if random.random() < p:
            missed_vaccines.append(code)

    missed_count = len(missed_vaccines)
    days_overdue = 0
    if missed_count > 0:
        base_overdue = max(0, (1 - (mcv1_pct / 100)) * 120)
        days_overdue = int(random.gauss(base_overdue, 20))
        days_overdue = max(0, min(days_overdue, 365))

    next_due_vaccine = missed_vaccines[0] if missed_vaccines else ""
    next_due_date    = (date.today() - timedelta(days=days_overdue)).isoformat() if days_overdue else ""

    # Risk score calibrated to actual gap severity
    risk_score = min(100, missed_count * 18 + days_overdue // 8)

    child_ref = db.collection("children").document()
    child_ref.set({
        "childId":              child_ref.id,
        "parentUid":            SEED_PARENT_UID,
        "name":                 name,
        "dob":                  dob.isoformat(),
        "ageMonths":            age_months,
        "gender":               gender,
        "district":             district,
        "state":                state.replace("_", " ").title(),
        "vaccinesMissedCount":  missed_count,
        "daysOverdue":          days_overdue,
        "districtOutbreakFlag": 1 if district == "pune" else 0,
        "siblingHistory":       int(random.random() < 0.07),
        "reminderIgnoreCount":  random.randint(0, 2) if missed_count > 1 else 0,
        "riskScore":            risk_score,
        "riskDisease":          "measles" if "MMR-1" in missed_vaccines else "diphtheria",
        "nextDueVaccine":       next_due_vaccine,
        "nextDueDate":          next_due_date,
        "modelVersion":         "nfhs5_calibrated",
        "lastReminderSent":     None,
        "createdAt":            firestore.SERVER_TIMESTAMP,
    })

    # Add vaccine records for vaccines received
    for code, vac_name, target_age in IAP_VACCINES:
        if target_age > age_months:
            continue
        if code in missed_vaccines:
            continue
        date_given = dob + timedelta(days=target_age * 30 + random.randint(-5, 10))
        rec_ref = child_ref.collection("vaccineRecords").document()
        rec_ref.set({
            "recordId":    rec_ref.id,
            "childId":     child_ref.id,
            "vaccineName": vac_name,
            "vaccineCode": code,
            "dateGiven":   date_given.isoformat(),
            "batchNumber": f"UIP-{district[:3].upper()}-{random.randint(1000,9999)}",
            "centerName":  f"PHC {district.replace('_',' ').title()}",
            "source":      "nfhs5_seed",
            "verified":    False,
            "polygonHash": "",
        })

    return child_ref.id


def main():
    print("Loading NFHS-5 district data...")
    df = pd.read_csv(NFHS5_PATH)
    maha = df[df["state"] == "maharashtra"].copy()
    print(f"  {len(maha)} Maharashtra districts loaded")

    delete_existing_seed_children()

    children_per_district = 20   # 20 × 34 districts = 680 children
    total = 0
    print(f"\nSeeding {children_per_district} children per district (NFHS-5 calibrated)...")

    for _, row in maha.iterrows():
        for _ in range(children_per_district):
            try:
                seed_child_from_nfhs5(
                    district=row["district"],
                    state=row["state"],
                    mcv1_pct=row["mcv1_pct"],
                    dtp3_pct=row["dtp3_pct"],
                    bcg_pct=row["bcg_pct"],
                )
                total += 1
            except Exception as e:
                print(f"  Error ({row['district']}): {e}")

        # Print coverage summary per district
        miss_rate = round(1 - row["mcv1_pct"] / 100, 2)
        print(f"  {row['district']:<20} MCv1={row['mcv1_pct']}%  "
              f"DTP3={row['dtp3_pct']}%  miss~{miss_rate:.0%}")

    print(f"\nOK: Seeded {total} children from real NFHS-5 district coverage rates.")
    print("   Run seed_demo_account.py next.")


if __name__ == "__main__":
    main()
