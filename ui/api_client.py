import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def get_api_base_url() -> str:
    return os.getenv("SPORTTRACK_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _build_url(path: str, params: dict[str, Any] | None = None) -> str:
    base = get_api_base_url()
    full_path = path if path.startswith("/") else f"/{path}"
    url = f"{base}{full_path}"
    if params:
        clean_params = {key: value for key, value in params.items() if value is not None}
        if clean_params:
            url = f"{url}?{urlencode(clean_params)}"
    return url


def request_json(
    method: str,
    path: str,
    params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
    timeout: int = 20,
) -> Any:
    url = _build_url(path=path, params=params)
    body = None
    headers = {"Accept": "application/json"}

    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")

    request = Request(url=url, data=body, headers=headers, method=method.upper())

    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except HTTPError as exc:
        try:
            error_payload = json.loads(exc.read().decode("utf-8"))
            detail = error_payload.get("detail", f"HTTP {exc.code}")
        except Exception:
            detail = f"HTTP {exc.code}"
        raise RuntimeError(detail) from exc
    except URLError as exc:
        raise RuntimeError("Backend injoignable. Verifie que FastAPI tourne sur le port 8000.") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Reponse JSON invalide depuis le backend.") from exc


def health_check() -> dict[str, Any]:
    return request_json("GET", "/health")


def register_user(email: str, password: str, display_name: str) -> dict[str, Any]:
    return request_json(
        "POST",
        "/auth/register",
        payload={"email": email, "password": password, "display_name": display_name},
    )


def login_user(email: str, password: str) -> dict[str, Any]:
    return request_json("POST", "/auth/login", payload={"email": email, "password": password})


def read_user(user_id: int) -> dict[str, Any]:
    return request_json("GET", f"/users/{user_id}")


def update_display_name(user_id: int, display_name: str) -> dict[str, Any]:
    return request_json("PATCH", f"/users/{user_id}/display-name", payload={"display_name": display_name})


def list_athletes(user_id: int) -> list[dict[str, Any]]:
    return request_json("GET", "/athletes", params={"user_id": user_id})


def connect_strava_url() -> str:
    payload = request_json("GET", "/athletes/connect-strava")
    return payload["authorization_url"]


def list_activities(
    athlete_id: int | None = None,
    sport_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, Any]]:
    return request_json(
        "GET",
        "/activities",
        params={
            "athlete_id": athlete_id,
            "sport_type": sport_type,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def read_activity(activity_id: int) -> dict[str, Any]:
    return request_json("GET", f"/activities/{activity_id}")


def dashboard_summary(
    athlete_id: int,
    period_days: int = 30,
    recent_activities_limit: int = 5,
    sport_type: str | None = None,
) -> dict[str, Any]:
    return request_json(
        "GET",
        f"/metrics/dashboard/athletes/{athlete_id}",
        params={
            "period_days": period_days,
            "recent_activities_limit": recent_activities_limit,
            "sport_type": sport_type,
        },
    )


def weekly_metrics(athlete_id: int, start_date: str | None = None, end_date: str | None = None) -> list[dict[str, Any]]:
    return request_json(
        "GET",
        "/metrics/weekly",
        params={"athlete_id": athlete_id, "start_date": start_date, "end_date": end_date},
    )


def weekly_comparison_all_users(
    actor_user_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    return request_json(
        "GET",
        "/metrics/comparison/weekly",
        params={
            "actor_user_id": actor_user_id,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def sync_recent_strava(athlete_id: int, per_page: int = 30) -> dict[str, Any]:
    return request_json(
        "POST",
        f"/sync/athletes/{athlete_id}/strava",
        params={"per_page": per_page},
    )


def import_strava_history(athlete_id: int, per_page: int = 100, max_pages: int = 10) -> dict[str, Any]:
    return request_json(
        "POST",
        f"/sync/athletes/{athlete_id}/strava/history",
        params={"per_page": per_page, "max_pages": max_pages},
        timeout=180,
    )


def recompute_metrics(athlete_id: int, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    return request_json(
        "POST",
        f"/metrics/athletes/{athlete_id}/recompute",
        params={"start_date": start_date, "end_date": end_date},
    )


def create_group(name: str, description: str | None, owner_user_id: int) -> dict[str, Any]:
    return request_json(
        "POST",
        "/groups",
        payload={"name": name, "description": description, "owner_user_id": owner_user_id},
    )


def list_groups(user_id: int) -> list[dict[str, Any]]:
    return request_json("GET", "/groups", params={"user_id": user_id})


def list_group_members(group_id: int, actor_user_id: int) -> list[dict[str, Any]]:
    return request_json("GET", f"/groups/{group_id}/members", params={"actor_user_id": actor_user_id})


def add_group_member(group_id: int, user_id: int, actor_user_id: int, role: str = "member") -> dict[str, Any]:
    return request_json(
        "POST",
        f"/groups/{group_id}/members",
        params={"actor_user_id": actor_user_id},
        payload={"group_id": group_id, "user_id": user_id, "role": role},
    )


def remove_group_member(group_id: int, user_id: int, actor_user_id: int) -> dict[str, Any]:
    return request_json(
        "DELETE",
        f"/groups/{group_id}/members/{user_id}",
        params={"actor_user_id": actor_user_id},
    )


def group_weekly_comparison(
    group_id: int,
    actor_user_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    return request_json(
        "GET",
        f"/groups/{group_id}/comparison/weekly",
        params={
            "actor_user_id": actor_user_id,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def list_goals(actor_user_id: int, athlete_id: int | None = None, include_inactive: bool = False) -> list[dict[str, Any]]:
    return request_json(
        "GET",
        "/goals",
        params={"actor_user_id": actor_user_id, "athlete_id": athlete_id, "include_inactive": str(include_inactive).lower()},
    )


def create_goal(
    actor_user_id: int,
    athlete_id: int,
    name: str,
    sport_type: str | None = None,
    target_date: str | None = None,
    target_distance_m: float | None = None,
    target_elevation_gain_m: float | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    return request_json(
        "POST",
        "/goals",
        params={"actor_user_id": actor_user_id},
        payload={
            "athlete_id": athlete_id,
            "name": name,
            "sport_type": sport_type,
            "target_date": target_date,
            "target_distance_m": target_distance_m,
            "target_elevation_gain_m": target_elevation_gain_m,
            "notes": notes,
        },
    )


def archive_goal(goal_id: int, actor_user_id: int) -> dict[str, Any]:
    return request_json("POST", f"/goals/{goal_id}/archive", params={"actor_user_id": actor_user_id})
