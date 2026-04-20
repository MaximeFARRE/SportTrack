import pandas as pd
import streamlit as st

from ui.api_client import import_strava_history, list_activities, list_athletes, sync_recent_strava
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Mes activites", page_icon="🏃", layout="wide")
st.title("Mes activites")

user = require_login()

try:
    athletes = list_athletes(user_id=user["id"])
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not athletes:
    st.warning("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{a.get('firstname') or ''} {a.get('lastname') or ''}".strip() or f"Athlete #{a['id']}"): a["id"]
    for a in athletes
}
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_label]

with st.expander("Synchronisation", expanded=False):
    col_sync_1, col_sync_2 = st.columns(2)

    with col_sync_1.form("activities_sync_recent_form"):
        recent_per_page = st.number_input("Activites a recuperer", min_value=1, max_value=200, value=30, step=1)
        submit_recent = st.form_submit_button("Sync recent")
    if submit_recent:
        try:
            with st.spinner("Synchronisation en cours..."):
                result = sync_recent_strava(athlete_id=athlete_id, per_page=int(recent_per_page))
            st.success(f"Sync ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_2.form("activities_sync_history_form"):
        history_per_page = st.number_input("Activites par page", min_value=1, max_value=200, value=100, step=1)
        history_max_pages = st.number_input("Nombre de pages max", min_value=1, max_value=100, value=10, step=1)
        submit_history = st.form_submit_button("Import historique")
    if submit_history:
        try:
            with st.spinner("Import en cours (peut prendre quelques minutes)..."):
                result = import_strava_history(
                    athlete_id=athlete_id,
                    per_page=int(history_per_page),
                    max_pages=int(history_max_pages),
                )
            st.success(f"Import ok : {result['imported_count']} importees, {result['skipped_count']} deja presentes")
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

try:
    all_activities = list_activities(athlete_id=athlete_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

col1, col2, col3 = st.columns(3)

available_sports = sorted({a["sport_type"] for a in all_activities if a.get("sport_type")})
sport_options = ["Tous les sports"] + available_sports
sport_choice = col1.selectbox("Sport", sport_options)

start_date_input = col2.date_input("Date debut", value=None)
end_date_input = col3.date_input("Date fin", value=None)

sport_filter = None if sport_choice == "Tous les sports" else sport_choice
start_str = start_date_input.isoformat() if start_date_input else None
end_str = end_date_input.isoformat() if end_date_input else None

activities = all_activities
if sport_filter:
    activities = [a for a in activities if a.get("sport_type") == sport_filter]
if start_str:
    activities = [a for a in activities if (a.get("start_date") or "") >= start_str]
if end_str:
    activities = [a for a in activities if (a.get("start_date") or "") <= end_str + "Z"]

st.write(f"**{len(activities)} activite(s)**")

if not activities:
    st.info("Aucune activite trouvee avec ces filtres.")
    st.stop()

df = pd.DataFrame(activities)
df["distance_km"] = (df["distance_m"] / 1000).round(2)
df["duree"] = df["duration_sec"].apply(fmt_duration)
df["date"] = pd.to_datetime(df["start_date"]).dt.strftime("%d/%m/%Y")

cols = ["name", "sport_type", "date", "duree", "distance_km", "elevation_gain_m", "average_heartrate"]
cols_present = [c for c in cols if c in df.columns]
st.dataframe(df[cols_present], use_container_width=True, hide_index=True)
