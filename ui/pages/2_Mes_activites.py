import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import streamlit as st

from app.db import get_db
from app.services.activity_service import list_activities
from app.services.strava_service import get_athletes_for_user
from app.services.sync_service import import_strava_history, sync_recent_strava_activities
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Mes activites", page_icon="🏃", layout="wide")
st.title("Mes activites")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.warning("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{a.firstname or ''} {a.lastname or ''}".strip() or f"Athlete #{a.id}"): a.id
    for a in athletes
}
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_label]

with st.expander("Synchronisation", expanded=False):
    col1, col2 = st.columns(2)

    with col1.form("sync_recent_form"):
        per_page = st.number_input("Activites a recuperer", min_value=1, max_value=200, value=30, step=1)
        submit_recent = st.form_submit_button("Sync recent")
    if submit_recent:
        with st.spinner("Synchronisation en cours..."):
            try:
                with get_db() as session:
                    result = sync_recent_strava_activities(session=session, athlete_id=athlete_id, per_page=int(per_page))
                st.success(f"Sync ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    with col2.form("sync_history_form"):
        hist_per_page = st.number_input("Activites par page", min_value=1, max_value=200, value=100, step=1)
        hist_max_pages = st.number_input("Pages max", min_value=1, max_value=100, value=10, step=1)
        submit_history = st.form_submit_button("Import historique")
    if submit_history:
        with st.spinner("Import en cours (peut prendre quelques minutes)..."):
            try:
                with get_db() as session:
                    result = import_strava_history(session=session, athlete_id=athlete_id,
                                                   per_page=int(hist_per_page), max_pages=int(hist_max_pages))
                st.success(f"Import ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

with get_db() as session:
    all_activities = list_activities(session=session, athlete_id=athlete_id)

col1, col2, col3 = st.columns(3)
available_sports = sorted({a.sport_type for a in all_activities if a.sport_type})
sport_choice = col1.selectbox("Sport", ["Tous les sports"] + available_sports)
start_date_input = col2.date_input("Date debut", value=None)
end_date_input = col3.date_input("Date fin", value=None)

activities = all_activities
if sport_choice != "Tous les sports":
    activities = [a for a in activities if a.sport_type == sport_choice]
if start_date_input:
    activities = [a for a in activities if a.start_date.date() >= start_date_input]
if end_date_input:
    activities = [a for a in activities if a.start_date.date() <= end_date_input]

st.write(f"**{len(activities)} activite(s)**")

if not activities:
    st.info("Aucune activite trouvee avec ces filtres.")
    st.stop()

rows = [
    {
        "name": a.name,
        "sport_type": a.sport_type,
        "date": a.start_date.strftime("%d/%m/%Y"),
        "duree": fmt_duration(a.duration_sec),
        "distance_km": round(a.distance_m / 1000, 2),
        "D+ (m)": round(a.elevation_gain_m),
        "FC moy": a.average_heartrate,
    }
    for a in activities
]
st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
