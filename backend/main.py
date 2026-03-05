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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import predict, agent, verify, ocr, community, stats, reminders
from services.firebase_service import init_firebase
from services.reminder_service import start_scheduler, stop_scheduler

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
    start_scheduler()

    logger.info("VaxGuard API ready.")
    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    logger.info("Stopping scheduler...")
    stop_scheduler()


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


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "janvax-api", "version": "1.0.0"}
