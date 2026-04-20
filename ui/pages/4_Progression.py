import pandas as pd
import plotly.express as px
import streamlit as st

from ui.api_client import list_athletes, weekly_metrics
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Progression", page_icon="📈", layout="wide")
st.title("Progression")

user = require_login()

try:
    athletes = list_athletes(user_id=user["id"])
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not athletes:
    st.info("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{a.get('firstname') or ''} {a.get('lastname') or ''}".strip() or f"Athlete #{a['id']}"): a["id"]
    for a in athletes
}
athlete_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[athlete_label]

try:
    metrics = weekly_metrics(athlete_id=athlete_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not metrics:
    st.info("Aucune metrique hebdomadaire. Lancez un sync puis 'Recalcul metrics' depuis le dashboard.")
    st.stop()

df = pd.DataFrame(metrics).sort_values("week_start_date")
df["distance_km"] = (df["distance_m"] / 1000).round(2)

col1, col2 = st.columns(2)
col3, col4 = st.columns(2)

fig_distance = px.bar(
    df, x="week_start_date", y="distance_km",
    title="Distance hebdomadaire (km)",
    labels={"distance_km": "Distance (km)", "week_start_date": "Semaine"},
)
fig_sessions = px.bar(
    df, x="week_start_date", y="sessions_count",
    title="Nombre de seances par semaine",
    labels={"sessions_count": "Seances", "week_start_date": "Semaine"},
)
fig_load = px.line(
    df, x="week_start_date", y="training_load",
    title="Training load hebdomadaire",
    labels={"training_load": "Charge", "week_start_date": "Semaine"},
    markers=True,
)
fig_elevation = px.bar(
    df, x="week_start_date", y="elevation_gain_m",
    title="Denivele positif hebdomadaire (m)",
    labels={"elevation_gain_m": "D+ (m)", "week_start_date": "Semaine"},
)

col1.plotly_chart(fig_distance, use_container_width=True)
col2.plotly_chart(fig_sessions, use_container_width=True)
col3.plotly_chart(fig_load, use_container_width=True)
col4.plotly_chart(fig_elevation, use_container_width=True)

with st.expander("Donnees brutes", expanded=False):
    display_df = df[["week_start_date", "sessions_count", "distance_km", "elevation_gain_m", "training_load"]].copy()
    display_df["duree"] = df["duration_sec"].apply(fmt_duration)
    st.dataframe(display_df, use_container_width=True, hide_index=True)
