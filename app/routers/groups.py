from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.schemas.group import (
    GroupComparisonRead,
    GroupCreate,
    GroupMemberCreate,
    GroupMemberRead,
    GroupRead,
)
from app.services.group_service import (
    add_member_to_group,
    create_group,
    get_group_by_id,
    get_group_weekly_comparison,
    is_user_group_member,
    is_user_group_owner,
    list_group_members,
    list_groups_for_user,
    remove_member_from_group,
    touch_group_updated_at,
)


router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
def create_group_endpoint(
    payload: GroupCreate,
    session: Session = Depends(get_session),
) -> GroupRead:
    try:
        group = create_group(session=session, payload=payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return group


@router.get("", response_model=list[GroupRead])
def read_groups_for_user(
    user_id: int = Query(..., description="Utilisateur cible."),
    session: Session = Depends(get_session),
) -> list[GroupRead]:
    return list_groups_for_user(session=session, user_id=user_id)


@router.get("/{group_id}", response_model=GroupRead)
def read_group(
    group_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    session: Session = Depends(get_session),
) -> GroupRead:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Groupe introuvable.")

    if not is_user_group_member(session=session, group_id=group_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse au groupe.")

    return group


@router.get("/{group_id}/members", response_model=list[GroupMemberRead])
def read_group_members(
    group_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    session: Session = Depends(get_session),
) -> list[GroupMemberRead]:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Groupe introuvable.")

    if not is_user_group_member(session=session, group_id=group_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse au groupe.")

    return list_group_members(session=session, group_id=group_id)


@router.post("/{group_id}/members", response_model=GroupMemberRead, status_code=status.HTTP_201_CREATED)
def add_group_member_endpoint(
    group_id: int,
    payload: GroupMemberCreate,
    actor_user_id: int = Query(..., description="Owner qui ajoute un membre."),
    session: Session = Depends(get_session),
) -> GroupMemberRead:
    if payload.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_id du path et du payload differents.",
        )

    if not is_user_group_owner(session=session, group_id=group_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seul le owner peut ajouter un membre.")

    try:
        member = add_member_to_group(
            session=session,
            group_id=group_id,
            user_id=payload.user_id,
            role=payload.role,
        )
        touch_group_updated_at(session=session, group_id=group_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return member


@router.delete("/{group_id}/members/{user_id}", response_model=GroupMemberRead)
def remove_group_member_endpoint(
    group_id: int,
    user_id: int,
    actor_user_id: int = Query(..., description="Owner qui retire un membre."),
    session: Session = Depends(get_session),
) -> GroupMemberRead:
    if not is_user_group_owner(session=session, group_id=group_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seul le owner peut retirer un membre.")

    if user_id == actor_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le owner ne peut pas se retirer lui-meme du groupe.",
        )

    member = remove_member_from_group(session=session, group_id=group_id, user_id=user_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membre introuvable.")

    touch_group_updated_at(session=session, group_id=group_id)
    return member


@router.get("/{group_id}/comparison/weekly", response_model=GroupComparisonRead)
def read_group_weekly_comparison(
    group_id: int,
    actor_user_id: int = Query(..., description="Utilisateur qui consulte."),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    session: Session = Depends(get_session),
) -> GroupComparisonRead:
    group = get_group_by_id(session=session, group_id=group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Groupe introuvable.")

    if not is_user_group_member(session=session, group_id=group_id, user_id=actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acces refuse au groupe.")

    members = get_group_weekly_comparison(
        session=session,
        group_id=group_id,
        start_date=start_date,
        end_date=end_date,
    )
    return GroupComparisonRead(
        group_id=group_id,
        start_date=start_date,
        end_date=end_date,
        members=members,
    )
