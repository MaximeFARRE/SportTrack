from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DailyMetricRead(BaseModel):
    id: int
    athlete_id: int
    metric_date: date
    sessions_count: int = Field(ge=0)
    duration_sec: int = Field(ge=0)
    distance_m: float = Field(ge=0)
    elevation_gain_m: float = Field(ge=0)
    training_load: float = Field(ge=0)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WeeklyMetricRead(BaseModel):
    id: int
    athlete_id: int
    week_start_date: date
    sessions_count: int = Field(ge=0)
    duration_sec: int = Field(ge=0)
    distance_m: float = Field(ge=0)
    elevation_gain_m: float = Field(ge=0)
    training_load: float = Field(ge=0)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DashboardSportStatRead(BaseModel):
    sport_type: str
    sessions_count: int
    duration_sec: int
    distance_m: float
    elevation_gain_m: float


class DashboardRecentActivityRead(BaseModel):
    id: int
    name: str
    sport_type: str
    start_date: datetime
    duration_sec: int
    distance_m: float
    elevation_gain_m: float


class DashboardSummaryRead(BaseModel):
    athlete_id: int
    period_days: int
    sessions_count: int
    duration_sec: int
    distance_m: float
    elevation_gain_m: float
    sports_breakdown: list[DashboardSportStatRead]
    weekly_metrics: list[WeeklyMetricRead]
    recent_activities: list[DashboardRecentActivityRead]
