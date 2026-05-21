"""Terra API router.

User-facing:
  GET /terra/widget-session — return a Terra widget URL (JWT auth)

Internal (called by Next.js server-side):
  POST /internal/terra/process-webhook — handle auth/daily/sleep events
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from supabase import create_client

from app.auth.supabase_auth import get_current_user_id, require_internal_secret
from app.config import settings
from app.services.terra_service import (
    generate_widget_session,
    normalize_daily,
    normalize_sleep,
    resolve_user_id,
    upsert_terra_connection,
)

router = APIRouter(prefix="/terra", tags=["terra"])
internal_router = APIRouter(prefix="/internal", tags=["internal"])


def _service_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── User-facing endpoints ─────────────────────────────────────────────────────

@router.get("/widget-session")
def get_widget_session(
    redirect_url: str = Query(..., description="URL to redirect after Terra auth"),
    user_id: UUID = Depends(get_current_user_id),
) -> dict:
    """Return a Terra widget URL so the user can connect their device provider."""
    try:
        widget_url = generate_widget_session(user_id, redirect_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"widget_url": widget_url}


# ── Internal endpoints ────────────────────────────────────────────────────────

class TerraWebhookPayload(BaseModel):
    type: str
    status: str | None = None
    user: dict[str, Any] | None = None
    data: list[dict[str, Any]] | None = None
    # Present on auth webhooks
    reference_id: str | None = None


@internal_router.post("/terra/process-webhook", dependencies=[Depends(require_internal_secret)])
def process_terra_webhook(body: TerraWebhookPayload) -> dict:
    """Process a Terra webhook event (signature already verified by Next.js)."""
    event_type = body.type
    terra_user = body.user or {}
    terra_user_id: str = terra_user.get("user_id", "")

    if not terra_user_id:
        return {"skipped": True, "reason": "missing terra user_id"}

    client = _service_client()

    if event_type == "auth":
        return _handle_auth(client, body, terra_user_id)
    elif event_type == "daily":
        return _handle_daily(client, terra_user_id, body.data or [])
    elif event_type == "sleep":
        return _handle_sleep(client, terra_user_id, body.data or [])
    else:
        return {"skipped": True, "reason": f"unhandled event type: {event_type}"}


def _handle_auth(client: Any, body: TerraWebhookPayload, terra_user_id: str) -> dict:
    """Link Terra user to Supabase user via reference_id set at widget creation."""
    reference_id = body.reference_id or (body.user or {}).get("reference_id", "")
    if not reference_id:
        return {"skipped": True, "reason": "auth webhook missing reference_id"}

    try:
        user_id = UUID(reference_id)
    except ValueError:
        return {"skipped": True, "reason": "invalid reference_id UUID"}

    terra_user = body.user or {}
    provider_name = (terra_user.get("provider") or "terra").lower()
    upsert_terra_connection(client, user_id, terra_user_id, provider_name)
    return {"connected": True, "user_id": str(user_id), "terra_user_id": terra_user_id}


def _handle_daily(client: Any, terra_user_id: str, data: list[dict[str, Any]]) -> dict:
    """Upsert daily metrics from Terra daily payload entries."""
    user_id = resolve_user_id(client, terra_user_id)
    if not user_id:
        return {"skipped": True, "reason": "terra user not linked"}

    upserted = 0
    for entry in data:
        row = normalize_daily(entry)
        metric_date = row.pop("metric_date", None)
        if not metric_date:
            continue

        # Only upsert non-null fields to avoid overwriting other providers' data
        update_fields = {k: v for k, v in row.items() if v is not None}
        if not update_fields:
            continue

        client.table("daily_metrics").upsert(
            {"user_id": str(user_id), "metric_date": metric_date, "updated_at": datetime.now(UTC).isoformat(), **update_fields},
            on_conflict="user_id,metric_date",
        ).execute()
        upserted += 1

    return {"upserted": upserted}


def _handle_sleep(client: Any, terra_user_id: str, data: list[dict[str, Any]]) -> dict:
    """Upsert sleep metrics from Terra sleep payload entries."""
    user_id = resolve_user_id(client, terra_user_id)
    if not user_id:
        return {"skipped": True, "reason": "terra user not linked"}

    upserted = 0
    for entry in data:
        row = normalize_sleep(entry)
        metric_date = row.pop("metric_date", None)
        if not metric_date:
            continue

        update_fields = {k: v for k, v in row.items() if v is not None}
        if not update_fields:
            continue

        client.table("daily_metrics").upsert(
            {"user_id": str(user_id), "metric_date": metric_date, "updated_at": datetime.now(UTC).isoformat(), **update_fields},
            on_conflict="user_id,metric_date",
        ).execute()
        upserted += 1

    return {"upserted": upserted}
