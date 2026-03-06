import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def test_url(url, label):
    print(f"--- Testing {label} ---")
    print(f"URL: {url}")
    try:
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
        print(f"SUCCESS: {result.fetchone()}")
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}")
    print("\n")

async def main():
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        print("DATABASE_URL not found in .env")
        return

    # Base async url
    base_url = raw_url.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
    
    # Remove any existing sslmode/ssl
    if "?" in base_url:
        base_url = base_url.split("?")[0]

    # Variants
    await test_url(f"{base_url}?ssl=require", "ssl=require")
    await test_url(f"{base_url}?sslmode=require", "sslmode=require")
    await test_url(base_url, "No SSL param")

if __name__ == "__main__":
    asyncio.run(main())
