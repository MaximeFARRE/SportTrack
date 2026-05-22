"""APScheduler job definitions for SportTrack FastAPI.

Jobs:
  - daily_risk_assessment_job: every day at 08:00 Europe/Paris
    Computes overtraining risk for all active users and persists the result.
"""
from __future__ import annotations

import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services.overtraining_detection import (
    assess_and_persist,
    get_active_user_ids,
    notify_if_critical,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Paris")


async def daily_risk_assessment_job() -> None:
    """Compute and persist overtraining risk for every active user."""
    logger.info("daily_risk_assessment_job: starting")
    try:
        user_ids = get_active_user_ids()
        logger.info("daily_risk_assessment_job: %d active user(s)", len(user_ids))
        for user_id in user_ids:
            try:
                result = assess_and_persist(user_id, date.today())
                notify_if_critical(result)
                logger.info(
                    "daily_risk_assessment_job: user=%s score=%d level=%s",
                    user_id,
                    result["score"],
                    result["level"],
                )
            except Exception as exc:
                logger.error(
                    "daily_risk_assessment_job: user=%s error=%s",
                    user_id,
                    exc,
                    exc_info=True,
                )
    except Exception as exc:
        logger.error("daily_risk_assessment_job: fatal error: %s", exc, exc_info=True)


def start_scheduler() -> None:
    scheduler.add_job(
        daily_risk_assessment_job,
        trigger="cron",
        hour=8,
        minute=0,
        id="daily_risk_assessment",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — daily risk assessment at 08:00 Europe/Paris")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
