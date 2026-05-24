#!/usr/bin/env python3
import os
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


def write_tokens(tokenstore, token_data):
    if not token_data:
        return
    for filename in ("oauth1_token.json", "oauth2_token.json"):
        value = token_data.get(filename)
        if value:
            with open(os.path.join(tokenstore, filename), "w") as f:
                json.dump(value, f)


def read_tokens(tokenstore):
    token_data = {}
    for filename in ("oauth1_token.json", "oauth2_token.json"):
        path = os.path.join(tokenstore, filename)
        if os.path.exists(path):
            with open(path) as f:
                token_data[filename] = json.load(f)
    return token_data or None


def login(email, password, mfa_code, token_data=None):
    kwargs = {}
    signature = inspect.signature(Garmin)
    if mfa_code and "prompt_mfa" in signature.parameters:
        kwargs["prompt_mfa"] = lambda: mfa_code

    client = Garmin(email, password, **kwargs)
    with tempfile.TemporaryDirectory() as tokenstore:
        write_tokens(tokenstore, token_data)
        client.login(tokenstore)
        return client, read_tokens(tokenstore)


def main():
    payload = json.load(sys.stdin)
    print(json.dumps(run(payload)))


def run(payload):
    command = payload["command"]
    email = payload["email"]
    password = payload["password"]
    mfa_code = payload.get("mfa_code") or ""
    token_data = payload.get("token_data")
    days = int(payload.get("days") or 30)

    client, token_data = login(email, password, mfa_code, token_data)

    if command == "test":
      today = date.today().isoformat()
      stats = client.get_stats(today)
      return {
          "ok": True,
          "provider_user_id": email,
          "sample_date": today,
          "has_stats": bool(stats),
          "token_data": token_data,
      }

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
        return {"ok": True, "provider_user_id": email, "metrics": metrics, "token_data": token_data}

    raise ValueError(f"unknown command: {command}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
