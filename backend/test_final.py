import os
import ssl
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

def test_sync_final():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("No DATABASE_URL")
        return
    
    # Force postgresql://
    url = url.replace("postgres://", "postgresql://")
    if "sslmode" not in url:
        sep = "&" if "?" in url else "?"
        url += f"{sep}sslmode=require"
        
    print(f"Final testing: {url.split('@')[1]}")
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ SUCCESS!")
    except Exception as e:
        print(f"❌ FAILED: {e}")

if __name__ == "__main__":
    test_sync_final()
