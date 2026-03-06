import pandas as pd, numpy as np
import os

os.makedirs('backend/data', exist_ok=True)

np.random.seed(42)
N = 10000

DISTRICTS = ['Pune','Mumbai','Nandurbar','Nashik','Kolhapur',
             'Amravati','Aurangabad','Nagpur','Latur','Solapur']
# District-level baseline risk (reflects real Maharashtra outbreak data)
DISTRICT_RISK = {'Nandurbar':0.72,'Latur':0.65,'Amravati':0.60,
                 'Aurangabad':0.52,'Nashik':0.48,'Solapur':0.45,
                 'Nagpur':0.40,'Kolhapur':0.35,'Pune':0.28,'Mumbai':0.22}

age_months  = np.random.randint(0, 60, N)
gender      = np.random.choice([0,1], N)   # 0=female, 1=male
district    = np.random.choice(DISTRICTS, N)
vax_count   = np.random.randint(0, 12, N)  # vaccines received so far
who_flag    = np.random.choice([0,1], N, p=[0.85, 0.15])  # WHO outbreak flag
family_hist = np.random.choice([0,1], N, p=[0.80, 0.20])  # family disease history
missed_doses= np.random.randint(0, 5, N)

# Risk score formula — higher = more at risk
base = np.array([DISTRICT_RISK[d] for d in district])
raw  = (base * 40
      + (1 - vax_count/12) * 25
      + who_flag * 20
      + family_hist * 10
      + missed_doses * 3
      + np.random.normal(0, 5, N))  # noise

risk_score = np.clip(raw, 0, 100).astype(int)
high_risk  = (risk_score >= 70).astype(int)  # binary classification target

df = pd.DataFrame({
    'age_months': age_months, 'gender': gender,
    'district': district, 'vax_count': vax_count,
    'who_outbreak_flag': who_flag, 'family_history': family_hist,
    'missed_doses': missed_doses, 'risk_score': risk_score, 'high_risk': high_risk
})
df.to_csv('backend/data/training_data.csv', index=False)
print(f'Generated {N} records. High-risk rate: {high_risk.mean():.1%}')
