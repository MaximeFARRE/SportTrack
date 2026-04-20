import json
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

from app.models import Athlete
from app.schemas.activity import ActivityCreate
from app.services.activity_service import create_activity
from app.services.metrics_service import recompute_metrics_for_athlete
from app.services.strava_service import ensure_valid_access_token, fetch_athlete_activities


def _parse_strava_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _map_strava_activity_to_create(athlete_id: int, payload: dict[str, Any]) -> ActivityCreate:
    return ActivityCreate(
        athlete_id=athlete_id,
        provider_activity_id=str(payload.get("id")) if payload.get("id") is not None else None,
        name=payload.get("name") or "Activite Strava",
        sport_type=payload.get("sport_type") or payload.get("type") or "Unknown",
        start_date=_parse_strava_datetime(payload.get("start_date")),
        timezone=payload.get("timezone"),
        duration_sec=int(payload.get("elapsed_time") or 0),
        moving_time_sec=int(payload.get("moving_time") or 0),
        distance_m=float(payload.get("distance") or 0),
        elevation_gain_m=float(payload.get("total_elevation_gain") or 0),
        average_speed=payload.get("average_speed"),
        max_speed=payload.get("max_speed"),
        average_heartrate=payload.get("average_heartrate"),
        max_heartrate=payload.get("max_heartrate"),
        average_cadence=payload.get("average_cadence"),
        average_power=payload.get("average_watts"),
        calories=payload.get("calories"),
        raw_data_json=json.dumps(payload, ensure_ascii=True),
    )


def sync_recent_strava_activities(
    session: Session,
    athlete_id: int,
    per_page: int = 30,
) -> dict[str, Any]:
    athlete = session.get(Athlete, athlete_id)
    if not athlete:
        raise LookupError("Athlete introuvable.")

    if athlete.provider != "strava":
        raise ValueError("Seuls les athletes Strava peuvent etre synchronises.")

    access_token = ensure_valid_access_token(session=session, athlete=athlete)
    activities_payload = fetch_athlete_activities(access_token=access_token, per_page=per_page, page=1)

    imported_count = 0
    skipped_count = 0

    for item in activities_payload:
        try:
            activity_data = _map_strava_activity_to_create(athlete_id=athlete.id, payload=item)
            create_activity(session=session, activity_data=activity_data)
            imported_count += 1
        except ValueError:
            skipped_count += 1

    athlete.last_sync_at = datetime.now(UTC)
    athlete.updated_at = datetime.now(UTC)
    session.add(athlete)
    session.commit()
    session.refresh(athlete)

    metrics_result = recompute_metrics_for_athlete(session=session, athlete_id=athlete.id)

    return {
        "athlete_id": athlete.id,
        "fetched_count": len(activities_payload),
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "daily_metrics_count": metrics_result["daily_metrics_count"],
        "weekly_metrics_count": metrics_result["weekly_metrics_count"],
        "last_sync_at": athlete.last_sync_at.isoformat() if athlete.last_sync_at else None,
    }


def import_strava_history(
    session: Session,
    athlete_id: int,
    per_page: int = 100,
    max_pages: int = 10,
) -> dict[str, Any]:
    athlete = session.get(Athlete, athlete_id)
    if not athlete:
        raise LookupError("Athlete introuvable.")

    if athlete.provider != "strava":
        raise ValueError("Seuls les athletes Strava peuvent etre synchronises.")

    access_token = ensure_valid_access_token(session=session, athlete=athlete)

    fetched_count = 0
    imported_count = 0
    skipped_count = 0

    for page in range(1, max_pages + 1):
        page_payload = fetch_athlete_activities(
            access_token=access_token,
            per_page=per_page,
            page=page,
        )
        if not page_payload:
            break

        fetched_count += len(page_payload)
        for item in page_payload:
            try:
                activity_data = _map_strava_activity_to_create(athlete_id=athlete.id, payload=item)
                create_activity(session=session, activity_data=activity_data)
                imported_count += 1
            except ValueError:
                skipped_count += 1

        if len(page_payload) < per_page:
            break

    athlete.last_sync_at = datetime.now(UTC)
    athlete.updated_at = datetime.now(UTC)
    session.add(athlete)
    session.commit()
    session.refresh(athlete)

    metrics_result = recompute_metrics_for_athlete(session=session, athlete_id=athlete.id)

    return {
        "athlete_id": athlete.id,
        "fetched_count": fetched_count,
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "daily_metrics_count": metrics_result["daily_metrics_count"],
        "weekly_metrics_count": metrics_result["weekly_metrics_count"],
        "last_sync_at": athlete.last_sync_at.isoformat() if athlete.last_sync_at else None,
    }
