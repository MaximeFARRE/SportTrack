import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import plotly.express as px
import streamlit as st

from app.db import get_db
from app.services.metrics_service import list_weekly_metrics
from app.services.strava_service import get_athletes_for_user
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Progression", page_icon="📈", layout="wide")
st.title("Progression")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.info("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{a.firstname or ''} {a.lastname or ''}".strip() or f"Athlete #{a.id}"): a.id
    for a in athletes
}
athlete_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[athlete_label]

with get_db() as session:
    metrics = list_weekly_metrics(session=session, athlete_id=athlete_id)

if not metrics:
    st.info("Aucune metrique hebdomadaire. Lancez un sync depuis le dashboard.")
    st.stop()

df = pd.DataFrame([{
    "week_start_date": m.week_start_date,
    "distance_km": round(m.distance_m / 1000, 2),
    "sessions_count": m.sessions_count,
    "training_load": m.training_load,
    "elevation_gain_m": m.elevation_gain_m,
    "duration_sec": m.duration_sec,
} for m in metrics]).sort_values("week_start_date")

col1, col2 = st.columns(2)
col3, col4 = st.columns(2)

col1.plotly_chart(px.bar(df, x="week_start_date", y="distance_km", title="Distance hebdo (km)",
                         labels={"distance_km": "km", "week_start_date": "Semaine"}), use_container_width=True)
col2.plotly_chart(px.bar(df, x="week_start_date", y="sessions_count", title="Seances par semaine",
                         labels={"sessions_count": "Seances", "week_start_date": "Semaine"}), use_container_width=True)
col3.plotly_chart(px.line(df, x="week_start_date", y="training_load", title="Training load hebdo",
                          labels={"training_load": "Charge", "week_start_date": "Semaine"}, markers=True), use_container_width=True)
col4.plotly_chart(px.bar(df, x="week_start_date", y="elevation_gain_m", title="D+ hebdo (m)",
                         labels={"elevation_gain_m": "D+ (m)", "week_start_date": "Semaine"}), use_container_width=True)

with st.expander("Donnees brutes", expanded=False):
    df["duree"] = df["duration_sec"].apply(fmt_duration)
    st.dataframe(df[["week_start_date", "sessions_count", "distance_km", "elevation_gain_m", "training_load", "duree"]],
                 use_container_width=True, hide_index=True)
