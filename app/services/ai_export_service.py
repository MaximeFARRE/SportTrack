"""AI export service — builds a structured training summary for LLM consumption.

Assembles data from multiple Supabase tables into a single dict that can be
returned as JSON or rendered as Markdown.

Public API:
  build_export(user_id, weeks) -> dict
  to_markdown(export_data) -> str
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def _get_supabase():  # type: ignore[return]
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:
        raise RuntimeError(f"Cannot create Supabase client: {exc}") from exc


def _avg(values: list[float]) -> float | None:
    valid = [v for v in values if v is not None]
    return round(sum(valid) / len(valid), 1) if valid else None


def _strip_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


# ─── Data assemblers ──────────────────────────────────────────────────────────

def _fetch_athlete(user_id: str, client: Any) -> dict:
    result = (
        client.table("athlete_profiles")
        .select(
            "primary_sport, hr_max, vma_kmh, ftp_watts, css_pace_per_100m,"
            " birth_date, weight_kg, weekly_target_hours"
        )
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    p = result.data or {}

    age = None
    if p.get("birth_date"):
        try:
            born = date.fromisoformat(p["birth_date"])
            age = (date.today() - born).days // 365
        except ValueError:
            pass

    return _strip_none({
        "sport_principal": p.get("primary_sport"),
        "hr_max": p.get("hr_max"),
        "vma_kmh": p.get("vma_kmh"),
        "ftp_watts": p.get("ftp_watts"),
        "css_pace_per_100m": p.get("css_pace_per_100m"),
        "objectif_heures_semaine": p.get("weekly_target_hours"),
        "age": age,
        "poids_kg": p.get("weight_kg"),
    })


def _fetch_goals(user_id: str, client: Any) -> list[str]:  # noqa: ARG001
    # No separate goals table in Supabase yet; return empty list
    return []


def _fetch_forme(user_id: str, client: Any) -> dict:
    since = (date.today() - timedelta(days=28)).isoformat()
    result = (
        client.table("daily_metrics")
        .select("metric_date, training_load")
        .eq("user_id", user_id)
        .gte("metric_date", since)
        .order("metric_date")
        .execute()
    )
    rows = result.data or []
    loads = [r["training_load"] for r in rows if r.get("training_load") is not None]

    chronic = _avg(loads) or 0.0
    acute = _avg(loads[-7:] if len(loads) >= 7 else loads) or 0.0
    acwr = round(acute / chronic, 2) if chronic > 0 else 0.0
    tsb = round(chronic - acute, 1)

    prev_week_loads = [r["training_load"] for r in rows[-14:-7] if r.get("training_load") is not None]
    curr_week_loads = [r["training_load"] for r in rows[-7:] if r.get("training_load") is not None]
    tendance = None
    if prev_week_loads and curr_week_loads:
        prev_avg = sum(prev_week_loads) / len(prev_week_loads)
        curr_avg = sum(curr_week_loads) / len(curr_week_loads)
        if prev_avg > 0:
            pct = round((curr_avg - prev_avg) / prev_avg * 100)
            tendance = f"{'+' if pct >= 0 else ''}{pct}%"

    if acwr >= 1.5:
        statut = "charge_critique"
    elif acwr >= 1.3:
        statut = "charge_elevee"
    elif acwr <= 0.8:
        statut = "decharge"
    else:
        statut = "equilibre"

    result_risk = (
        client.table("risk_assessments")
        .select("score, level")
        .eq("user_id", user_id)
        .eq("assessment_date", date.today().isoformat())
        .maybe_single()
        .execute()
    )
    risk = result_risk.data

    return _strip_none({
        "ctl": round(chronic, 1) if chronic else None,
        "atl": round(acute, 1) if acute else None,
        "tsb": tsb if loads else None,
        "acwr": acwr if loads else None,
        "statut": statut if loads else None,
        "tendance_7j": tendance,
        "risque_score": risk["score"] if risk else None,
        "risque_niveau": risk["level"] if risk else None,
    })


def _fetch_recovery(user_id: str, client: Any) -> dict:
    since = (date.today() - timedelta(days=7)).isoformat()
    result = (
        client.table("daily_metrics")
        .select(
            "hrv_rmssd, resting_hr, sleep_score, body_battery_morning, training_readiness"
        )
        .eq("user_id", user_id)
        .gte("metric_date", since)
        .execute()
    )
    rows = result.data or []

    # 28-day HRV baseline
    since_28 = (date.today() - timedelta(days=28)).isoformat()
    result_28 = (
        client.table("daily_metrics")
        .select("hrv_rmssd")
        .eq("user_id", user_id)
        .gte("metric_date", since_28)
        .execute()
    )
    hrv_28 = [r["hrv_rmssd"] for r in (result_28.data or []) if r.get("hrv_rmssd") is not None]

    hrv_values = [r["hrv_rmssd"] for r in rows if r.get("hrv_rmssd") is not None]
    hrv_moy = _avg(hrv_values)
    hrv_baseline = _avg(hrv_28)
    hrv_tendance = None
    if hrv_moy is not None and hrv_baseline is not None and hrv_baseline > 0:
        diff = hrv_moy - hrv_baseline
        hrv_tendance = "basse" if diff < -8 else ("haute" if diff > 8 else "normale")

    return _strip_none({
        "hrv_moyen": hrv_moy,
        "hrv_baseline_4sem": hrv_baseline,
        "hrv_tendance": hrv_tendance,
        "fc_repos_moy": _avg([r["resting_hr"] for r in rows if r.get("resting_hr") is not None]),
        "sleep_score_moy": _avg([r["sleep_score"] for r in rows if r.get("sleep_score") is not None]),
        "body_battery_matin_moy": _avg([r["body_battery_morning"] for r in rows if r.get("body_battery_morning") is not None]),
        "training_readiness_moy": _avg([r["training_readiness"] for r in rows if r.get("training_readiness") is not None]),
    })


def _fetch_current_week(user_id: str, client: Any) -> dict:
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    result = (
        client.table("activities")
        .select("duration_sec, distance_m, elevation_gain_m, time_in_zones_json")
        .eq("user_id", user_id)
        .gte("start_date", week_start)
        .execute()
    )
    acts = result.data or []

    total_sec = sum(a["duration_sec"] or 0 for a in acts)
    total_km = sum((a["distance_m"] or 0) for a in acts) / 1000
    total_elev = sum(a["elevation_gain_m"] or 0 for a in acts)

    # Aggregate zones
    zone_totals: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    zone_total_sec = 0
    for a in acts:
        tz = a.get("time_in_zones_json")
        if isinstance(tz, list):
            for z in tz:
                if isinstance(z, dict) and z.get("zone") in zone_totals:
                    zone_totals[z["zone"]] += z.get("sec", 0)
                    zone_total_sec += z.get("sec", 0)

    zones_pct: dict[str, str] | None = None
    if zone_total_sec > 0:
        zones_pct = {
            f"Z{n}": f"{round(s / zone_total_sec * 100)}%"
            for n, s in zone_totals.items()
        }

    return _strip_none({
        "sessions": len(acts),
        "volume_km": round(total_km, 1) if total_km > 0 else None,
        "deuxieme_km": round(total_elev) if total_elev > 0 else None,
        "charge_totale": round(total_sec / 3600 * 100) if total_sec > 0 else None,
        "zones": zones_pct,
    })


def _fetch_ressenti(user_id: str, weeks: int, client: Any) -> list[dict]:
    since = (date.today() - timedelta(weeks=weeks)).isoformat()
    result = (
        client.table("activities")
        .select("start_date, rpe, feel_score, body_feeling_tags, context_tags, post_session_notes")
        .eq("user_id", user_id)
        .gte("start_date", since)
        .not_.is_("rpe", "null")
        .order("start_date", desc=True)
        .limit(20)
        .execute()
    )
    rows = result.data or []
    out = []
    for r in rows:
        tags = []
        for key in ("body_feeling_tags", "context_tags"):
            val = r.get(key)
            if isinstance(val, list):
                tags.extend(val)
        entry = _strip_none({
            "date": r["start_date"][:10],
            "rpe": r.get("rpe"),
            "feel_score": r.get("feel_score"),
            "tags": tags if tags else None,
            "notes": r.get("post_session_notes") or None,
        })
        out.append(entry)
    return out


def _fetch_alertes(user_id: str, client: Any) -> list[str]:
    from app.services.injury_service import get_injury_suggestions

    alertes: list[str] = []

    # Risk-based alerts
    result = (
        client.table("risk_assessments")
        .select("level, reasons")
        .eq("user_id", user_id)
        .eq("assessment_date", date.today().isoformat())
        .maybe_single()
        .execute()
    )
    risk = result.data
    if risk and risk.get("level") in ("high", "critical"):
        for reason in (risk.get("reasons") or [])[:3]:
            alertes.append(reason)

    # Injury suggestions from douleur_* tags
    try:
        suggestions = get_injury_suggestions(user_id)
        for s in suggestions:
            alertes.append(s["message"])
    except Exception:
        pass

    return alertes


def _fetch_injuries(user_id: str, client: Any) -> list[dict]:
    today = date.today().isoformat()
    result = (
        client.table("injuries")
        .select("body_zone, injury_type, severity, start_date, description")
        .eq("user_id", user_id)
        .or_(f"end_date.is.null,end_date.gte.{today}")
        .order("start_date", desc=True)
        .execute()
    )
    return [
        _strip_none({
            "zone": r["body_zone"].replace("_", " "),
            "type": r.get("injury_type"),
            "severite": r.get("severity"),
            "depuis": r["start_date"],
            "description": r.get("description"),
        })
        for r in (result.data or [])
    ]


def _fetch_plan(user_id: str, client: Any) -> list[dict]:
    today = date.today()
    next_monday = today + timedelta(days=(7 - today.weekday()))
    next_sunday = next_monday + timedelta(days=6)
    result = (
        client.table("planned_sessions")
        .select("planned_date, sport_type, session_type, planned_duration_min, planned_distance_km, description")
        .eq("user_id", user_id)
        .gte("planned_date", next_monday.isoformat())
        .lte("planned_date", next_sunday.isoformat())
        .order("planned_date")
        .execute()
    )
    days_fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    return [
        _strip_none({
            "jour": days_fr[date.fromisoformat(r["planned_date"]).weekday()],
            "sport": r.get("sport_type"),
            "type": r.get("session_type"),
            "duree_min": r.get("planned_duration_min"),
            "distance_km": r.get("planned_distance_km"),
            "description": r.get("description"),
        })
        for r in (result.data or [])
    ]


# ─── Public API ───────────────────────────────────────────────────────────────

def build_export(user_id: str, weeks: int = 8) -> dict[str, Any]:
    """Assemble the full AI export payload for user_id.

    The weeks parameter controls how far back ressenti_recent looks.
    """
    client = _get_supabase()

    athlete = _fetch_athlete(user_id, client)
    forme = _fetch_forme(user_id, client)
    recovery = _fetch_recovery(user_id, client)
    current_week = _fetch_current_week(user_id, client)
    ressenti = _fetch_ressenti(user_id, weeks, client)
    alertes = _fetch_alertes(user_id, client)
    injuries = _fetch_injuries(user_id, client)
    plan = _fetch_plan(user_id, client)

    payload: dict[str, Any] = {"athlete": athlete}
    if forme:
        payload["forme_actuelle"] = forme
    if recovery:
        payload["recuperation_7j"] = recovery
    if current_week:
        payload["semaine_en_cours"] = current_week
    if ressenti:
        payload["ressenti_recent"] = ressenti
    if alertes:
        payload["alertes_actives"] = alertes
    payload["blessures_actives"] = injuries
    if plan:
        payload["plan_semaine_prochaine"] = plan

    return payload


def to_markdown(data: dict[str, Any]) -> str:
    """Convert an export payload dict to a structured Markdown document."""
    lines: list[str] = ["# Bilan d'entraînement SportTrack", ""]

    # Athlete
    a = data.get("athlete", {})
    if a:
        lines += ["## Profil athlète", ""]
        if a.get("sport_principal"):
            lines.append(f"- Sport principal : **{a['sport_principal']}**")
        if a.get("age"):
            lines.append(f"- Âge : {a['age']} ans")
        if a.get("poids_kg"):
            lines.append(f"- Poids : {a['poids_kg']} kg")
        if a.get("hr_max"):
            lines.append(f"- FC max : {a['hr_max']} bpm")
        if a.get("vma_kmh"):
            lines.append(f"- VMA : {a['vma_kmh']} km/h")
        if a.get("ftp_watts"):
            lines.append(f"- FTP : {a['ftp_watts']} W")
        lines.append("")

    # Forme
    f = data.get("forme_actuelle", {})
    if f:
        lines += ["## Forme actuelle", ""]
        if f.get("ctl") is not None:
            lines.append(f"- CTL (charge chronique) : **{f['ctl']}**")
        if f.get("atl") is not None:
            lines.append(f"- ATL (charge aiguë) : **{f['atl']}**")
        if f.get("tsb") is not None:
            lines.append(f"- TSB (forme) : **{f['tsb']}**")
        if f.get("acwr") is not None:
            lines.append(f"- ACWR : **{f['acwr']}**")
        if f.get("statut"):
            lines.append(f"- Statut : {f['statut'].replace('_', ' ')}")
        if f.get("tendance_7j"):
            lines.append(f"- Tendance 7j : {f['tendance_7j']}")
        if f.get("risque_niveau"):
            lines.append(f"- Risque surentraînement : {f['risque_niveau']} ({f.get('risque_score', '?')}/10)")
        lines.append("")

    # Recovery
    r = data.get("recuperation_7j", {})
    if r:
        lines += ["## Récupération (7 derniers jours)", ""]
        if r.get("hrv_moyen") is not None:
            hrv_note = f"  *(baseline 4 sem : {r['hrv_baseline_4sem']} ms — {r.get('hrv_tendance', '?')})*" if r.get("hrv_baseline_4sem") else ""
            lines.append(f"- HRV moyen : {r['hrv_moyen']} ms{hrv_note}")
        if r.get("fc_repos_moy") is not None:
            lines.append(f"- FC repos moy : {r['fc_repos_moy']} bpm")
        if r.get("sleep_score_moy") is not None:
            lines.append(f"- Score sommeil moy : {r['sleep_score_moy']}/100")
        if r.get("body_battery_matin_moy") is not None:
            lines.append(f"- Body Battery matin moy : {r['body_battery_matin_moy']}")
        if r.get("training_readiness_moy") is not None:
            lines.append(f"- Training Readiness moy : {r['training_readiness_moy']}/100")
        lines.append("")

    # Current week
    cw = data.get("semaine_en_cours", {})
    if cw:
        lines += ["## Semaine en cours", ""]
        if cw.get("sessions") is not None:
            lines.append(f"- Séances : {cw['sessions']}")
        if cw.get("volume_km"):
            lines.append(f"- Volume : {cw['volume_km']} km")
        if cw.get("deuxieme_km"):
            lines.append(f"- Dénivelé : {cw['deuxieme_km']} m")
        if cw.get("charge_totale"):
            lines.append(f"- Charge estimée : {cw['charge_totale']} pts")
        if cw.get("zones"):
            zones_str = " · ".join(f"{k} {v}" for k, v in cw["zones"].items())
            lines.append(f"- Zones FC : {zones_str}")
        lines.append("")

    # Ressenti
    ressenti = data.get("ressenti_recent", [])
    if ressenti:
        lines += ["## Ressenti récent", ""]
        for entry in ressenti[:10]:
            parts = [f"**{entry['date']}**"]
            if entry.get("rpe") is not None:
                parts.append(f"RPE {entry['rpe']}/10")
            if entry.get("feel_score") is not None:
                parts.append(f"Feeling {entry['feel_score']}/5")
            if entry.get("tags"):
                parts.append(", ".join(entry["tags"]))
            line = " — ".join(parts)
            if entry.get("notes"):
                line += f"\n  > {entry['notes']}"
            lines.append(f"- {line}")
        lines.append("")

    # Alertes
    alertes = data.get("alertes_actives", [])
    if alertes:
        lines += ["## ⚠️ Alertes actives", ""]
        for a in alertes:
            lines.append(f"- {a}")
        lines.append("")

    # Injuries
    injuries = data.get("blessures_actives", [])
    if injuries:
        lines += ["## Blessures en cours", ""]
        for inj in injuries:
            parts = [f"**{inj['zone']}**"]
            if inj.get("type"):
                parts.append(inj["type"])
            if inj.get("severite"):
                parts.append(f"sévérité {inj['severite']}/3")
            parts.append(f"depuis {inj['depuis']}")
            lines.append(f"- {' — '.join(parts)}")
            if inj.get("description"):
                lines.append(f"  > {inj['description']}")
        lines.append("")
    else:
        lines += ["## Blessures en cours", "", "Aucune blessure active.", ""]

    # Plan
    plan = data.get("plan_semaine_prochaine", [])
    if plan:
        lines += ["## Plan semaine prochaine", ""]
        for s in plan:
            parts = [f"**{s['jour'].capitalize()}**"]
            if s.get("sport"):
                parts.append(s["sport"])
            if s.get("type"):
                parts.append(s["type"])
            if s.get("duree_min"):
                parts.append(f"{s['duree_min']} min")
            if s.get("distance_km"):
                parts.append(f"{s['distance_km']} km")
            lines.append(f"- {' — '.join(parts)}")
            if s.get("description"):
                lines.append(f"  > {s['description']}")
        lines.append("")

    return "\n".join(lines)
