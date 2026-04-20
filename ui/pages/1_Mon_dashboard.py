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


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000:.1f} km"


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
        url = connect_strava_url()
        st.markdown(f"[Connecter Strava]({url})")
    except RuntimeError as exc:
        st.info(f"Configuration Strava incomplete: {exc}")
    st.stop()

athlete_map = {
    (f"{a.get('firstname') or ''} {a.get('lastname') or ''}".strip() or f"Athlete #{a['id']}"): a
    for a in athletes
}
selected_label = st.selectbox("Athlete", options=list(athlete_map.keys()))
selected_athlete = athlete_map[selected_label]

with st.expander("Actions de synchronisation", expanded=False):
    col_sync_1, col_sync_2, col_sync_3 = st.columns(3)

    with col_sync_1.form("sync_recent_form"):
        per_page_recent = st.number_input("Activites a recuperer", min_value=1, max_value=200, value=30, step=1)
        submit_sync_recent = st.form_submit_button("Sync recent")
    if submit_sync_recent:
        try:
            with st.spinner("Synchronisation en cours..."):
                sync_result = sync_recent_strava(athlete_id=selected_athlete["id"], per_page=int(per_page_recent))
                recompute_metrics(athlete_id=selected_athlete["id"])
            st.success(
                f"Sync ok : {sync_result['imported_count']} importees, {sync_result['skipped_count']} deja presentes"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_2.form("sync_history_form"):
        per_page_history = st.number_input("Activites par page", min_value=1, max_value=200, value=100, step=1)
        max_pages_history = st.number_input("Nombre de pages max", min_value=1, max_value=100, value=10, step=1)
        submit_sync_history = st.form_submit_button("Import historique")
    if submit_sync_history:
        try:
            with st.spinner("Import historique en cours (peut prendre quelques minutes)..."):
                history_result = import_strava_history(
                    athlete_id=selected_athlete["id"],
                    per_page=int(per_page_history),
                    max_pages=int(max_pages_history),
                )
                recompute_metrics(athlete_id=selected_athlete["id"])
            st.success(
                f"Import ok : {history_result['imported_count']} importees, {history_result['skipped_count']} deja presentes"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_3.form("recompute_metrics_form"):
        start_date_filter = st.text_input("Date debut (YYYY-MM-DD)", value="")
        end_date_filter = st.text_input("Date fin (YYYY-MM-DD)", value="")
        submit_recompute = st.form_submit_button("Recalcul metrics")
    if submit_recompute:
        try:
            recompute_result = recompute_metrics(
                athlete_id=selected_athlete["id"],
                start_date=start_date_filter.strip() or None,
                end_date=end_date_filter.strip() or None,
            )
            st.success(
                f"Recalcul termine : {recompute_result['activities_processed']} activites, "
                f"{recompute_result['daily_metrics_count']} jours, {recompute_result['weekly_metrics_count']} semaines"
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
col2.metric("Duree", fmt_duration(dashboard["duration_sec"]))
col3.metric("Distance", fmt_km(dashboard["distance_m"]))
col4.metric("Denivele +", f"{round(dashboard['elevation_gain_m'])} m")

st.subheader("Repartition par sport")
sports_breakdown = dashboard.get("sports_breakdown", [])
if sports_breakdown:
    sports_df = pd.DataFrame(sports_breakdown)
    sports_df["distance_km"] = (sports_df["distance_m"] / 1000).round(2)
    fig_sport = px.bar(
        sports_df, x="sport_type", y="distance_km",
        title="Distance par sport (km)",
        labels={"distance_km": "Distance (km)", "sport_type": "Sport"},
    )
    st.plotly_chart(fig_sport, use_container_width=True)
else:
    st.info("Aucune donnee sport sur la periode.")

st.subheader("Metriques hebdomadaires")
weekly_metrics = dashboard.get("weekly_metrics", [])
if weekly_metrics:
    weekly_df = pd.DataFrame(weekly_metrics).sort_values("week_start_date")
    weekly_df["distance_km"] = (weekly_df["distance_m"] / 1000).round(2)
    col_w1, col_w2 = st.columns(2)
    fig_dist = px.bar(
        weekly_df, x="week_start_date", y="distance_km",
        title="Distance hebdo (km)",
        labels={"distance_km": "Distance (km)", "week_start_date": "Semaine"},
    )
    fig_load = px.line(
        weekly_df, x="week_start_date", y="training_load",
        title="Training load hebdo",
        labels={"training_load": "Charge", "week_start_date": "Semaine"},
    )
    col_w1.plotly_chart(fig_dist, use_container_width=True)
    col_w2.plotly_chart(fig_load, use_container_width=True)
else:
    st.info("Aucune metrique hebdo. Lancez un sync puis 'Recalcul metrics'.")

st.subheader("Dernieres activites")
recent_activities = dashboard.get("recent_activities", [])
if recent_activities:
    recent_df = pd.DataFrame(recent_activities)
    recent_df["distance_km"] = (recent_df["distance_m"] / 1000).round(2)
    recent_df["duree"] = recent_df["duration_sec"].apply(fmt_duration)
    recent_df["date"] = pd.to_datetime(recent_df["start_date"]).dt.strftime("%d/%m/%Y")
    cols = ["name", "sport_type", "date", "duree", "distance_km", "elevation_gain_m"]
    cols_present = [c for c in cols if c in recent_df.columns]
    st.dataframe(recent_df[cols_present], use_container_width=True, hide_index=True)
else:
    st.info("Aucune activite recente.")
