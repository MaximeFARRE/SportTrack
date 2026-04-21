import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import plotly.express as px
import streamlit as st

from app.db import get_db
from app.services.metrics_service import get_dashboard_summary, recompute_metrics_for_athlete
from app.services.strava_service import build_strava_authorization_url, get_athletes_for_user
from app.services.sync_service import auto_sync_strava_if_stale, import_strava_history, sync_recent_strava_activities
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000:.1f} km"


st.set_page_config(page_title="Mon dashboard", page_icon="📊", layout="wide")
st.title("Mon dashboard")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.warning("Aucun athlete connecte.")
    try:
        url = build_strava_authorization_url(state="login")
        st.link_button("Connecter Strava", url)
    except Exception as exc:
        st.error(str(exc))
    st.stop()

athlete_map = {
    (f"{a.firstname or ''} {a.lastname or ''}".strip() or f"Athlete #{a.id}"): a
    for a in athletes
}
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
selected_athlete = athlete_map[selected_label]

try:
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
    col1, col2, col3 = st.columns(3)

    with col1.form("sync_recent_form"):
        per_page_recent = st.number_input("Activites a recuperer", min_value=1, max_value=200, value=30, step=1)
        submit_recent = st.form_submit_button("Sync recent")
    if submit_recent:
        with st.spinner("Synchronisation en cours..."):
            try:
                with get_db() as session:
                    result = sync_recent_strava_activities(
                        session=session,
                        athlete_id=selected_athlete.id,
                        per_page=int(per_page_recent),
                    )
                st.success(f"Sync ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with col2.form("sync_history_form"):
        per_page_history = st.number_input("Activites par page", min_value=1, max_value=200, value=100, step=1)
        max_pages_history = st.number_input("Nombre de pages max", min_value=1, max_value=100, value=10, step=1)
        submit_history = st.form_submit_button("Import historique")
    if submit_history:
        with st.spinner("Import historique en cours (peut prendre quelques minutes)..."):
            try:
                with get_db() as session:
                    result = import_strava_history(
                        session=session,
                        athlete_id=selected_athlete.id,
                        per_page=int(per_page_history),
                        max_pages=int(max_pages_history),
                    )
                st.success(f"Import ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with col3.form("recompute_form"):
        start_date_filter = st.text_input("Date debut (YYYY-MM-DD)", value="")
        end_date_filter = st.text_input("Date fin (YYYY-MM-DD)", value="")
        submit_recompute = st.form_submit_button("Recalcul metrics")
    if submit_recompute:
        try:
            from datetime import date
            start = date.fromisoformat(start_date_filter.strip()) if start_date_filter.strip() else None
            end = date.fromisoformat(end_date_filter.strip()) if end_date_filter.strip() else None
            with get_db() as session:
                result = recompute_metrics_for_athlete(session=session, athlete_id=selected_athlete.id, start_date=start, end_date=end)
            st.success(f"Recalcul termine : {result['activities_processed']} activites, {result['weekly_metrics_count']} semaines")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

period_days = st.slider("Periode (jours)", min_value=7, max_value=365, value=30, step=1)

with get_db() as session:
    dashboard = get_dashboard_summary(session=session, athlete_id=selected_athlete.id, period_days=period_days, recent_activities_limit=8)

col1, col2, col3, col4 = st.columns(4)
col1.metric("Seances", dashboard["sessions_count"])
col2.metric("Duree", fmt_duration(dashboard["duration_sec"]))
col3.metric("Distance", fmt_km(dashboard["distance_m"]))
col4.metric("Denivele +", f"{round(dashboard['elevation_gain_m'])} m")

st.subheader("Repartition par sport")
sports_breakdown = dashboard.get("sports_breakdown", [])
if sports_breakdown:
    sports_df = pd.DataFrame(sports_breakdown)
    sports_df["distance_km"] = (sports_df["distance_m"] / 1000).round(2)
    fig = px.bar(sports_df, x="sport_type", y="distance_km", title="Distance par sport (km)",
                 labels={"distance_km": "Distance (km)", "sport_type": "Sport"})
    st.plotly_chart(fig, use_container_width=True)
else:
    st.info("Aucune donnee sport sur la periode.")

st.subheader("Metriques hebdomadaires")
weekly = dashboard.get("weekly_metrics", [])
if weekly:
    weekly_df = pd.DataFrame(weekly)
    if "week_start_date" not in weekly_df.columns:
        st.info("Metriques hebdo indisponibles (format inattendu). Lancez un recalcul des metriques.")
    else:
        weekly_df = weekly_df.sort_values("week_start_date")
        weekly_df["distance_km"] = (weekly_df["distance_m"] / 1000).round(2)
        cw1, cw2 = st.columns(2)
        cw1.plotly_chart(px.bar(weekly_df, x="week_start_date", y="distance_km", title="Distance hebdo (km)",
                                labels={"distance_km": "km", "week_start_date": "Semaine"}), use_container_width=True)
        cw2.plotly_chart(px.line(weekly_df, x="week_start_date", y="training_load", title="Training load hebdo",
                                 labels={"training_load": "Charge", "week_start_date": "Semaine"}, markers=True), use_container_width=True)
else:
    st.info("Aucune metrique hebdo. Lancez un sync.")

st.subheader("Dernieres activites")
recent = dashboard.get("recent_activities", [])
if recent:
    df = pd.DataFrame(recent)
    df["distance_km"] = (df["distance_m"] / 1000).round(2)
    df["duree"] = df["duration_sec"].apply(fmt_duration)
    df["date"] = pd.to_datetime(df["start_date"]).dt.strftime("%d/%m/%Y")
    cols = ["name", "sport_type", "date", "duree", "distance_km", "elevation_gain_m"]
    st.dataframe(df[[c for c in cols if c in df.columns]], use_container_width=True, hide_index=True)
else:
    st.info("Aucune activite recente.")
