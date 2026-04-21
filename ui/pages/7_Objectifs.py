import json
import os
import sys
from datetime import UTC, date, datetime, timedelta
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import streamlit as st

from app.db import get_db
from app.schemas.goal import GoalCreate
from app.services.goal_service import (
    archive_goal,
    create_goal,
    get_goal_campaign_summary,
    list_goals_for_athlete,
)
from app.services.strava_service import get_athletes_for_user
from ui.session import require_login


GOAL_TYPE_LABELS = {
    "run_event": "Objectif course",
    "trail_event": "Objectif trail",
    "ride_event": "Objectif velo",
    "monthly_volume": "Objectif volume mensuel",
    "frequency_training": "Objectif frequence entrainement",
    "group_challenge": "Objectif groupe / defi commun",
}


def fmt_duration(seconds: float | int) -> str:
    total_minutes = int(round(float(seconds) / 60.0))
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours}h{minutes:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000.0:.1f} km"


def fmt_meters(meters: float) -> str:
    return f"{round(meters)} m"


def fmt_value_by_metric(metric: str, value: float) -> str:
    if metric == "distance_m":
        return fmt_km(value)
    if metric == "elevation_gain_m":
        return fmt_meters(value)
    if metric == "sessions":
        return f"{int(round(value))} seances"
    return f"{value:.1f}"


def end_of_current_month(today: date) -> date:
    next_month = today.replace(day=28) + timedelta(days=4)
    return next_month - timedelta(days=next_month.day)


def decode_goal_meta(notes: str | None) -> dict[str, Any]:
    if not notes:
        return {}
    stripped = notes.strip()
    if not stripped:
        return {}
    first_line = stripped.splitlines()[0].strip()
    if not first_line.lower().startswith("meta:"):
        return {}
    payload_raw = first_line[5:].strip()
    try:
        payload = json.loads(payload_raw)
        if isinstance(payload, dict):
            return payload
    except Exception:
        return {}
    return {}


def create_goal_form(athlete_id: int) -> None:
    st.subheader("Creer une mission")
    today = datetime.now(UTC).date()

    with st.form("create_goal_form"):
        goal_type = st.selectbox(
            "Type d'objectif",
            options=list(GOAL_TYPE_LABELS.keys()),
            format_func=lambda key: GOAL_TYPE_LABELS[key],
        )
        priority = st.selectbox("Priorite", options=["haute", "normale", "basse"], index=1)

        default_sport = "Run"
        if goal_type == "trail_event":
            default_sport = "TrailRun"
        elif goal_type == "ride_event":
            default_sport = "Ride"

        goal_name = st.text_input("Nom de mission", value=f"Mission {GOAL_TYPE_LABELS[goal_type]}")
        goal_sport = st.text_input("Sport", value=default_sport if goal_type != "frequency_training" else "")
        goal_date = st.date_input(
            "Date cible",
            value=today + timedelta(days=42),
            disabled=(goal_type == "monthly_volume"),
        )

        target_distance_km = 0.0
        target_elevation_m = 0.0
        monthly_distance_km = 0.0
        sessions_per_week = 3
        target_weeks = 6

        if goal_type in {"run_event", "trail_event", "ride_event", "group_challenge"}:
            target_distance_km = st.number_input("Distance cible (km)", min_value=0.0, value=10.0, step=0.5)
        if goal_type in {"trail_event", "group_challenge"}:
            target_elevation_m = st.number_input("D+ cible (m)", min_value=0.0, value=500.0, step=50.0)
        if goal_type == "monthly_volume":
            monthly_distance_km = st.number_input("Volume cible mensuel (km)", min_value=0.0, value=200.0, step=5.0)
            st.caption(f"La date cible sera automatiquement fixee au {end_of_current_month(today).strftime('%d/%m/%Y')}.")
        if goal_type == "frequency_training":
            sessions_per_week = st.number_input("Seances par semaine", min_value=1, max_value=14, value=4, step=1)
            target_weeks = st.number_input("Duree de la mission (semaines)", min_value=1, max_value=24, value=6, step=1)

        user_notes = st.text_area("Notes (optionnel)", height=90)
        submit = st.form_submit_button("Creer la mission")

    if not submit:
        return

    try:
        if not goal_name.strip():
            raise ValueError("Le nom de mission est obligatoire.")

        meta_payload = {
            "goal_type": goal_type,
            "priority": priority,
        }

        sport_type = goal_sport.strip() or None
        target_date = goal_date
        target_distance_m = None
        target_elevation_gain_m = None

        if goal_type in {"run_event", "trail_event", "ride_event", "group_challenge"}:
            target_distance_m = float(target_distance_km) * 1000.0 if target_distance_km > 0 else None
        if goal_type in {"trail_event", "group_challenge"}:
            target_elevation_gain_m = float(target_elevation_m) if target_elevation_m > 0 else None
        if goal_type == "monthly_volume":
            target_date = end_of_current_month(today)
            target_distance_m = float(monthly_distance_km) * 1000.0 if monthly_distance_km > 0 else None
            meta_payload["monthly_distance_m"] = float(monthly_distance_km) * 1000.0
        if goal_type == "frequency_training":
            target_date = today + timedelta(days=int(target_weeks) * 7 - 1)
            meta_payload["sessions_per_week"] = int(sessions_per_week)
            meta_payload["target_weeks"] = int(target_weeks)
            sport_type = sport_type or None

        notes_lines = [f"meta:{json.dumps(meta_payload, ensure_ascii=True)}"]
        if user_notes.strip():
            notes_lines.append(user_notes.strip())
        notes = "\n".join(notes_lines)
        if len(notes) > 1000:
            raise ValueError("Les notes/meta depassent 1000 caracteres.")

        with get_db() as session:
            goal = create_goal(
                session=session,
                payload=GoalCreate(
                    athlete_id=athlete_id,
                    name=goal_name.strip(),
                    sport_type=sport_type,
                    target_date=target_date,
                    target_distance_m=target_distance_m,
                    target_elevation_gain_m=target_elevation_gain_m,
                    notes=notes,
                ),
            )
        st.success(f"Mission creee: #{goal.id} - {goal.name}")
        st.rerun()
    except Exception as exc:
        st.error(str(exc))


