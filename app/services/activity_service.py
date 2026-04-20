from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.activity import Activity
from app.schemas.activity import ActivityCreate


def get_activity_by_id(session: Session, activity_id: int) -> Optional[Activity]:
    return session.get(Activity, activity_id)


def create_activity(session: Session, activity_data: ActivityCreate) -> Activity:
    if activity_data.provider_activity_id:
        existing_activity = get_activity_by_provider_id(
            session=session,
            athlete_id=activity_data.athlete_id,
            provider_activity_id=activity_data.provider_activity_id,
        )
        if existing_activity:
            raise ValueError("Une activite avec ce provider_activity_id existe deja pour cet athlete.")

    activity = Activity(
        athlete_id=activity_data.athlete_id,
        provider_activity_id=activity_data.provider_activity_id,
        name=activity_data.name.strip(),
        sport_type=activity_data.sport_type.strip(),
        start_date=activity_data.start_date,
        timezone=activity_data.timezone,
        duration_sec=activity_data.duration_sec,
        moving_time_sec=activity_data.moving_time_sec,
        distance_m=activity_data.distance_m,
        elevation_gain_m=activity_data.elevation_gain_m,
        average_speed=activity_data.average_speed,
        max_speed=activity_data.max_speed,
        average_heartrate=activity_data.average_heartrate,
        max_heartrate=activity_data.max_heartrate,
        average_cadence=activity_data.average_cadence,
        average_power=activity_data.average_power,
        calories=activity_data.calories,
        raw_data_json=activity_data.raw_data_json,
        updated_at=datetime.now(UTC),
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


def get_activity_by_provider_id(
    session: Session,
    athlete_id: int,
    provider_activity_id: str,
) -> Optional[Activity]:
    statement = (
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .where(Activity.provider_activity_id == provider_activity_id)
    )
    return session.exec(statement).first()


def list_activities(
    session: Session,
    athlete_id: int | None = None,
    sport_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[Activity]:
    statement = select(Activity)

    if athlete_id is not None:
        statement = statement.where(Activity.athlete_id == athlete_id)

    if sport_type:
        statement = statement.where(Activity.sport_type == sport_type)

    if start_date:
        statement = statement.where(Activity.start_date >= start_date)

    if end_date:
        statement = statement.where(Activity.start_date <= end_date)

    statement = statement.order_by(Activity.start_date.desc())
    return list(session.exec(statement).all())
