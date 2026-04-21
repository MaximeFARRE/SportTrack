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
    training_load: float = Field(default=0, ge=0)


class DashboardRecentActivityRead(BaseModel):
    id: int
    name: str
    sport_type: str
    start_date: datetime
    duration_sec: int
    distance_m: float
    elevation_gain_m: float


class DashboardSnapshotRead(BaseModel):
    sessions_count: int = Field(ge=0)
    duration_sec: int = Field(ge=0)
    distance_m: float = Field(ge=0)
    elevation_gain_m: float = Field(ge=0)
    training_load: float = Field(ge=0)
    consistency_score: float = Field(ge=0)


class DashboardFitnessStateRead(BaseModel):
    ctl: float
    atl: float
    tsb: float
    acwr: float | None = None
    status: str
    load_change_vs_previous_week_pct: float | None = None


class DashboardTimelinePointRead(BaseModel):
    metric_date: date
    daily_load: float = Field(ge=0)
    ctl: float
    atl: float
    tsb: float


class DashboardWeeklyTrendRead(BaseModel):
    week_start_date: date
    sessions_count: int = Field(ge=0)
    duration_sec: int = Field(ge=0)
    distance_m: float = Field(ge=0)
    elevation_gain_m: float = Field(ge=0)
    training_load: float = Field(ge=0)


class DashboardTrendSummaryRead(BaseModel):
    weeks_count: int = Field(ge=0)
    load_change_vs_previous_week_pct: float | None = None
    biggest_week: DashboardWeeklyTrendRead | None = None


class DashboardAlertRead(BaseModel):
    code: str
    severity: str
    message: str


class DashboardLeaderboardRowRead(BaseModel):
    rank: int = Field(ge=1)
    user_id: int
    display_name: str
    sessions_count: int = Field(ge=0)
    training_load: float = Field(ge=0)
    distance_m: float = Field(ge=0)
    is_current_user: bool = False


class DashboardGamificationRead(BaseModel):
    streak_days: int = Field(ge=0)
    recent_badge: str
    weekly_challenge: str
    mini_leaderboard: list[DashboardLeaderboardRowRead]


class DashboardSummaryRead(BaseModel):
    athlete_id: int
    period_days: int
    sport_filter: str | None = None
    sessions_count: int
    duration_sec: int
    distance_m: float
    elevation_gain_m: float
    sports_breakdown: list[DashboardSportStatRead]
    weekly_metrics: list[WeeklyMetricRead]
    weekly_trends: list[DashboardWeeklyTrendRead]
    snapshot_7d: DashboardSnapshotRead
    fitness_state: DashboardFitnessStateRead
    trend_summary: DashboardTrendSummaryRead
    load_timeline: list[DashboardTimelinePointRead]
    alerts: list[DashboardAlertRead]
    gamification: DashboardGamificationRead
    recent_activities: list[DashboardRecentActivityRead]


class WeeklyComparisonMemberRead(BaseModel):
    user_id: int
    display_name: str
    athlete_count: int
    sessions_count: int
    duration_sec: int
    distance_m: float
    elevation_gain_m: float
    training_load: float


class WeeklyComparisonRead(BaseModel):
    actor_user_id: int
    start_date: date | None
    end_date: date | None
    members: list[WeeklyComparisonMemberRead]