def render_goal_primary_block(summary: dict[str, Any], goal_type: str) -> None:
    st.subheader("Bloc 1 - Objectif principal")
    primary = summary.get("primary", {})
    st.markdown(f"**{primary.get('name', 'Mission')}**")
    st.caption(GOAL_TYPE_LABELS.get(goal_type, goal_type))

    cols = st.columns(6)
    target_date = primary.get("target_date")
    target_date_label = target_date.strftime("%d/%m/%Y") if hasattr(target_date, "strftime") else str(target_date)
    cols[0].metric("Date cible", target_date_label)
    cols[1].metric("Jours restants", int(primary.get("days_remaining", 0)))
    cols[2].metric("Sport", primary.get("sport_type") or "Tous")
    cols[3].metric("Priorite", primary.get("priority", "normale"))
    cols[4].metric("Statut", primary.get("status", "en cours"))
    cols[5].metric("Type", GOAL_TYPE_LABELS.get(goal_type, goal_type))


def render_goal_progress_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 2 - Avancement")
    progress = summary.get("progress", {})
    time_progress = float(progress.get("time_progress_pct", 0.0))
    training_progress = float(progress.get("training_progress_pct", 0.0))

    st.write("Progression temporelle")
    st.progress(int(max(0, min(100, round(time_progress)))))
    st.caption(f"{time_progress:.1f}% du cycle ecoule")

    st.write("Progression d'entrainement")
    st.progress(int(max(0, min(100, round(training_progress)))))
    st.caption(f"{training_progress:.1f}% de la cible atteinte")

    c1, c2 = st.columns(2)
    c3, c4 = st.columns(2)
    c1.metric(
        "Seances realisees / prevues",
        f"{int(progress.get('sessions_done', 0))} / {int(progress.get('sessions_planned_elapsed', 0))}",
    )
    c2.metric(
        "Seances prevues cycle",
        int(progress.get("sessions_planned_total", 0)),
    )
    c3.metric(
        "Volume realise",
        fmt_value_by_metric(
            metric=str(progress.get("volume_unit_primary", "distance_m")),
            value=float(progress.get("volume_realized_primary", 0.0)),
        ),
    )
    c4.metric(
        "Volume cible",
        fmt_value_by_metric(
            metric=str(progress.get("volume_unit_primary", "distance_m")),
            value=float(progress.get("volume_target_primary", 0.0)),
        ),
    )


def render_goal_preparation_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 3 - Preparation actuelle")
    preparation = summary.get("preparation", {})

    c1, c2, c3 = st.columns(3)
    c4, c5, c6 = st.columns(3)

    c1.metric("Charge recente (7j)", f"{float(preparation.get('recent_load_7d', 0.0)):.1f}")
    c2.metric("Charge recente (14j)", f"{float(preparation.get('recent_load_14d', 0.0)):.1f}")
    c3.metric("Regularite 14j", f"{float(preparation.get('regularity_score_14d', 0.0)):.1f}/100")

    long_days = preparation.get("days_since_long_session")
    long_label = "n/a" if long_days is None else f"il y a {int(long_days)} j"
    c4.metric("Sortie longue recente", long_label)
    c5.metric("Seances specifiques recentes", int(preparation.get("specific_sessions_recent", 0)))
    c6.metric("Fraicheur", f"TSB {float(preparation.get('freshness_tsb', 0.0)):.1f}")

    st.caption(
        "Coherence avec l'objectif: "
        f"{preparation.get('coherence_status', 'n/a')} | "
        f"Score preparation {float(preparation.get('preparation_score', 0.0)):.1f}/100"
    )


def render_goal_checkpoints_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 4 - Checkpoints")
    checkpoints = summary.get("checkpoints", [])
    if not checkpoints:
        st.info("Aucun checkpoint defini pour cette mission.")
        return

    for item in checkpoints:
        label = f"{item.get('label', 'Checkpoint')} ({item.get('detail', '-')})"
        if item.get("is_complete"):
            st.success(f"Valide - {label}")
        else:
            st.warning(f"A faire - {label}")


