"""
backend/main.py
---------------
FastAPI application entry point.
Registers all routers, middleware, startup events.

CRITICAL: APScheduler starts in lifespan — not in a separate thread.
CRITICAL: Firebase Admin SDK initialized once at startup.
CRITICAL: CORS allows Vercel frontend domain + localhost for dev.
"""

import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load .env before any other imports that might use env vars
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import predict, agent, verify, ocr, community, stats, reminders, glossary, explain
from services.firebase_service import init_firebase
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from routers.reminders import (
    run_7day_reminders, run_1day_reminders,
    run_day_of_reminders, run_overdue_followups
)

scheduler = AsyncIOScheduler()
# Every morning at 8am IST (2:30 UTC)
scheduler.add_job(run_7day_reminders,    'cron', hour=2, minute=30)
scheduler.add_job(run_1day_reminders,    'cron', hour=2, minute=35)
scheduler.add_job(run_day_of_reminders,  'cron', hour=2, minute=40)
scheduler.add_job(run_overdue_followups, 'cron', hour=2, minute=45)

from services.who_feed import fetch_who_flag
# scheduler.add_job(fetch_who_flag, 'interval', hours=6)
# fetch_who_flag()   # Removing synchronous call that hangs startup

from routers.predict import predict_risk, ChildInput
from firebase_admin import firestore

async def score_all_children():
    """Nightly APScheduler job — runs XGBoost on every child in Firestore."""
    db_fs = firestore.client()
    children = db_fs.collection('children').stream()
    count = 0
    for doc in children:
        child = doc.to_dict()
        try:
            await predict_risk(ChildInput(
                child_id       = doc.id,
                age_months     = child.get('ageMonths', 12),
                gender         = 1 if child.get('gender','')=='male' else 0,
                district       = child.get('district', 'Pune'),
                vax_count      = len(child.get('vaccines', [])),
                family_history = int(child.get('familyHistory', 0)),
                missed_doses   = int(child.get('missedDoses', 0)),
            ))
            count += 1
        except Exception as e:
            print(f'Scoring error for {doc.id}: {e}')
    print(f'Nightly scoring complete: {count} children scored.')

scheduler.add_job(score_all_children, 'cron', hour=20, minute=30)  # 2am IST

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("vaxguard")


# ── Lifespan (startup + shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("Initializing Firebase Admin SDK...")
    init_firebase()

    logger.info("Starting APScheduler reminder jobs...")
    scheduler.start()

    logger.info("JanVax API ready.")
    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    logger.info("Stopping scheduler...")
    scheduler.shutdown()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="JanVax AI API",
    version="1.0.0",
    description="India's AI-powered digital vaccination record management system",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://vaxguard.vercel.app",          # update with real Vercel URL after deploy
    os.getenv("FRONTEND_URL", ""),          # set in Render env vars
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(predict.router,    prefix="",           tags=["ML"])
app.include_router(agent.router,      prefix="",           tags=["Agent"])
app.include_router(verify.router,     prefix="",           tags=["Blockchain"])
app.include_router(ocr.router,        prefix="",           tags=["OCR"])
app.include_router(community.router,  prefix="/community", tags=["Community"])
app.include_router(stats.router,      prefix="",           tags=["MLOps"])
app.include_router(reminders.router,  prefix="/reminders", tags=["Reminders"])
app.include_router(glossary.router,   prefix="",           tags=["Glossary"])
app.include_router(explain.router,    prefix="",           tags=["ML Explain"])


from fastapi.responses import RedirectResponse

# ── Health check & Root ───────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "janvax-api", "version": "1.0.0"}

@app.get("/", include_in_schema=False)
def root():
    """Redirects the base URL to the interactive API documentation."""
    return RedirectResponse(url="/docs")
