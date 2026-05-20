"""GET /me — minimal endpoint to verify Supabase JWT validation."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.auth.supabase_auth import get_current_user_id


router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def read_me(user_id: UUID = Depends(get_current_user_id)) -> dict:
    return {"user_id": str(user_id)}
