"""Vercel Cron — daily injury suggestion scan (runs at 06:15 UTC).

Vercel injects: Authorization: Bearer $CRON_SECRET
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler

from app.services.injury_service import (
    get_active_user_ids,
    get_injury_suggestions,
)


def _authorized(headers) -> bool:
    expected = os.environ.get("CRON_SECRET", "")
    return headers.get("authorization") == f"Bearer {expected}"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not _authorized(self.headers):
            self._respond(401, {"error": "unauthorized"})
            return

        errors: list[str] = []
        for user_id in get_active_user_ids():
            try:
                suggestions = get_injury_suggestions(user_id)
                for s in suggestions:
                    print(
                        f"daily-injury: user={user_id} zone={s['body_zone']} "
                        f"count={s['activity_count']} msg={s['message']}",
                        flush=True,
                    )
            except Exception as exc:
                errors.append(f"{user_id}: {exc}")
                print(f"daily-injury: user={user_id} error={exc}", flush=True)

        body = {"ok": not errors, "errors": errors}
        self._respond(200, body)

    def _respond(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
