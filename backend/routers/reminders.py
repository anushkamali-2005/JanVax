"""
backend/routers/reminders.py
---------------------------
/reminders endpoints for manual triggering and status checking.
"""

import logging

from fastapi import APIRouter, Depends, BackgroundTasks
from services.firebase_service import verify_firebase_token
from services.reminder_service import send_daily_reminders, get_scheduler_status

logger = logging.getLogger("vaxguard.reminders")

router = APIRouter()


@router.post("/trigger-daily")
async def trigger_reminders(
    background_tasks: BackgroundTasks,
    uid: str = Depends(verify_firebase_token),
):
    """Manually triggers the daily reminder job in the background."""
    logger.info("Manual reminder trigger by uid=%s", uid)
    background_tasks.add_task(send_daily_reminders)
    return {"status": "triggered", "job": "daily_reminders"}


@router.get("/status")
async def get_reminder_status(uid: str = Depends(verify_firebase_token)):
    """Returns live status of the reminder scheduler and job info."""
    return get_scheduler_status()
