import os
import random
import firebase_admin
from firebase_admin import credentials, firestore

# Ensure script is run from backend directory so it finds the json key
cred_path = "firebase-admin-key.json"
if not os.path.exists(cred_path):
    print(f"Error: {cred_path} not found. Please run this script from the backend/ directory.")
    exit(1)

# Initialize Firebase (using the same credentials file as main.py)
cred = credentials.Certificate(cred_path)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()

DISTRICTS = [
    {"name": "Pune",       "mmr": 78, "dpt": 81, "polio": 85},
    {"name": "Mumbai",     "mmr": 84, "dpt": 86, "polio": 89},
    {"name": "Nagpur",     "mmr": 82, "dpt": 84, "polio": 87},
    {"name": "Nashik",     "mmr": 71, "dpt": 74, "polio": 76},
    {"name": "Aurangabad", "mmr": 69, "dpt": 72, "polio": 74},
    {"name": "Nandurbar",  "mmr": 54, "dpt": 57, "polio": 60},
    {"name": "Jalna",      "mmr": 62, "dpt": 65, "polio": 67},
    {"name": "Kolhapur",   "mmr": 77, "dpt": 79, "polio": 82},
    {"name": "Solapur",    "mmr": 68, "dpt": 71, "polio": 73},
    {"name": "Satara",     "mmr": 73, "dpt": 75, "polio": 78},
    # Additional 10 districts for a total of 20
    {"name": "Ahmednagar", "mmr": 75, "dpt": 78, "polio": 80},
    {"name": "Thane",      "mmr": 81, "dpt": 83, "polio": 86},
    {"name": "Palghar",    "mmr": 58, "dpt": 61, "polio": 64},
    {"name": "Raigad",     "mmr": 70, "dpt": 72, "polio": 75},
    {"name": "Ratnagiri",  "mmr": 65, "dpt": 68, "polio": 71},
    {"name": "Sindhudurg", "mmr": 79, "dpt": 81, "polio": 84},
    {"name": "Dhule",      "mmr": 61, "dpt": 63, "polio": 66},
    {"name": "Jalgaon",    "mmr": 67, "dpt": 70, "polio": 72},
    {"name": "Nanded",     "mmr": 66, "dpt": 68, "polio": 71},
    {"name": "Latur",      "mmr": 72, "dpt": 74, "polio": 77},
]

def seed_data():
    batch = db.batch()
    operations_count = 0
    total_districts = len(DISTRICTS)

    for i, dist in enumerate(DISTRICTS):
        print(f"[{i+1:02d}/{total_districts}] Seeding data for {dist['name']}...")
        
        # 1. Write the aggregate summary
        summary_ref = db.collection("district_summaries").document(dist["name"])
        batch.set(summary_ref, {
            "district_name": dist["name"],
            "coverage_pct": {
                "MMR": dist["mmr"],
                "DPT": dist["dpt"],
                "Polio": dist["polio"]
            },
            "last_updated": firestore.SERVER_TIMESTAMP,
            "record_count": 25
        })
        operations_count += 1

        # 2. Write 25 fake family records per district
        for j in range(25):
            record_ref = db.collection("community_data").document()
            batch.set(record_ref, {
                "district_name": dist["name"],
                "vaccine_type": random.choice(["MMR", "DPT", "Polio"]),
                "coverage_pct": dist["mmr"] + random.randint(-15, 15), # Fuzz around district average
                "last_updated": firestore.SERVER_TIMESTAMP,
                "record_count": 1
            })
            operations_count += 1

            # Commit batches to avoid exceeding Firestore limits
            if operations_count >= 400:
                batch.commit()
                batch = db.batch()
                operations_count = 0

    if operations_count > 0:
        batch.commit()
    
    print("\n✅ Successfully seeded 20 districts and 500 fake family records into Firebase!")

if __name__ == "__main__":
    seed_data()
