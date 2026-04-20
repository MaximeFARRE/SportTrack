import pandas as pd
import plotly.express as px
import streamlit as st

from ui.api_client import list_athletes, weekly_metrics
from ui.session import require_login


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
    f"athlete_id={a['id']} ({a.get('firstname') or ''} {a.get('lastname') or ''})": a["id"]
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
    st.info("Aucune metrique hebdomadaire.")
    st.stop()

df = pd.DataFrame(metrics).sort_values("week_start_date")
st.dataframe(df, use_container_width=True)

fig_distance = px.line(df, x="week_start_date", y="distance_m", title="Distance hebdomadaire")
fig_load = px.line(df, x="week_start_date", y="training_load", title="Training load hebdomadaire")

col1, col2 = st.columns(2)
col1.plotly_chart(fig_distance, use_container_width=True)
col2.plotly_chart(fig_load, use_container_width=True)
