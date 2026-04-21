import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import streamlit as st

from app.db import get_db
from app.services.activity_service import get_activity_by_id, list_activities
from app.services.strava_service import get_athletes_for_user
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Analyse seance", page_icon="🔎", layout="wide")
st.title("Analyse de seance")

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
    activities = list_activities(session=session, athlete_id=athlete_id)

if not activities:
    st.info("Aucune activite disponible.")
    st.stop()

activity_map = {
    f"{a.start_date.strftime('%d/%m/%Y')} — {a.name} ({a.sport_type})": a.id
    for a in activities[:100]
}
activity_label = st.selectbox("Seance", list(activity_map.keys()))
activity_id = activity_map[activity_label]

with get_db() as session:
    activity = get_activity_by_id(session=session, activity_id=activity_id)

if not activity:
    st.error("Activite introuvable.")
    st.stop()

col1, col2, col3, col4 = st.columns(4)
col1.metric("Sport", activity.sport_type)
col2.metric("Duree", fmt_duration(activity.duration_sec))
col3.metric("Distance", f"{activity.distance_m / 1000:.2f} km")
col4.metric("D+", f"{round(activity.elevation_gain_m)} m")

col5, col6, col7, col8 = st.columns(4)
col5.metric("FC moy", f"{round(activity.average_heartrate)} bpm" if activity.average_heartrate else "—")
col6.metric("FC max", f"{round(activity.max_heartrate)} bpm" if activity.max_heartrate else "—")
col7.metric("Cadence moy", f"{round(activity.average_cadence)}" if activity.average_cadence else "—")
col8.metric("Puissance moy", f"{round(activity.average_power)} W" if activity.average_power else "—")

st.caption(f"Debut : {activity.start_date.strftime('%d/%m/%Y %H:%M')} — Calories : {activity.calories or '—'}")
