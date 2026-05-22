from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.auth.supabase_auth import get_current_user_id, require_internal_secret
from app.services.overtraining_detection import assess_and_persist, compute_risk

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/me/latest")
def get_my_latest_risk(user_id: UUID = Depends(get_current_user_id)) -> dict:
    """Return today's risk assessment for the authenticated user.

    Computes on-the-fly (does not persist). Use POST /risk/me/assess to persist.
    """
    result = compute_risk(str(user_id))
    return result


@router.post("/me/assess", status_code=status.HTTP_201_CREATED)
def assess_me(user_id: UUID = Depends(get_current_user_id)) -> dict:
    """Trigger a risk assessment for the authenticated user and persist it."""
    result = assess_and_persist(str(user_id))
    return result


@router.post(
    "/internal/assess-all",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_internal_secret)],
)
async def assess_all_users() -> dict:
    """Trigger risk assessment for all active users (internal endpoint).

    Called by the Next.js cron route or for manual backfill. Uses the same
    logic as the APScheduler daily job.
    """
    from app.services.overtraining_detection import get_active_user_ids, notify_if_critical

    user_ids = get_active_user_ids()
    processed = 0
    errors = 0
    for user_id in user_ids:
        try:
            result = assess_and_persist(user_id)
            notify_if_critical(result)
            processed += 1
        except Exception:
            errors += 1

    return {"processed": processed, "errors": errors}
