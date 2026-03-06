from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, Integer
from sqlalchemy.orm import declarative_base

# Use declarative_base from sqlalchemy.orm as pointed out by previous warning
Base = declarative_base()

class PredictionLog(Base):
    __tablename__ = 'prediction_logs'
    id = Column(String, primary_key=True)
    child_id = Column(String)
    risk_score = Column(Float)
    shap_values = Column(Text)
    blockchain_hash = Column(String)
    created_at = Column(DateTime)

class DistrictSummary(Base):
    __tablename__ = 'district_summaries'
    district_name = Column(String, primary_key=True)
    mmr_coverage = Column(Integer)
    dpt_coverage = Column(Integer)
    polio_coverage = Column(Integer)
    record_count = Column(Integer)
    last_updated = Column(DateTime)

class CommunityData(Base):
    __tablename__ = 'community_data'
    id = Column(Integer, primary_key=True, autoincrement=True)
    district_name = Column(String)
    vaccine_type = Column(String)
    coverage_pct = Column(Integer)
    last_updated = Column(DateTime)

# To avoid import errors, this file is standalone if run directly
if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()
    
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL must be set in .env")

    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    print("PostgreSQL tables created successfully.")
