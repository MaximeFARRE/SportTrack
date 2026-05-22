from calendar import monthrange
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Activity, DailyMetric


def get_month_data(
    session: Session,
    athlete_id: int,
    year: int,
    month: int,
) -> dict[str, Any]:
    """Return day-by-day aggregation for a given athlete / month."""
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    activities = list(
        session.exec(
            select(Activity)
            .where(Activity.athlete_id == athlete_id)
            .where(func.date(Activity.start_date) >= first_day)
            .where(func.date(Activity.start_date) <= last_day)
            .order_by(Activity.start_date)
        ).all()
    )

    metrics = list(
        session.exec(
            select(DailyMetric)
            .where(DailyMetric.athlete_id == athlete_id)
            .where(DailyMetric.metric_date >= first_day)
            .where(DailyMetric.metric_date <= last_day)
        ).all()
    )

    days: dict[str, dict[str, Any]] = {}

    for activity in activities:
        day_key = activity.start_date.date().isoformat()
        if day_key not in days:
            days[day_key] = {"activities": [], "training_load": 0.0, "duration_sec": 0, "distance_m": 0.0}
        days[day_key]["activities"].append(
            {
                "id": activity.id,
                "name": activity.name,
                "sport_type": activity.sport_type,
                "duration_sec": activity.duration_sec,
                "distance_m": activity.distance_m,
            }
        )

    for metric in metrics:
        day_key = metric.metric_date.isoformat()
        if day_key not in days:
            days[day_key] = {"activities": [], "training_load": 0.0, "duration_sec": 0, "distance_m": 0.0}
        days[day_key]["training_load"] = metric.training_load
        days[day_key]["duration_sec"] = metric.duration_sec
        days[day_key]["distance_m"] = metric.distance_m

    return {"year": year, "month": month, "days": days}
