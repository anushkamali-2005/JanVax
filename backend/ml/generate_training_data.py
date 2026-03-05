import pandas as pd
import numpy as np
import os
import random

# Columns from ml.features
FEATURE_COLUMNS = [
    "age_months",
    "vaccines_missed_count",
    "days_overdue",
    "district_outbreak_flag",
    "sibling_history",
    "gender_male",
    "state_high_risk",
    "reminder_ignored_count",
]
TARGET_COLUMN = "is_high_risk"

def generate_synthetic_data(n_samples=5000):
    data = []
    for _ in range(n_samples):
        age_months = random.randint(0, 60)
        vaccines_missed = random.randint(0, 5)
        days_overdue = random.randint(0, 200) if vaccines_missed > 0 else 0
        district_outbreak = 1 if random.random() < 0.1 else 0
        sibling_history = 1 if random.random() < 0.05 else 0
        gender_male = random.randint(0, 1)
        state_high_risk = 1 if random.random() < 0.2 else 0
        reminder_ignored = random.randint(0, 3) if vaccines_missed > 0 else 0
        
        # Simple logic for "is_high_risk" target
        # Higher risk if many missed, long overdue, or outbreak
        risk_score = (vaccines_missed * 15) + (days_overdue / 10) + (district_outbreak * 30) + (reminder_ignored * 10)
        is_high_risk = 1 if risk_score > 60 else 0
        
        data.append([
            age_months, vaccines_missed, days_overdue, 
            district_outbreak, sibling_history, gender_male,
            state_high_risk, reminder_ignored, is_high_risk
        ])
    
    df = pd.DataFrame(data, columns=FEATURE_COLUMNS + [TARGET_COLUMN])
    return df

if __name__ == "__main__":
    df = generate_synthetic_data()
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    df.to_csv(os.path.join(data_dir, "synthetic_records.csv"), index=False)
    print(f"Generated 5000 synthetic records in {data_dir}/synthetic_records.csv")
