"""Vercel Cron — daily overtraining risk assessment (runs at 06:00 UTC).

Vercel injects: Authorization: Bearer $CRON_SECRET
"""
from __future__ import annotations

import json
import os
from datetime import date
from http.server import BaseHTTPRequestHandler

from app.services.overtraining_detection import (
    assess_and_persist,
    get_active_user_ids,
    notify_if_critical,
)


def _authorized(headers) -> bool:
    expected = os.environ.get("CRON_SECRET", "")
    return headers.get("authorization") == f"Bearer {expected}"


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not _authorized(self.headers):
            self._respond(401, {"error": "unauthorized"})
            return

        today = date.today()
        errors: list[str] = []
        for user_id in get_active_user_ids():
            try:
                result = assess_and_persist(user_id, today)
                notify_if_critical(result)
            except Exception as exc:
                errors.append(f"{user_id}: {exc}")
                print(f"daily-risk: user={user_id} error={exc}", flush=True)

        body = {"ok": not errors, "errors": errors}
        self._respond(200, body)

    def _respond(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
