from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.metrics import (
    DailyMetricRead,
    DashboardSummaryRead,
    ProgressionSummaryRead,
    WeeklyComparisonRead,
    WeeklyMetricRead,
)
from app.services.metrics_service import (
    get_dashboard_summary,
    get_progression_summary,
    get_weekly_comparison_for_all_connected_users,
    list_daily_metrics,
    list_weekly_metrics,
    recompute_metrics_for_athlete,
)


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.post("/athletes/{athlete_id}/recompute")
def recompute_athlete_metrics(
    athlete_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
) -> dict:
    result = recompute_metrics_for_athlete(
        session=session,
        athlete_id=athlete_id,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "message": "Recalcul des metriques termine.",
        **result,
    }


@router.get("/daily", response_model=list[DailyMetricRead])
def read_daily_metrics(
    athlete_id: int = Query(...),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[DailyMetricRead]:
    return list_daily_metrics(
        session=session,
        athlete_id=athlete_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/weekly", response_model=list[WeeklyMetricRead])
def read_weekly_metrics(
    athlete_id: int = Query(...),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[WeeklyMetricRead]:
    return list_weekly_metrics(
        session=session,
        athlete_id=athlete_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/dashboard/athletes/{athlete_id}", response_model=DashboardSummaryRead)
def read_dashboard_summary(
    athlete_id: int,
    period_days: int = Query(default=30, ge=1, le=365),
    recent_activities_limit: int = Query(default=5, ge=1, le=20),
    sport_type: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> DashboardSummaryRead:
    return get_dashboard_summary(
        session=session,
        athlete_id=athlete_id,
        period_days=period_days,
        recent_activities_limit=recent_activities_limit,
        sport_type=sport_type,
    )


@router.get("/progression/athletes/{athlete_id}", response_model=ProgressionSummaryRead)
def read_progression_summary(
    athlete_id: int,
    weeks: int = Query(default=26, ge=8, le=52),
    sport_type: str | None = Query(default=None),
    sessions_target: int = Query(default=3, ge=1, le=7),
    session: Session = Depends(get_session),
) -> ProgressionSummaryRead:
    return get_progression_summary(
        session=session,
        athlete_id=athlete_id,
        weeks=weeks,
        sport_type=sport_type,
        sessions_target=sessions_target,
    )


@router.get("/comparison/weekly", response_model=WeeklyComparisonRead)
def read_weekly_comparison_for_all_connected_users(
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
) -> WeeklyComparisonRead:
    try:
        members = get_weekly_comparison_for_all_connected_users(
            session=session,
            actor_user_id=actor_user_id,
            start_date=start_date,
            end_date=end_date,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return WeeklyComparisonRead(
        actor_user_id=actor_user_id,
        start_date=start_date,
        end_date=end_date,
        members=members,
    )
