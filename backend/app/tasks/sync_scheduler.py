from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
import logging

from app.config import settings
from app.database import db
from app.services.season_service import utcnow
from app.services.sync_service import sync_current, live_window
from app.services.notify_service import run_notifications, email_configured

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
_last_full_sync = None


async def run_sync():
    """Ticks every LIVE_SYNC_INTERVAL_MINUTES. Syncs when the quiet interval
    has elapsed, or immediately whenever games are in play so scores and
    settlements land within a couple of minutes on a Saturday."""
    global _last_full_sync
    try:
        now = utcnow()
        due = _last_full_sync is None or (now - _last_full_sync) >= timedelta(minutes=settings.sync_interval_minutes)
        if not due and not live_window(db.get_session()):
            return
        results = await sync_current()
        if any(r.get("success") for r in results):
            _last_full_sync = now
        for r in results:
            if not r.get("success"):
                logger.warning(f"Sync problem: {r.get('message')}")
    except Exception as e:
        logger.error(f"Error in sync task: {e}", exc_info=True)


async def run_notify():
    try:
        await run_notifications()
    except Exception as e:
        logger.error(f"Error in notification task: {e}", exc_info=True)


def start_scheduler():
    scheduler.add_job(
        run_notify,
        IntervalTrigger(minutes=10),
        id="notifications",
        name="Email reminders and results",
        replace_existing=True,
        next_run_time=datetime.now() + timedelta(seconds=90),
        coalesce=True,
        max_instances=1,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        run_sync,
        IntervalTrigger(minutes=settings.live_sync_interval_minutes),
        id="espn_sync",
        name="Sync games, spreads and scores from ESPN",
        replace_existing=True,
        next_run_time=datetime.now(),  # run once right away on boot
        coalesce=True,
        max_instances=1,
        misfire_grace_time=60,
    )
    scheduler.start()
    logger.info(f"ESPN sync scheduler started (every {settings.sync_interval_minutes} min, "
                f"every {settings.live_sync_interval_minutes} min during games); "
                f"email {'on' if email_configured() else 'off (SMTP not configured)'}")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")


def get_scheduler_status():
    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            })
    return {
        "running": scheduler.running,
        "jobs": jobs,
        "last_full_sync": _last_full_sync.isoformat() if _last_full_sync else None,
    }
