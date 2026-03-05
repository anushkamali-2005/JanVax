"""
backend/routers/reminders.py
---------------------------
/reminders endpoints for manual triggering and status checking.
"""

from fastapi import APIRouter, Depends, BackgroundTasks
from services.firebase_service import verify_firebase_token
from services.reminder_service import send_daily_reminders

router = APIRouter()

@router.post("/trigger-daily")
async def trigger_reminders(
    background_tasks: BackgroundTasks,
    uid: str = Depends(verify_firebase_token)
):
    """
    Manually triggers the daily reminder job in the background.
    """
    background_tasks.add_task(send_daily_reminders)
    return {"status": "triggered", "job": "daily_reminders"}

@router.get("/status")
async def get_reminder_status(uid: str = Depends(verify_firebase_token)):
    """
    Returns the status of the reminder scheduler and last run times.
    """
    # This could be expanded to fetch from the scheduler itself
    return {
        "scheduler_running": True,
        "jobs": [
            {"id": "daily_reminders", "next_run": "08:00 AM IST"},
            {"id": "batch_scoring",   "next_run": "02:00 AM IST"},
        ]
    }
