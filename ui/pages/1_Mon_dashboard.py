import pandas as pd
import plotly.express as px
import streamlit as st

from ui.api_client import (
    connect_strava_url,
    dashboard_summary,
    import_strava_history,
    list_athletes,
    recompute_metrics,
    sync_recent_strava,
)
from ui.session import require_login


st.set_page_config(page_title="Mon dashboard", page_icon="📊", layout="wide")
st.title("Mon dashboard")

user = require_login()

try:
    athletes = list_athletes(user_id=user["id"])
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not athletes:
    st.warning("Aucun athlete connecte pour cet utilisateur.")
    try:
        url = connect_strava_url(user_id=user["id"])
        st.markdown(f"[Connecter Strava]({url})")
    except RuntimeError as exc:
        st.info(f"Configuration Strava incomplete: {exc}")
    st.stop()

athlete_map = {
    f"athlete_id={a['id']} ({a.get('firstname') or ''} {a.get('lastname') or ''})": a
    for a in athletes
}
selected_label = st.selectbox("Athlete", options=list(athlete_map.keys()))
selected_athlete = athlete_map[selected_label]

with st.expander("Actions de synchronisation", expanded=False):
    col_sync_1, col_sync_2, col_sync_3 = st.columns(3)

    with col_sync_1.form("sync_recent_form"):
        per_page_recent = st.number_input("Sync recent per_page", min_value=1, max_value=200, value=30, step=1)
        submit_sync_recent = st.form_submit_button("Sync recent")
    if submit_sync_recent:
        try:
            sync_result = sync_recent_strava(athlete_id=selected_athlete["id"], per_page=int(per_page_recent))
            st.success(
                f"Sync recente ok: fetched={sync_result['fetched_count']}, "
                f"imported={sync_result['imported_count']}, skipped={sync_result['skipped_count']}"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_2.form("sync_history_form"):
        per_page_history = st.number_input("History per_page", min_value=1, max_value=200, value=100, step=1)
        max_pages_history = st.number_input("History max_pages", min_value=1, max_value=100, value=10, step=1)
        submit_sync_history = st.form_submit_button("Import historique")
    if submit_sync_history:
        try:
            history_result = import_strava_history(
                athlete_id=selected_athlete["id"],
                per_page=int(per_page_history),
                max_pages=int(max_pages_history),
            )
            st.success(
                f"Import historique ok: fetched={history_result['fetched_count']}, "
                f"imported={history_result['imported_count']}, skipped={history_result['skipped_count']}"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_3.form("recompute_metrics_form"):
        start_date_filter = st.text_input("Start date (YYYY-MM-DD)", value="")
        end_date_filter = st.text_input("End date (YYYY-MM-DD)", value="")
        submit_recompute = st.form_submit_button("Recalcul metrics")
    if submit_recompute:
        try:
            recompute_result = recompute_metrics(
                athlete_id=selected_athlete["id"],
                start_date=start_date_filter.strip() or None,
                end_date=end_date_filter.strip() or None,
            )
            st.success(
                f"Recalcul termine: activities={recompute_result['activities_processed']}, "
                f"daily={recompute_result['daily_metrics_count']}, weekly={recompute_result['weekly_metrics_count']}"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

period_days = st.slider("Periode (jours)", min_value=7, max_value=365, value=30, step=1)

try:
    dashboard = dashboard_summary(
        athlete_id=selected_athlete["id"],
        period_days=period_days,
        recent_activities_limit=8,
    )
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

col1, col2, col3, col4 = st.columns(4)
col1.metric("Seances", dashboard["sessions_count"])
col2.metric("Duree (s)", dashboard["duration_sec"])
col3.metric("Distance (m)", round(dashboard["distance_m"], 1))
col4.metric("D+ (m)", round(dashboard["elevation_gain_m"], 1))

st.subheader("Repartition par sport")
sports_breakdown = dashboard.get("sports_breakdown", [])
if sports_breakdown:
    sports_df = pd.DataFrame(sports_breakdown)
    st.dataframe(sports_df, use_container_width=True)
    fig_sport = px.bar(sports_df, x="sport_type", y="distance_m", title="Distance par sport")
    st.plotly_chart(fig_sport, use_container_width=True)
else:
    st.info("Aucune donnee sport sur la periode.")

st.subheader("Metriques hebdomadaires")
weekly_metrics = dashboard.get("weekly_metrics", [])
if weekly_metrics:
    weekly_df = pd.DataFrame(weekly_metrics)
    st.dataframe(weekly_df, use_container_width=True)
    fig_week = px.line(weekly_df.sort_values("week_start_date"), x="week_start_date", y="training_load", title="Training load hebdo")
    st.plotly_chart(fig_week, use_container_width=True)
else:
    st.info("Aucune metrique hebdo disponible.")

st.subheader("Dernieres activites")
recent_activities = dashboard.get("recent_activities", [])
if recent_activities:
    activities_df = pd.DataFrame(recent_activities)
    st.dataframe(activities_df, use_container_width=True)
else:
    st.info("Aucune activite recente.")
