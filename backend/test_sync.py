import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def test_sync():
    raw_url = os.getenv("DATABASE_URL")
    # Convert postgresql:// to postgres:// if needed for psycopg2
    url = raw_url.replace("postgresql://", "postgres://")
    
    print(f"Testing Sync connection to: {url.split('@')[1]}")
    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        cur.execute("SELECT 1")
        print("✅ Sync Success!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Sync Failed: {e}")

if __name__ == "__main__":
    test_sync()
