import os
import urllib.parse
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

def test_uri_escape():
    url = os.getenv("DATABASE_URL")
    # Parse the URL
    base = url.split("://")[1]
    protocol = url.split("://")[0]
    auth, host_port_db = base.split("@")
    user, password = auth.split(":")
    
    # Re-encode password just in case of special chars
    safe_pass = urllib.parse.quote_plus(password)
    new_url = f"{protocol}://{user}:{safe_pass}@{host_port_db}"
    if "sslmode" not in new_url:
        sep = "&" if "?" in new_url else "?"
        new_url += f"{sep}sslmode=require"
    
    print(f"Testing escaped URL: {host_port_db}")
    try:
        engine = create_engine(new_url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ ESCAPED SUCCESS!")
    except Exception as e:
        print(f"❌ ESCAPED FAILED: {e}")

if __name__ == "__main__":
    test_uri_escape()
