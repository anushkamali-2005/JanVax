"""
scripts/seed_demo_account.py
-----------------------------
Creates the EXACT demo account used in the 5-minute hackathon demo.

Demo account:
  Parent: Priya Sharma, phone +919876543210, language: hi, district: Pune
  Child:  Arjun, 14 months old, MMR Dose 2 overdue by 45 days
          districtOutbreakFlag=1, riskScore=78, reminderIgnoreCount=1

Run: python scripts/seed_demo_account.py
CRITICAL: Run this LAST, after seed_firebase.py
CRITICAL: The parent UID here must match what you use to log in for the demo.
          After running, note the printed child_id — paste into test_full_flow.py
"""

import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../backend/.env"))

import firebase_admin
from firebase_admin import credentials, firestore, auth

cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "./backend/firebase-admin-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ── CHANGE THIS to your actual demo Google account UID ───────────────────────
# Log in once at localhost:3000, check Firebase Console → Authentication → Users
# Copy the UID and paste here before running this script
DEMO_PARENT_UID = os.getenv("DEMO_PARENT_UID", "REPLACE_WITH_YOUR_FIREBASE_UID")


def create_demo_parent():
    db.collection("users").document(DEMO_PARENT_UID).set({
        "uid":       DEMO_PARENT_UID,
        "name":      "Priya Sharma",
        "phone":     os.getenv("DEMO_PHONE", "+919876543210"),  # set in .env
        "email":     "priya.sharma.demo@gmail.com",
        "district":  "Pune",
        "state":     "Maharashtra",
        "language":  "hi",
        "role":      "parent",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "pushToken": None,
    })
    print(f"✅ Created parent: Priya Sharma (uid: {DEMO_PARENT_UID})")


def create_demo_child():
    # Arjun: born ~14 months ago, MMR Dose 2 due at 15 months
    # We make him 14 months old, so MMR-2 is due in 1 month
    # BUT we backdate so it looks 45 days overdue
    dob = date.today() - timedelta(days=14 * 30)   # 14 months old

    child_ref = db.collection("children").document()
    child_id  = child_ref.id

    child_ref.set({
        "childId":              child_id,
        "parentUid":            DEMO_PARENT_UID,
        "name":                 "Arjun",
        "dob":                  dob.isoformat(),
        "ageMonths":            14,
        "gender":               "male",
        "district":             "pune",
        "state":                "Maharashtra",
        # ML features — pre-set so /predict returns ~78
        "vaccinesMissedCount":  1,
        "daysOverdue":          45,
        "districtOutbreakFlag": 1,    # Pune has active measles alert
        "siblingHistory":       0,
        "reminderIgnoreCount":  1,    # ignored once before
        "riskScore":            78,   # pre-computed for demo speed
        "riskDisease":          "measles",
        "nextDueVaccine":       "MMR-2",
        "nextDueDate":          (date.today() - timedelta(days=45)).isoformat(),
        "lastReminderSent":     None,
        "modelVersion":         "v2.3",
        "createdAt":            firestore.SERVER_TIMESTAMP,
        "updatedAt":            firestore.SERVER_TIMESTAMP,
    })

    # Vaccine records Arjun HAS received (everything except MMR-2)
    received_vaccines = [
        ("BCG",   "BCG",          dob),
        ("OPV-0", "OPV Birth Dose", dob),
        ("DPT-1", "DPT Dose 1",   dob + timedelta(days=6*30)),
        ("IPV-1", "IPV Dose 1",   dob + timedelta(days=6*30)),
        ("DPT-2", "DPT Dose 2",   dob + timedelta(days=10*30)),
        ("DPT-3", "DPT Dose 3",   dob + timedelta(days=14*30 - 5)),
        ("MMR-1", "MMR Dose 1",   dob + timedelta(days=9*30)),
    ]

    for code, name, date_given in received_vaccines:
        rec_ref = child_ref.collection("vaccineRecords").document()
        rec_ref.set({
            "recordId":    rec_ref.id,
            "childId":     child_id,
            "vaccineName": name,
            "vaccineCode": code,
            "dateGiven":   date_given.isoformat(),
            "batchNumber": f"PHC-PUNE-{code}-2024",
            "centerName":  "PHC Hadapsar, Pune",
            "doctorName":  "Dr. Suresh Patil",
            "source":      "manual",
            "verified":    False,
            "polygonHash": "",
            "polygonTxId": "",
            "createdAt":   firestore.SERVER_TIMESTAMP,
        })

    print(f"✅ Created child: Arjun (child_id: {child_id})")
    print(f"   Age: 14 months | MMR-2 overdue: 45 days | Risk: 78/100")
    print(f"   District: Pune | outbreakFlag: 1")
    print(f"\n   ⚡ Set this in your .env:")
    print(f"   DEMO_CHILD_ID={child_id}")
    return child_id


if __name__ == "__main__":
    if DEMO_PARENT_UID == "REPLACE_WITH_YOUR_FIREBASE_UID":
        print("❌ ERROR: Set DEMO_PARENT_UID in your .env first.")
        print("   1. Run frontend locally: npm run dev")
        print("   2. Login with your demo Google account")
        print("   3. Go to Firebase Console → Authentication → Users")
        print("   4. Copy the UID and add to backend/.env:")
        print("      DEMO_PARENT_UID=your_uid_here")
        sys.exit(1)

    create_demo_parent()
    create_demo_child()
    print("\n✅ Demo account ready. Run test_full_flow.py to verify.")
