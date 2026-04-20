from datetime import UTC, date, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class WeeklyMetric(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("athlete_id", "week_start_date", name="uq_weekly_metric_athlete_week"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    athlete_id: int = Field(foreign_key="athlete.id", index=True)
    week_start_date: date = Field(index=True)

    sessions_count: int = Field(default=0)
    duration_sec: int = Field(default=0)
    distance_m: float = Field(default=0)
    elevation_gain_m: float = Field(default=0)
    training_load: float = Field(default=0)

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
