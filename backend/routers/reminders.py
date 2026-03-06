from fastapi import APIRouter
from datetime import datetime, timedelta
from firebase_admin import firestore
import os

router = APIRouter(prefix='/reminders', tags=['reminders'])

# Twilio credentials from .env
TWILIO_SID   = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_FROM  = os.getenv('TWILIO_FROM_NUMBER') # Doc said TWILIO_PHONE_NUMBER but project .env has TWILIO_FROM_NUMBER

# IAP vaccine schedule — same day offsets used everywhere
SCHEDULE = [
    {"label":"At Birth",  "days":0,    "vaccines":["Hepatitis B","BCG","OPV-0","Vitamin K"]},
    {"label":"6 Weeks",   "days":42,   "vaccines":["OPV-1","Penta-1","IPV-1","Rotavirus-1","PCV-1"]},
    {"label":"10 Weeks",  "days":70,   "vaccines":["OPV-2","Penta-2","IPV-2","Rotavirus-2","PCV-2"]},
    {"label":"14 Weeks",  "days":98,   "vaccines":["OPV-3","Penta-3","IPV-3","Rotavirus-3","PCV-3"]},
    {"label":"9 Months",  "days":274,  "vaccines":["MR-1","Vitamin A","JE-1"]},
    {"label":"15 Months", "days":456,  "vaccines":["MMR-1","Varicella-1","PCV Booster"]},
    {"label":"18 Months", "days":548,  "vaccines":["DPT Booster","OPV Booster","MR-2"]},
    {"label":"4-5 Years", "days":1461, "vaccines":["DPT Booster-2","OPV-2","MMR-2"]},
]

def _get_all_children():
    """Fetch all child documents from Firestore."""
    db = firestore.client()
    return [doc.to_dict() | {'id': doc.id} for doc in db.collection('children').stream()]

def _send_sms(phone: str, message: str):
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM]): return
    from twilio.rest import Client
    Client(TWILIO_SID, TWILIO_TOKEN).messages.create(
        body=message, from_=TWILIO_FROM, to=phone)

def _check_and_remind(days_before: int, channel_label: str):
    """Core logic: find children with a vaccine due in exactly days_before days."""
    today    = datetime.now().date()
    target   = today + timedelta(days=days_before)
    children = _get_all_children()
    sent     = 0

    for child in children:
        dob    = datetime.strptime(child['dateOfBirth'], '%Y-%m-%d').date()
        given  = {v['name'].lower() for v in child.get('vaccines', [])}
        phone  = child.get('parentPhone', '')
        name   = child.get('name', 'your child')

        for milestone in SCHEDULE:
            due_date = dob + timedelta(days=milestone['days'])
            if due_date != target: continue

            pending = [v for v in milestone['vaccines'] if v.lower() not in given]
            if not pending: continue

            vaccine_list = ', '.join(pending)
            msg = (
                f'JanVax: {name} is due for {vaccine_list} '
                f'on {due_date.strftime("%d %b %Y")} ({milestone["label"]}). '
                f'Please visit your nearest vaccination centre.'
            )
            if phone: _send_sms(phone, msg)
            sent += 1
    return sent

async def run_7day_reminders():   _check_and_remind(7, '7-day')
async def run_1day_reminders():   _check_and_remind(1, '1-day')
async def run_day_of_reminders(): _check_and_remind(0, 'day-of')

async def run_overdue_followups():
    """Fire 3 days after a missed vaccine."""
    _check_and_remind(-3, 'overdue')


@router.post('/trigger-test')
async def trigger_test(phone: str, child_name: str = 'Demo Child'):
    """Manually fire a test SMS — used for demo."""
    msg = (f'JanVax Test: {child_name} is due for MMR vaccine in 7 days. '
           f'Visit your nearest centre. Reply STOP to opt out.')
    _send_sms(phone, msg)
    return {'sent': True, 'to': phone, 'message': msg}

@router.get('/status')
async def get_status():
    """Return scheduled job counts and next run times — shown on /reminders page."""
    from main import scheduler
    jobs = [{
        'id':       job.id,
        'name':     job.name,
        'next_run': str(job.next_run_time),
    } for job in scheduler.get_jobs()]
    return {'jobs': jobs, 'total': len(jobs)}

from pydantic import BaseModel
class PushSubscription(BaseModel):
    subscription: dict
    userId: str

@router.post('/subscribe')
async def subscribe_user(payload: PushSubscription):
    """Save the web push subscription for a user."""
    db = firestore.client()
    db.collection('users').document(payload.userId).set(
        {'pushSubscription': payload.subscription}, 
        merge=True
    )
    return {'status': 'subscribed'}
