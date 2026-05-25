#!/usr/bin/env python3
"""
Local Garmin Connect sync.

This runs on your machine to avoid Garmin rate-limiting shared Vercel IPs. It
pushes daily Garmin metrics directly to Supabase with the service-role key.

Usage:
  GARMIN_EMAIL=you@example.com GARMIN_PASSWORD='...' python3 scripts/garmin_local_sync.py --days 30

Optional:
  SPORTTRACK_EMAIL=app-user@example.com  # defaults to GARMIN_EMAIL
  GARMIN_MFA_CODE=123456
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

import requests
from garminconnect import Garmin


ROOT = Path(__file__).resolve().parents[1]


def load_env() -> None:
    for env_file in (ROOT / ".env.production.local", ROOT / "web/.env.local"):
        if not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing {name}")
    return value


def number(value):
    return value if isinstance(value, (int, float)) else None


def rounded(value):
    value = number(value)
    return round(value) if value is not None else None


def bounded_int(value, minimum: int, maximum: int):
    value = rounded(value)
    if value is None or value < minimum or value > maximum:
        return None
    return value


def first_number(*values):
    for value in values:
        value = number(value)
        if value is not None:
            return value
    return None


def nested_number(value, *paths):
    for path in paths:
        current = value
        for key in path:
            if isinstance(current, dict):
                current = current.get(key)
            else:
                current = None
                break
        current = number(current)
        if current is not None:
            return current
    return None


def average_series_value(value, *keys):
    series = None
    if isinstance(value, list):
        series = value
    elif isinstance(value, dict):
        for key in keys:
            candidate = value.get(key)
            if isinstance(candidate, list):
                series = candidate
                break
    if not series:
        return None

    values = []
    for item in series:
        if isinstance(item, dict):
            values.extend(number(item.get(key)) for key in keys)
        else:
            values.append(number(item))
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def max_metric_value(max_metrics):
    entries = max_metrics if isinstance(max_metrics, list) else [max_metrics]
    for entry in entries:
        value = nested_number(
            entry,
            ("generic", "vo2MaxPreciseValue"),
            ("generic", "vo2MaxValue"),
            ("vo2MaxPreciseValue",),
            ("vo2MaxValue",),
        )
        if value is not None:
            return value
    return None


def metric_from_stats(
    user_id: str,
    day: str,
    stats: dict,
    hrv: dict | None = None,
    spo2: dict | None = None,
    max_metrics: dict | None = None,
    respiration: dict | None = None,
) -> dict:
    sleeping_seconds = number(stats.get("sleepingSeconds"))
    return {
        "user_id": user_id,
        "metric_date": day,
        "resting_hr": rounded(stats.get("restingHeartRate")),
        "hrv_rmssd": first_number(
            nested_number(hrv, ("hrvSummary", "weeklyAvg"), ("hrvSummary", "lastNightAvg")),
            average_series_value(hrv, "hrvReadings", "value", "hrvValue"),
        ),
        "stress_score_avg": bounded_int(stats.get("averageStressLevel"), 0, 100),
        "spo2_avg": first_number(
            nested_number(spo2, ("avgSpO2",), ("averageSpO2",), ("avgSPO2",)),
            average_series_value(spo2, "spO2Values", "spo2Values", "value", "spo2"),
        ),
        "respiration_avg": first_number(
            nested_number(respiration, ("avgWakingRespirationValue",), ("avgRespirationValue",)),
            average_series_value(respiration, "respirationValuesArray", "respirationValues", "value"),
        ),
        "vo2max_estimated": first_number(
            max_metric_value(max_metrics),
            nested_number(max_metrics, ("generic", "vo2MaxPreciseValue")),
            nested_number(max_metrics, ("vo2MaxPreciseValue",), ("vo2MaxValue",)),
        ),
        "body_battery_morning": bounded_int(
            first_number(stats.get("bodyBatteryHighestValue"), stats.get("bodyBatteryMostRecentValue")),
            0,
            100,
        ),
        "body_battery_evening": bounded_int(
            first_number(stats.get("bodyBatteryLowestValue"), stats.get("bodyBatteryMostRecentValue")),
            0,
            100,
        ),
        "sleep_duration_min": rounded(sleeping_seconds / 60) if sleeping_seconds is not None else None,
    }


def compact(row: dict) -> dict:
    return {key: value for key, value in row.items() if value is not None}


class SupabaseRest:
    def __init__(self) -> None:
        self.url = require_env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
        self.key = require_env("SUPABASE_SERVICE_ROLE_KEY")
        self.headers = {
            "apikey": self.key,
            "authorization": f"Bearer {self.key}",
            "content-type": "application/json",
        }

    def request(self, method: str, path: str, **kwargs) -> requests.Response:
        res = requests.request(method, f"{self.url}/rest/v1/{path}", headers=self.headers, timeout=30, **kwargs)
        if not res.ok:
            raise RuntimeError(f"Supabase {method} {path} failed: {res.status_code} {res.text}")
        return res

    def find_user_id(self, email: str) -> str:
        query = urllib.parse.urlencode({"email": f"eq.{email}", "select": "id"})
        rows = self.request("GET", f"profiles?{query}").json()
        if not rows:
            raise SystemExit(f"No SportTrack profile found for {email}")
        return rows[0]["id"]

    def upsert(self, table: str, rows, on_conflict: str) -> None:
        if not rows:
            return
        headers = {**self.headers, "prefer": "resolution=merge-duplicates"}
        path = f"{table}?on_conflict={urllib.parse.quote(on_conflict)}"
        res = requests.post(f"{self.url}/rest/v1/{path}", headers=headers, json=rows, timeout=30)
        if not res.ok:
            raise RuntimeError(f"Supabase upsert {table} failed: {res.status_code} {res.text}")


def read_tokens(tokenstore: Path):
    token_data = {}
    for filename in ("oauth1_token.json", "oauth2_token.json"):
        path = tokenstore / filename
        if path.exists():
            token_data[filename] = json.loads(path.read_text())
    return token_data or None


def connect_garmin(email: str, password: str, mfa_code: str | None):
    client = Garmin(email, password)
    with tempfile.TemporaryDirectory() as tmp:
        tokenstore = Path(tmp)
        client.login(str(tokenstore))
        token_data = read_tokens(tokenstore)
        return client, token_data


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    garmin_email = require_env("GARMIN_EMAIL")
    garmin_password = require_env("GARMIN_PASSWORD")
    app_email = os.environ.get("SPORTTRACK_EMAIL") or garmin_email
    mfa_code = os.environ.get("GARMIN_MFA_CODE")

    supabase = SupabaseRest()
    user_id = supabase.find_user_id(app_email)
    print(f"SportTrack user: {app_email} ({user_id})")

    client, token_data = connect_garmin(garmin_email, garmin_password, mfa_code)
    print("Garmin connected locally")

    supabase.upsert(
        "garmin_credentials",
        [
            {
                "user_id": user_id,
                "email": garmin_email,
                "password": garmin_password,
                "token_data": token_data,
            }
        ],
        "user_id",
    )
    supabase.upsert(
        "provider_connections",
        [
            {
                "user_id": user_id,
                "provider": "garmin",
                "provider_user_id": garmin_email,
                "is_active": True,
            }
        ],
        "user_id,provider",
    )

    start = date.today() - timedelta(days=max(0, args.days - 1))
    rows = []
    for index in range(args.days):
        day = (start + timedelta(days=index)).isoformat()
        try:
            stats = client.get_stats(day)
        except Exception as exc:
            print(f"skip {day}: {exc}", file=sys.stderr)
            continue
        if stats:
            extras = {}
            for name, method in (
                ("hrv", client.get_hrv_data),
                ("spo2", client.get_spo2_data),
                ("max_metrics", client.get_max_metrics),
                ("respiration", client.get_respiration_data),
            ):
                try:
                    extras[name] = method(day)
                except Exception:
                    extras[name] = None
            rows.append(metric_from_stats(user_id, day, stats, **extras))

    supabase.upsert("daily_metrics", rows, "user_id,metric_date")
    print(f"Imported {len(rows)} Garmin daily metric row(s)")


if __name__ == "__main__":
    main()
