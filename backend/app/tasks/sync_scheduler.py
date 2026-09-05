from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
import logging

from app.config import settings
from app.services.sync_service import sync_current

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def run_sync():
    try:
        results = await sync_current()
        for r in results:
            if not r.get("success"):
                logger.warning(f"Sync problem: {r.get('message')}")
    except Exception as e:
        logger.error(f"Error in sync task: {e}", exc_info=True)


def start_scheduler():
    scheduler.add_job(
        run_sync,
        IntervalTrigger(minutes=settings.sync_interval_minutes),
        id="espn_sync",
        name="Sync games, spreads and scores from ESPN",
        replace_existing=True,
        next_run_time=datetime.now(),  # run once right away on boot
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info(f"ESPN sync scheduler started (every {settings.sync_interval_minutes} min)")


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
    return {"running": scheduler.running, "jobs": jobs}
