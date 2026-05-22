"""HR zones router.

Endpoints:
  GET  /zones                                — list current user's zones (JWT auth)
  PATCH /zones/{zone_number}                 — manually override one zone (JWT auth)
  POST /zones/reset                          — recompute from FC max, clear custom flags (JWT auth)
  POST /zones/activities/{id}/compute        — compute time-in-zones for one activity (JWT auth)
  POST /internal/regenerate-zones            — called by Next.js after profile save (internal secret)
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import create_client

from app.auth.supabase_auth import get_current_user_id, require_internal_secret
from app.config import settings
from app.services.hr_zones_service import compute_zones_from_hr_max, regenerate_zones_for_user
from app.services.intensity_distribution_service import compute_time_in_zones

router = APIRouter(prefix="/zones", tags=["zones"])
internal_router = APIRouter(prefix="/internal", tags=["internal"])


def _service_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── User-facing routes ────────────────────────────────────────────────────────

@router.get("")
def list_zones(user_id: UUID = Depends(get_current_user_id)) -> list[dict]:
    client = _service_client()
    result = (
        client.table("hr_zones")
        .select("*")
        .eq("user_id", str(user_id))
        .order("zone_number")
        .execute()
    )
    return result.data


class ZonePatch(BaseModel):
    hr_min: int = Field(..., ge=0, le=250)
    hr_max: int | None = Field(default=None, ge=0, le=300)


@router.patch("/{zone_number}")
def patch_zone(
    zone_number: int,
    body: ZonePatch,
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    if zone_number not in range(1, 6):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="zone_number must be 1–5")
    client = _service_client()
    result = (
        client.table("hr_zones")
        .update({"hr_min": body.hr_min, "hr_max": body.hr_max, "is_custom": True})
        .eq("user_id", str(user_id))
        .eq("zone_number", zone_number)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return result.data[0]


@router.post("/reset")
def reset_zones(user_id: UUID = Depends(get_current_user_id)) -> dict:
    """Recompute zones from the user's stored FC max and clear custom overrides."""
    client = _service_client()
    profile = (
        client.table("athlete_profiles")
        .select("hr_max")
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not profile.data or not profile.data.get("hr_max"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="FC max not set in profile",
        )
    regenerate_zones_for_user(user_id, profile.data["hr_max"], client)
    return {"regenerated": True}


@router.post("/activities/{activity_id}/compute", status_code=status.HTTP_200_OK)
def compute_activity_zones(
    activity_id: str,
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    """Fetch Strava HR stream for the activity and compute time-in-zones.

    Returns the zones list or {"zones": null} when computation is not possible
    (non-Strava activity, missing token, or no HR stream).
    """
    try:
        zones = compute_time_in_zones(str(user_id), activity_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"activity_id": activity_id, "zones": zones}


# ── Internal route ────────────────────────────────────────────────────────────

class RegeneratePayload(BaseModel):
    user_id: str
    hr_max: int = Field(..., ge=100, le=230)


@internal_router.post("/regenerate-zones", dependencies=[Depends(require_internal_secret)])
def internal_regenerate_zones(body: RegeneratePayload) -> dict:
    """Called by Next.js after athlete profile save to recompute zones server-side."""
    try:
        uid = UUID(body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user_id") from exc
    client = _service_client()
    regenerate_zones_for_user(uid, body.hr_max, client)
    return {"regenerated": True}
