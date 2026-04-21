from datetime import date, datetime
from typing import Any

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
    streak_weeks_target: int = Field(default=0, ge=0)
    recent_badge: str
    weekly_challenge: str
    badges: list[dict[str, str]] = []
    weekly_challenges: list[dict[str, Any]] = []
    xp: dict[str, Any] = {}
    activity_feed: list[dict[str, str]] = []
    goals_completed_30d: int = Field(default=0, ge=0)
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


class ProgressionMetricDeltaRead(BaseModel):
    current_value: float
    previous_value: float
    change_pct: float | None = None


class ProgressionWeeklyTrendRead(BaseModel):
    week_start_date: date
    sessions_count: int = Field(ge=0)
    duration_sec: int = Field(ge=0)
    distance_m: float = Field(ge=0)
    elevation_gain_m: float = Field(ge=0)
    training_load: float = Field(ge=0)
    duration_sec_ma3: float = Field(ge=0)
    distance_m_ma3: float = Field(ge=0)
    training_load_ma3: float = Field(ge=0)


class ProgressionRunRecordRead(BaseModel):
    distance_km: float = Field(ge=0)
    best_estimated_time_sec: int = Field(ge=0)
    pace_sec_per_km: float = Field(ge=0)
    activity_name: str
    activity_date: date
    source_distance_km: float = Field(ge=0)


class ProgressionPerformanceRead(BaseModel):
    sport_type: str
    run_records: list[ProgressionRunRecordRead]
    summary: dict[str, Any]


class ProgressionBadgeRead(BaseModel):
    code: str
    title: str
    description: str


class ProgressionRobustnessRead(BaseModel):
    consecutive_training_weeks: int = Field(ge=0)
    weeks_above_target: int = Field(ge=0)
    stable_load_ratio: float = Field(ge=0)
    longest_active_streak_days: int = Field(ge=0)


class ProgressionSummaryBlockRead(BaseModel):
    volume_4w: ProgressionMetricDeltaRead
    average_load_4w: ProgressionMetricDeltaRead
    regularity_4w: ProgressionMetricDeltaRead
    best_recent_week: ProgressionWeeklyTrendRead | None = None
    current_main_sport: str
    progression_score: float = Field(ge=0, le=100)


class ProgressionSummaryRead(BaseModel):
    athlete_id: int
    sport_filter: str | None = None
    weeks: int = Field(ge=8, le=52)
    sessions_target: int = Field(ge=1, le=7)
    summary: ProgressionSummaryBlockRead
    weekly_trends: list[ProgressionWeeklyTrendRead]
    performance: ProgressionPerformanceRead
    robustness: ProgressionRobustnessRead
    badges: list[ProgressionBadgeRead]
    gamification: dict[str, Any] = {}


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
