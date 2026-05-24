import json
import os
from http.server import BaseHTTPRequestHandler

from scripts.garmin_sync import run


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = os.environ.get("GARMIN_BRIDGE_SECRET") or os.environ.get("INTERNAL_SECRET")
        if secret and self.headers.get("x-garmin-bridge-secret") != secret:
            self.send_response(401)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": "Unauthorized"}).encode("utf-8"))
            return

        length = int(self.headers.get("content-length") or "0")
        payload = json.loads(self.rfile.read(length) or b"{}")

        try:
            result = run(payload)
            status = 200
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
            status = 500

        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode("utf-8"))
