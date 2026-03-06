import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL not found")
        return

    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()
        
        print("Checking prediction_logs table...")
        
        # Add model_version
        try:
            cur.execute("ALTER TABLE prediction_logs ADD COLUMN model_version VARCHAR(50);")
            print("Added model_version column")
        except Exception as e:
            conn.rollback()
            print(f"Skipping model_version: {e}")

        # Add blockchain_hash
        try:
            cur.execute("ALTER TABLE prediction_logs ADD COLUMN blockchain_hash TEXT;")
            print("Added blockchain_hash column")
        except Exception as e:
            conn.rollback()
            print(f"Skipping blockchain_hash: {e}")

        conn.commit()
        cur.close()
        conn.close()
        print("Migration complete.")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
