import os
import sys
from datetime import date
import inspect
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from app.db import get_db
from app.services.metrics_service import get_dashboard_summary, recompute_metrics_for_athlete
from app.services.strava_service import build_strava_authorization_url, get_athletes_for_user
from ui.session import require_login

SYNC_IMPORT_ERROR: Exception | None = None
try:
    from app.services.sync_service import auto_sync_strava_if_stale, import_strava_history, sync_recent_strava_activities
except Exception as exc:
    auto_sync_strava_if_stale = None
    import_strava_history = None
    sync_recent_strava_activities = None
    SYNC_IMPORT_ERROR = exc


PERIOD_OPTIONS = {
    "7j": 7,
    "30j": 30,
    "12 semaines": 84,
}


def fmt_duration(seconds: int) -> str:
    hours, minutes = divmod(int(seconds) // 60, 60)
    return f"{hours}h{minutes:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000.0:.1f} km"


def fmt_load(value: float) -> str:
    return f"{value:.1f}"


def fetch_dashboard_summary(
    session: Any,
    athlete_id: int,
    period_days: int,
    recent_activities_limit: int,
    sport_type: str | None,
) -> dict[str, Any]:
    requested_kwargs = {
        "session": session,
        "athlete_id": athlete_id,
        "period_days": period_days,
        "recent_activities_limit": recent_activities_limit,
        "sport_type": sport_type,
    }
    accepted_params = set(inspect.signature(get_dashboard_summary).parameters.keys())
    call_kwargs = {key: value for key, value in requested_kwargs.items() if key in accepted_params}
    return get_dashboard_summary(**call_kwargs)


def render_quick_snapshot(snapshot: dict[str, Any]) -> None:
    st.subheader("Bloc 1 - Resume rapide (7 jours)")
    cols = st.columns(6)
    cols[0].metric("Seances", int(snapshot.get("sessions_count", 0)))
    cols[1].metric("Duree", fmt_duration(int(snapshot.get("duration_sec", 0))))
    cols[2].metric("Distance", fmt_km(float(snapshot.get("distance_m", 0.0))))
    cols[3].metric("D+", f"{round(float(snapshot.get('elevation_gain_m', 0.0)))} m")
    cols[4].metric("Charge", fmt_load(float(snapshot.get("training_load", 0.0))))
    cols[5].metric("Regularite", f"{round(float(snapshot.get('consistency_score', 0.0)))} / 100")


def render_fitness_state(fitness_state: dict[str, Any]) -> None:
    st.subheader("Bloc 2 - Etat de forme")
    cols = st.columns(5)
    cols[0].metric("CTL (fitness)", fmt_load(float(fitness_state.get("ctl", 0.0))))
    cols[1].metric("ATL (fatigue)", fmt_load(float(fitness_state.get("atl", 0.0))))
    cols[2].metric("TSB (forme)", fmt_load(float(fitness_state.get("tsb", 0.0))))
    acwr = fitness_state.get("acwr")
    cols[3].metric("ACWR", "n/a" if acwr is None else f"{float(acwr):.2f}")
    cols[4].metric("Statut", str(fitness_state.get("status", "n/a")))

    delta = fitness_state.get("load_change_vs_previous_week_pct")
    if delta is not None:
        st.caption(f"Variation charge vs semaine precedente: {round(float(delta) * 100)}%")


def render_main_timeline(load_timeline: list[dict[str, Any]]) -> None:
    st.subheader("Bloc 3 - Graphique principal")
    if not load_timeline:
        st.info("Aucune donnee de charge pour afficher la courbe.")
        return

    timeline_df = pd.DataFrame(load_timeline).sort_values("metric_date")
    timeline_df["metric_date"] = pd.to_datetime(timeline_df["metric_date"])

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            x=timeline_df["metric_date"],
            y=timeline_df["daily_load"],
            name="Charge quotidienne",
            marker_color="#8ecae6",
            opacity=0.45,
        )
    )
    fig.add_trace(
        go.Scatter(
            x=timeline_df["metric_date"],
            y=timeline_df["ctl"],
            mode="lines",
            name="CTL",
            line={"width": 2.3, "color": "#1d3557"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=timeline_df["metric_date"],
            y=timeline_df["atl"],
            mode="lines",
            name="ATL",
            line={"width": 2.0, "color": "#e76f51"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=timeline_df["metric_date"],
            y=timeline_df["tsb"],
            mode="lines",
            name="TSB",
            line={"width": 1.8, "dash": "dot", "color": "#2a9d8f"},
            yaxis="y2",
        )
    )
    fig.update_layout(
        title="Charge quotidienne, CTL, ATL, TSB",
        xaxis_title="Date",
        yaxis={"title": "Charge"},
        yaxis2={"title": "TSB", "overlaying": "y", "side": "right"},
        legend={"orientation": "h", "yanchor": "bottom", "y": 1.02, "x": 0},
        margin={"l": 10, "r": 10, "t": 45, "b": 10},
    )
    st.plotly_chart(fig, use_container_width=True)


def render_sport_breakdown(sports_breakdown: list[dict[str, Any]]) -> None:
    st.subheader("Bloc 4 - Repartition de l'entrainement")
    if not sports_breakdown:
        st.info("Aucune activite sur la periode selectionnee.")
        return

    sport_df = pd.DataFrame(sports_breakdown)
    sport_df["distance_km"] = (sport_df["distance_m"] / 1000.0).round(2)
    sport_df["duration_h"] = (sport_df["duration_sec"] / 3600.0).round(2)
    sport_df["training_load"] = sport_df["training_load"].round(2)

    left, right = st.columns(2)
    left.plotly_chart(
        px.pie(
            sport_df,
            names="sport_type",
            values="duration_h",
            title="Temps par sport (h)",
        ),
        use_container_width=True,
    )
    right.plotly_chart(
        px.bar(
            sport_df,
            x="sport_type",
            y="sessions_count",
            title="Seances par sport",
            labels={"sport_type": "Sport", "sessions_count": "Seances"},
        ),
        use_container_width=True,
    )

    st.dataframe(
        sport_df[
            [
                "sport_type",
                "sessions_count",
                "duration_h",
                "distance_km",
                "elevation_gain_m",
                "training_load",
            ]
        ],
        use_container_width=True,
        hide_index=True,
    )


def render_recent_trends(weekly_trends: list[dict[str, Any]], trend_summary: dict[str, Any]) -> None:
    st.subheader("Bloc 5 - Tendances recentes")
    if not weekly_trends:
        st.info("Pas assez de donnees pour afficher les tendances.")
        return

    trend_rows: list[dict[str, Any]] = []
    for item in weekly_trends:
        if isinstance(item, dict):
            trend_rows.append(item)
        elif hasattr(item, "model_dump"):
            trend_rows.append(item.model_dump())
        else:
            row = {}
            for key in ["week_start_date", "duration_sec", "distance_m", "elevation_gain_m", "sessions_count"]:
                if hasattr(item, key):
                    row[key] = getattr(item, key)
            if row:
                trend_rows.append(row)

    if not trend_rows:
        st.info("Donnees tendances indisponibles (format non supporte).")
        return

    range_label = st.radio("Fenetre tendances", options=["4 semaines", "8 semaines"], horizontal=True)
    keep_weeks = 4 if range_label == "4 semaines" else 8
    trend_df = pd.DataFrame(trend_rows).tail(keep_weeks)

    required_columns = {"week_start_date", "duration_sec", "distance_m", "elevation_gain_m", "sessions_count"}
    if not required_columns.issubset(set(trend_df.columns)):
        st.info("Donnees tendances incompletes. Lance un recalcul des metriques.")
        return

    trend_df = trend_df.dropna(subset=["week_start_date"])
    if trend_df.empty:
        st.info("Aucune semaine exploitable pour les tendances.")
        return

    trend_df["distance_km"] = (trend_df["distance_m"] / 1000.0).round(2)
    trend_df["duration_h"] = (trend_df["duration_sec"] / 3600.0).round(2)
    trend_df["week_start_date"] = pd.to_datetime(trend_df["week_start_date"])

    c1, c2 = st.columns(2)
    c3, c4 = st.columns(2)

    c1.plotly_chart(
        px.bar(
            trend_df,
            x="week_start_date",
            y="duration_h",
            title="Duree hebdo (h)",
            labels={"week_start_date": "Semaine", "duration_h": "Heures"},
        ),
        use_container_width=True,
    )
    c2.plotly_chart(
        px.bar(
            trend_df,
            x="week_start_date",
            y="distance_km",
            title="Distance hebdo (km)",
            labels={"week_start_date": "Semaine", "distance_km": "km"},
        ),
        use_container_width=True,
    )
    c3.plotly_chart(
        px.line(
            trend_df,
            x="week_start_date",
            y="elevation_gain_m",
            title="D+ hebdo (m)",
            labels={"week_start_date": "Semaine", "elevation_gain_m": "D+ (m)"},
            markers=True,
        ),
        use_container_width=True,
    )
    c4.plotly_chart(
        px.line(
            trend_df,
            x="week_start_date",
            y="sessions_count",
            title="Nombre de seances",
            labels={"week_start_date": "Semaine", "sessions_count": "Seances"},
            markers=True,
        ),
        use_container_width=True,
    )

    biggest_week = trend_summary.get("biggest_week")
    if biggest_week:
        st.caption(
            "Plus grosse semaine recente: "
            f"{biggest_week['week_start_date']} | "
            f"Charge {biggest_week['training_load']:.1f} | "
            f"Distance {biggest_week['distance_m'] / 1000.0:.1f} km"
        )


def render_alerts(alerts: list[dict[str, str]]) -> None:
    st.subheader("Bloc 6 - Alertes utiles")
    if not alerts:
        st.success("Aucune alerte critique sur la periode.")
        return

    for alert in alerts:
        severity = alert.get("severity", "info")
        message = alert.get("message", "Alerte")
        if severity == "critical":
            st.error(message)
        elif severity == "warning":
            st.warning(message)
        else:
            st.info(message)


def render_gamification(gamification: dict[str, Any]) -> None:
    st.subheader("Bloc 7 - Gamification rapide")
    xp = gamification.get("xp", {})
    cols = st.columns([1, 1, 2, 2])
    cols[0].metric("Streak jours", f"{int(gamification.get('streak_days', 0))} j")
    cols[1].metric("Streak semaines", f"{int(gamification.get('streak_weeks_target', 0))} sem")
    cols[2].markdown(f"**{gamification.get('recent_badge', 'Badge: n/a')}**")
    cols[3].markdown(f"**Defi prioritaire: {gamification.get('weekly_challenge', 'n/a')}**")

    if xp:
        st.caption(
            f"Niveau {int(xp.get('level', 1))} | "
            f"XP {float(xp.get('xp_total', 0.0)):.1f} | "
            f"Progression niveau {float(xp.get('progress_in_level_pct', 0.0)):.1f}%"
        )

    weekly_challenges = gamification.get("weekly_challenges", [])
    if weekly_challenges:
        st.write("Defis hebdo:")
        for challenge in weekly_challenges:
            prefix = "[OK]" if challenge.get("is_complete") else "[ ]"
            st.write(
                f"{prefix} {challenge.get('label', 'Defi')} "
                f"({challenge.get('current', 0)}/{challenge.get('target', 0)} {challenge.get('unit', '')})"
            )

    badges = gamification.get("badges", [])
    if badges:
        st.write("Badges recents:")
        for badge in badges[:4]:
            st.write(f"- {badge.get('title', 'Badge')}: {badge.get('description', '')}")

    leaderboard = gamification.get("mini_leaderboard", [])
    if not leaderboard:
        st.info("Classement groupe indisponible.")
    else:
        leaderboard_df = pd.DataFrame(leaderboard)
        leaderboard_df["distance_km"] = (leaderboard_df["distance_m"] / 1000.0).round(1)
        leaderboard_df["training_load"] = leaderboard_df["training_load"].round(1)
        leaderboard_df["joueur"] = leaderboard_df.apply(
            lambda row: f"{row['display_name']} (toi)" if row.get("is_current_user") else row["display_name"],
            axis=1,
        )
        st.dataframe(
            leaderboard_df[["rank", "joueur", "sessions_count", "training_load", "distance_km"]],
            use_container_width=True,
            hide_index=True,
        )

    feed = gamification.get("activity_feed", [])
    if feed:
        st.write("Feed d'activite:")
        for event in feed:
            st.write(f"- {event.get('message', '')}")


def render_recent_activities(recent_activities: list[dict[str, Any]]) -> None:
    st.subheader("Activites recentes")
    if not recent_activities:
        st.info("Aucune activite recente.")
        return

    recent_df = pd.DataFrame(recent_activities)
    recent_df["distance_km"] = (recent_df["distance_m"] / 1000.0).round(2)
    recent_df["duree"] = recent_df["duration_sec"].apply(fmt_duration)
    recent_df["date"] = pd.to_datetime(recent_df["start_date"]).dt.strftime("%d/%m/%Y")
    st.dataframe(
        recent_df[["name", "sport_type", "date", "duree", "distance_km", "elevation_gain_m"]],
        use_container_width=True,
        hide_index=True,
    )


st.set_page_config(page_title="Dashboard", page_icon="📊", layout="wide")
st.title("Dashboard")
st.caption("Etat actuel, charge recente, dynamique, alertes et motivation en un ecran.")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.warning("Aucun athlete connecte.")
    try:
        st.link_button("Connecter Strava", build_strava_authorization_url(state="dashboard"))
    except Exception as exc:
        st.error(str(exc))
    st.stop()

athlete_map = {
    (f"{athlete.firstname or ''} {athlete.lastname or ''}".strip() or f"Athlete #{athlete.id}"): athlete
    for athlete in athletes
}

controls_left, controls_mid, controls_right = st.columns([2, 1, 1])
selected_athlete_label = controls_left.selectbox("Athlete", options=list(athlete_map.keys()))
selected_period_label = controls_mid.selectbox("Periode", options=list(PERIOD_OPTIONS.keys()), index=1)
period_days = PERIOD_OPTIONS[selected_period_label]
selected_athlete = athlete_map[selected_athlete_label]

try:
    if callable(auto_sync_strava_if_stale):
        with get_db() as session:
            auto_sync_result = auto_sync_strava_if_stale(session=session, athlete_id=selected_athlete.id)
        if auto_sync_result:
            st.info(
                "Auto-sync execute: "
                f"{auto_sync_result['imported_count']} importees, {auto_sync_result['skipped_count']} deja presentes."
            )
except Exception as exc:
    st.warning(f"Auto-sync indisponible: {exc}")

with st.expander("Synchronisation", expanded=False):
    if SYNC_IMPORT_ERROR:
        st.warning(f"Sync Strava indisponible dans cet environnement: {SYNC_IMPORT_ERROR}")

    col1, col2, col3 = st.columns(3)

    with col1.form("sync_recent_form"):
        per_page_recent = st.number_input("Activites a recuperer", min_value=1, max_value=200, value=30, step=1)
        sync_recent_available = callable(sync_recent_strava_activities)
        submit_recent = st.form_submit_button("Sync recent")
    if submit_recent:
        if not sync_recent_available:
            st.error("Sync recent indisponible: fonction non chargee.")
            st.stop()
        with st.spinner("Synchronisation en cours..."):
            try:
                with get_db() as session:
                    result = sync_recent_strava_activities(
                        session=session,
                        athlete_id=selected_athlete.id,
                        per_page=int(per_page_recent),
                    )
                st.success(f"Sync ok: {result['imported_count']} importees, {result['skipped_count']} deja presentes.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with col2.form("sync_history_form"):
        per_page_history = st.number_input("Activites par page", min_value=1, max_value=200, value=100, step=1)
        max_pages_history = st.number_input("Nombre de pages max", min_value=1, max_value=100, value=10, step=1)
        sync_history_available = callable(import_strava_history)
        submit_history = st.form_submit_button("Import historique")
    if submit_history:
        if not sync_history_available:
            st.error("Import historique indisponible: fonction non chargee.")
            st.stop()
        with st.spinner("Import historique en cours (peut prendre quelques minutes)..."):
            try:
                with get_db() as session:
                    result = import_strava_history(
                        session=session,
                        athlete_id=selected_athlete.id,
                        per_page=int(per_page_history),
                        max_pages=int(max_pages_history),
                    )
                st.success(
                    f"Import ok: {result['imported_count']} importees, {result['skipped_count']} deja presentes."
                )
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with col3.form("recompute_form"):
        start_date_filter = st.text_input("Date debut (YYYY-MM-DD)", value="")
        end_date_filter = st.text_input("Date fin (YYYY-MM-DD)", value="")
        submit_recompute = st.form_submit_button("Recalcul metrics")
    if submit_recompute:
        try:
            start = date.fromisoformat(start_date_filter.strip()) if start_date_filter.strip() else None
            end = date.fromisoformat(end_date_filter.strip()) if end_date_filter.strip() else None
            with get_db() as session:
                result = recompute_metrics_for_athlete(
                    session=session,
                    athlete_id=selected_athlete.id,
                    start_date=start,
                    end_date=end,
                )
            st.success(
                "Recalcul termine: "
                f"{result['activities_processed']} activites, {result['weekly_metrics_count']} semaines."
            )
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

with get_db() as session:
    dashboard_all_sports = fetch_dashboard_summary(
        session=session,
        athlete_id=selected_athlete.id,
        period_days=period_days,
        recent_activities_limit=8,
        sport_type=None,
    )

sport_options = ["Tous sports"] + sorted(
    [item["sport_type"] for item in dashboard_all_sports.get("sports_breakdown", [])]
)
selected_sport_label = controls_right.selectbox("Sport", options=sport_options, index=0)

dashboard = dashboard_all_sports
if selected_sport_label != "Tous sports":
    with get_db() as session:
        dashboard = fetch_dashboard_summary(
            session=session,
            athlete_id=selected_athlete.id,
            period_days=period_days,
            recent_activities_limit=8,
            sport_type=selected_sport_label,
        )

render_quick_snapshot(dashboard.get("snapshot_7d", {}))
render_fitness_state(dashboard.get("fitness_state", {}))
render_main_timeline(dashboard.get("load_timeline", []))
render_sport_breakdown(dashboard.get("sports_breakdown", []))
render_recent_trends(
    weekly_trends=dashboard.get("weekly_trends", []) or dashboard.get("weekly_metrics", []),
    trend_summary=dashboard.get("trend_summary", {}),
)
render_alerts(dashboard.get("alerts", []))
render_gamification(dashboard.get("gamification", {}))
render_recent_activities(dashboard.get("recent_activities", []))
