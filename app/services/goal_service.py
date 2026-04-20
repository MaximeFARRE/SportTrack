from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session, select

from app.models import Athlete, Goal
from app.schemas.goal import GoalCreate, GoalUpdate


def get_goal_by_id(session: Session, goal_id: int) -> Optional[Goal]:
    return session.get(Goal, goal_id)


def get_athlete_by_id(session: Session, athlete_id: int) -> Optional[Athlete]:
    return session.get(Athlete, athlete_id)


def can_user_access_athlete(session: Session, athlete_id: int, user_id: int) -> bool:
    athlete = get_athlete_by_id(session=session, athlete_id=athlete_id)
    if not athlete:
        return False
    return athlete.user_id == user_id


def can_user_access_goal(session: Session, goal_id: int, user_id: int) -> bool:
    goal = get_goal_by_id(session=session, goal_id=goal_id)
    if not goal:
        return False
    return can_user_access_athlete(session=session, athlete_id=goal.athlete_id, user_id=user_id)


def create_goal(session: Session, payload: GoalCreate) -> Goal:
    goal = Goal(
        athlete_id=payload.athlete_id,
        name=payload.name.strip(),
        sport_type=payload.sport_type,
        target_date=payload.target_date,
        target_distance_m=payload.target_distance_m,
        target_elevation_gain_m=payload.target_elevation_gain_m,
        notes=payload.notes,
        is_active=True,
        updated_at=datetime.now(UTC),
    )
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def list_goals_for_athlete(
    session: Session,
    athlete_id: int,
    include_inactive: bool = False,
) -> list[Goal]:
    statement = select(Goal).where(Goal.athlete_id == athlete_id)
    if not include_inactive:
        statement = statement.where(Goal.is_active == True)
    statement = statement.order_by(Goal.created_at.desc())
    return list(session.exec(statement).all())


def list_goals_for_user(session: Session, user_id: int, include_inactive: bool = False) -> list[Goal]:
    statement = select(Goal).join(Athlete, Goal.athlete_id == Athlete.id).where(Athlete.user_id == user_id)
    if not include_inactive:
        statement = statement.where(Goal.is_active == True)
    statement = statement.order_by(Goal.created_at.desc())
    return list(session.exec(statement).all())


def update_goal(session: Session, goal: Goal, payload: GoalUpdate) -> Goal:
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(goal, field_name, value)

    if "name" in updates and goal.name is not None:
        goal.name = goal.name.strip()

    goal.updated_at = datetime.now(UTC)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal


def archive_goal(session: Session, goal: Goal) -> Goal:
    goal.is_active = False
    goal.updated_at = datetime.now(UTC)
    session.add(goal)
    session.commit()
    session.refresh(goal)
    return goal