def render_goal_projection_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 5 - Projection")
    projection = summary.get("projection", {})
    status = projection.get("status", "n/a")
    completion_ratio = float(projection.get("completion_ratio", 0.0))
    projected = float(projection.get("projected_value", 0.0))
    target = float(projection.get("target_value", 0.0))
    metric = str(projection.get("metric", "distance_m"))

    c1, c2, c3 = st.columns(3)
    c1.metric("Projection", fmt_value_by_metric(metric, projected))
    c2.metric("Cible", fmt_value_by_metric(metric, target))
    c3.metric("Ratio projete", f"{completion_ratio:.2f}")

    if status == "tres en avance":
        st.success("Si le rythme actuel continue: tres en avance.")
    elif status == "en bonne voie":
        st.success("Si le rythme actuel continue: en bonne voie.")
    elif status == "un peu en retard":
        st.warning("Si le rythme actuel continue: un peu en retard.")
    else:
        st.error("Si le rythme actuel continue: a risque.")


def render_goal_gamification_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 6 - Motivation / gamification")
    gamification = summary.get("gamification", {})
    st.info(gamification.get("weekly_mission", "Mission hebdo indisponible."))
    st.write(f"**{gamification.get('badge', 'Badge mission en cours')}**")

    next_actions = gamification.get("next_actions", [])
    if next_actions:
        st.write("Prochaines actions recommandees:")
        for idx, action in enumerate(next_actions, start=1):
            st.write(f"{idx}. {action}")

    friends = gamification.get("friends_comparison", [])
    if friends:
        st.write("Comparaison avec les amis qui ont aussi un objectif:")
        friends_df = pd.DataFrame(friends)
        friends_df["distance_28d_km"] = (friends_df["distance_m_28d"] / 1000.0).round(1)
        friends_df["profil"] = friends_df.apply(
            lambda row: f"{row['display_name']} (toi)" if row.get("is_current_user") else row["display_name"],
            axis=1,
        )
        st.dataframe(
            friends_df[["rank", "profil", "sessions_28d", "distance_28d_km", "load_28d"]],
            use_container_width=True,
            hide_index=True,
        )


st.set_page_config(page_title="Objectifs", page_icon="🎯", layout="wide")
st.title("Objectifs")
st.caption("Ta mission en cours: avancement, preparation, checkpoints, projection et motivation.")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.info("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{athlete.firstname or ''} {athlete.lastname or ''}".strip() or f"Athlete #{athlete.id}"): athlete.id
    for athlete in athletes
}
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_label]

create_goal_form(athlete_id=athlete_id)

include_inactive = st.checkbox("Inclure les objectifs archives", value=False)
with get_db() as session:
    goals = list_goals_for_athlete(session=session, athlete_id=athlete_id, include_inactive=include_inactive)

st.subheader("Mes missions")
if not goals:
    st.info("Aucun objectif.")
    st.stop()

goal_rows = []
for goal in goals:
    meta = decode_goal_meta(goal.notes)
    goal_type = str(meta.get("goal_type", "generic"))
    goal_rows.append(
        {
            "id": goal.id,
            "mission": goal.name,
            "type": GOAL_TYPE_LABELS.get(goal_type, goal_type),
            "sport": goal.sport_type or "Tous",
            "date_cible": goal.target_date.strftime("%d/%m/%Y") if goal.target_date else "n/a",
            "active": "oui" if goal.is_active else "non",
        }
    )
st.dataframe(pd.DataFrame(goal_rows), use_container_width=True, hide_index=True)

active_goals = [goal for goal in goals if goal.is_active]
if not active_goals:
    st.info("Aucune mission active a analyser.")
    st.stop()

goal_selector = {
    f"#{goal.id} - {goal.name}": goal.id
    for goal in active_goals
}
selected_goal_label = st.selectbox("Mission principale", list(goal_selector.keys()))
selected_goal_id = goal_selector[selected_goal_label]

with get_db() as session:
    summary = get_goal_campaign_summary(
        session=session,
        goal_id=selected_goal_id,
        actor_user_id=user["id"],
    )

render_goal_primary_block(summary=summary, goal_type=str(summary.get("goal_type", "generic")))
render_goal_progress_block(summary=summary)
render_goal_preparation_block(summary=summary)
render_goal_checkpoints_block(summary=summary)
render_goal_projection_block(summary=summary)
render_goal_gamification_block(summary=summary)

st.subheader("Archiver une mission")
archive_map = {f"#{goal.id} - {goal.name}": goal for goal in active_goals}
archive_label = st.selectbox("Mission a archiver", list(archive_map.keys()))
if st.button("Archiver la mission selectionnee"):
    try:
        selected_goal = archive_map[archive_label]
        with get_db() as session:
            goal_to_archive = session.get(selected_goal.__class__, selected_goal.id)
            archive_goal(session=session, goal=goal_to_archive)
        st.success("Mission archivee.")
        st.rerun()
    except Exception as exc:
        st.error(str(exc))
