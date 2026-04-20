import pandas as pd
import streamlit as st

from ui.api_client import list_activities, list_athletes, read_activity
from ui.session import require_login


st.set_page_config(page_title="Analyse seance", page_icon="🔎", layout="wide")
st.title("Analyse de seance (V1)")

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
    f"athlete_id={a['id']} ({a.get('firstname') or ''} {a.get('lastname') or ''})": a["id"]
    for a in athletes
}
athlete_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[athlete_label]

try:
    activities = list_activities(athlete_id=athlete_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not activities:
    st.info("Aucune activite a analyser.")
    st.stop()

activity_map = {
    f"{a['id']} - {a['name']} ({a['start_date']})": a["id"]
    for a in activities[:50]
}
activity_label = st.selectbox("Seance", list(activity_map.keys()))
activity_id = activity_map[activity_label]

try:
    activity = read_activity(activity_id=activity_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

activity_df = pd.DataFrame([activity])
st.dataframe(activity_df, use_container_width=True)
