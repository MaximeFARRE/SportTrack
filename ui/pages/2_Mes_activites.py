import pandas as pd
import streamlit as st

from ui.api_client import import_strava_history, list_activities, list_athletes, sync_recent_strava
from ui.session import require_login


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
    f"athlete_id={a['id']} ({a.get('firstname') or ''} {a.get('lastname') or ''})": a["id"]
    for a in athletes
}
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_label]

with st.expander("Synchronisation", expanded=False):
    col_sync_1, col_sync_2 = st.columns(2)

    with col_sync_1.form("activities_sync_recent_form"):
        recent_per_page = st.number_input("Sync recent per_page", min_value=1, max_value=200, value=30, step=1)
        submit_recent = st.form_submit_button("Sync recent")
    if submit_recent:
        try:
            result = sync_recent_strava(athlete_id=athlete_id, per_page=int(recent_per_page))
            st.success(
                f"Sync recente ok: fetched={result['fetched_count']}, "
                f"imported={result['imported_count']}, skipped={result['skipped_count']}"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    with col_sync_2.form("activities_sync_history_form"):
        history_per_page = st.number_input("History per_page", min_value=1, max_value=200, value=100, step=1)
        history_max_pages = st.number_input("History max_pages", min_value=1, max_value=100, value=10, step=1)
        submit_history = st.form_submit_button("Import historique")
    if submit_history:
        try:
            result = import_strava_history(
                athlete_id=athlete_id,
                per_page=int(history_per_page),
                max_pages=int(history_max_pages),
            )
            st.success(
                f"Import historique ok: fetched={result['fetched_count']}, "
                f"imported={result['imported_count']}, skipped={result['skipped_count']}"
            )
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

col1, col2, col3 = st.columns(3)
sport_type = col1.text_input("Sport (ex: Run)")
start_date_str = col2.text_input("Date debut (YYYY-MM-DD)", value="")
end_date_str = col3.text_input("Date fin (YYYY-MM-DD)", value="")

start_date_str = start_date_str.strip() or None
end_date_str = end_date_str.strip() or None
sport_filter = sport_type.strip() or None

try:
    activities = list_activities(
        athlete_id=athlete_id,
        sport_type=sport_filter,
        start_date=start_date_str,
        end_date=end_date_str,
    )
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not activities:
    st.info("Aucune activite trouvee avec ces filtres.")
    st.stop()

activities_df = pd.DataFrame(activities)
st.dataframe(activities_df, use_container_width=True)
