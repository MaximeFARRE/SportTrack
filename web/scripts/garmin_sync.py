#!/usr/bin/env python3
import json
import sys
import tempfile
import inspect
from datetime import date, timedelta

from garminconnect import Garmin


def number(value):
    return value if isinstance(value, (int, float)) else None


def rounded(value):
    value = number(value)
    return round(value) if value is not None else None


def first_number(*values):
    for value in values:
        value = number(value)
        if value is not None:
            return value
    return None


def metric_from_stats(day, stats):
    return {
        "metric_date": day,
        "resting_hr": rounded(stats.get("restingHeartRate")),
        "stress_score_avg": rounded(stats.get("averageStressLevel")),
        "body_battery_morning": rounded(
            first_number(stats.get("bodyBatteryHighestValue"), stats.get("bodyBatteryMostRecentValue"))
        ),
        "body_battery_evening": rounded(
            first_number(stats.get("bodyBatteryLowestValue"), stats.get("bodyBatteryMostRecentValue"))
        ),
        "sleep_duration_min": rounded(number(stats.get("sleepingSeconds")) / 60)
        if number(stats.get("sleepingSeconds")) is not None
        else None,
    }


def login(email, password, mfa_code):
    kwargs = {}
    signature = inspect.signature(Garmin)
    if mfa_code and "prompt_mfa" in signature.parameters:
        kwargs["prompt_mfa"] = lambda: mfa_code

    client = Garmin(email, password, **kwargs)
    with tempfile.TemporaryDirectory() as tokenstore:
        client.login(tokenstore)
        return client


def main():
    payload = json.load(sys.stdin)
    command = payload["command"]
    email = payload["email"]
    password = payload["password"]
    mfa_code = payload.get("mfa_code") or ""
    days = int(payload.get("days") or 30)

    client = login(email, password, mfa_code)

    if command == "test":
      today = date.today().isoformat()
      stats = client.get_stats(today)
      print(json.dumps({"ok": True, "provider_user_id": email, "sample_date": today, "has_stats": bool(stats)}))
      return

    if command == "sync":
        metrics = []
        start = date.today() - timedelta(days=max(0, days - 1))
        for index in range(days):
            day = (start + timedelta(days=index)).isoformat()
            try:
                stats = client.get_stats(day)
            except Exception:
                continue
            if stats:
                metrics.append(metric_from_stats(day, stats))
        print(json.dumps({"ok": True, "provider_user_id": email, "metrics": metrics}))
        return

    raise ValueError(f"unknown command: {command}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
