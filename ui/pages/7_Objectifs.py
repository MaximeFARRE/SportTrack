import pandas as pd
import streamlit as st

from ui.api_client import archive_goal, create_goal, list_athletes, list_goals
from ui.session import require_login


st.set_page_config(page_title="Objectifs", page_icon="🎯", layout="wide")
st.title("Objectifs")

user = require_login()
actor_user_id = user["id"]

try:
    athletes = list_athletes(user_id=actor_user_id)
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
selected_athlete_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_athlete_label]

st.subheader("Creer un objectif")
with st.form("create_goal_form"):
    goal_name = st.text_input("Nom de l'objectif")
    goal_sport = st.text_input("Sport", value="Run")
    goal_date = st.date_input("Date cible")
    goal_distance = st.number_input("Distance cible (m)", min_value=0.0, value=10000.0, step=500.0)
    goal_elevation = st.number_input("D+ cible (m)", min_value=0.0, value=0.0, step=10.0)
    goal_notes = st.text_area("Notes", height=100)
    submit_goal = st.form_submit_button("Creer")

if submit_goal:
    try:
        created_goal = create_goal(
            actor_user_id=actor_user_id,
            athlete_id=athlete_id,
            name=goal_name,
            sport_type=goal_sport or None,
            target_date=goal_date.isoformat() if goal_date else None,
            target_distance_m=float(goal_distance),
            target_elevation_gain_m=float(goal_elevation),
            notes=goal_notes or None,
        )
        st.success(f"Objectif cree: #{created_goal['id']}")
        st.rerun()
    except RuntimeError as exc:
        st.error(str(exc))

include_inactive = st.checkbox("Inclure les objectifs archives", value=False)
try:
    goals = list_goals(
        actor_user_id=actor_user_id,
        athlete_id=athlete_id,
        include_inactive=include_inactive,
    )
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

st.subheader("Liste des objectifs")
if goals:
    goals_df = pd.DataFrame(goals)
    st.dataframe(goals_df, use_container_width=True)

    active_goals = [goal for goal in goals if goal.get("is_active")]
    if active_goals:
        archive_map = {f"#{g['id']} - {g['name']}": g for g in active_goals}
        archive_label = st.selectbox("Objectif a archiver", list(archive_map.keys()))
        if st.button("Archiver l'objectif"):
            selected_goal = archive_map[archive_label]
            try:
                archive_goal(goal_id=selected_goal["id"], actor_user_id=actor_user_id)
                st.success("Objectif archive.")
                st.rerun()
            except RuntimeError as exc:
                st.error(str(exc))
else:
    st.info("Aucun objectif.")
