import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

async def test_conn(url, name):
    print(f"Testing {name}...")
    try:
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print(f"✅ {name} Success!")
        return True
    except Exception as e:
        print(f"❌ {name} Failed: {e}")
        return False

async def main():
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        print("No DATABASE_URL found")
        return

    # Test 1: As provided (likely 6543)
    async_url_1 = raw_url.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
    if "?sslmode" not in async_url_1:
        async_url_1 += "&sslmode=require" if "?" in async_url_1 else "?sslmode=require"
    await test_conn(async_url_1, "Original/Pooled")

    # Test 2: Port 5432 (Direct)
    url_5432 = raw_url.replace(":6543", ":5432")
    async_url_2 = url_5432.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
    if "?sslmode" not in async_url_2:
        async_url_2 += "&sslmode=require" if "?" in async_url_2 else "?sslmode=require"
    await test_conn(async_url_2, "Direct (5432)")

if __name__ == "__main__":
    asyncio.run(main())
