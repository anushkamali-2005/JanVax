import os
import random
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db_setup import DistrictSummary, CommunityData

# Ensure script is run from backend directory
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL must be set in .env")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

DISTRICTS = [
    {"name": "Pune",       "mmr": 78, "dpt": 81, "polio": 85},
    {"name": "Greater Bombay",     "mmr": 84, "dpt": 86, "polio": 89},
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
    {"name": "Amravati",    "mmr": 58, "dpt": 61, "polio": 64},
    {"name": "Raigarh",     "mmr": 70, "dpt": 72, "polio": 75},
    {"name": "Ratnagiri",  "mmr": 65, "dpt": 68, "polio": 71},
    {"name": "Sindhudurg", "mmr": 79, "dpt": 81, "polio": 84},
    {"name": "Dhule",      "mmr": 61, "dpt": 63, "polio": 66},
    {"name": "Jalgaon",    "mmr": 67, "dpt": 70, "polio": 72},
    {"name": "Nanded",     "mmr": 66, "dpt": 68, "polio": 71},
    {"name": "Latur",      "mmr": 72, "dpt": 74, "polio": 77},
]

def seed_data():
    db = SessionLocal()
    total_districts = len(DISTRICTS)

    try:
        # Clear existing data
        db.query(CommunityData).delete()
        db.query(DistrictSummary).delete()
        db.commit()

        for i, dist in enumerate(DISTRICTS):
            print(f"[{i+1:02d}/{total_districts}] Seeding data for {dist['name']}...")
            
            # 1. Write the aggregate summary
            summary = DistrictSummary(
                district_name=dist["name"],
                mmr_coverage=dist["mmr"],
                dpt_coverage=dist["dpt"],
                polio_coverage=dist["polio"],
                record_count=25,
                last_updated=datetime.datetime.utcnow()
            )
            db.add(summary)

            # 2. Write 25 fake family records per district
            for j in range(25):
                record = CommunityData(
                    district_name=dist["name"],
                    vaccine_type=random.choice(["MMR", "DPT", "Polio"]),
                    coverage_pct=dist["mmr"] + random.randint(-15, 15), # Fuzz around district average
                    last_updated=datetime.datetime.utcnow()
                )
                db.add(record)

        # Commit all together
        db.commit()
        print("\n✅ Successfully seeded 20 districts and 500 fake family records into Supabase PostgreSQL!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
