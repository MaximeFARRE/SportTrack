from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from app.auth.supabase_auth import get_current_user_id
from app.services.ai_export_service import build_export, to_markdown

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/ai-summary")
def get_ai_summary(
    weeks: int = Query(default=8, ge=1, le=52, description="Période en semaines"),
    format: str = Query(default="json", pattern="^(json|markdown)$"),
    user_id: UUID = Depends(get_current_user_id),
) -> dict | PlainTextResponse:
    """Return a structured training summary for LLM consumption.

    format=json   → JSON dict ready to paste into a prompt
    format=markdown → human-readable Markdown document
    """
    data = build_export(str(user_id), weeks=weeks)
    if format == "markdown":
        return PlainTextResponse(content=to_markdown(data), media_type="text/markdown")
    return data
