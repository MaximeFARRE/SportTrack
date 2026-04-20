import streamlit as st

from app.db import get_db
from app.schemas.goal import GoalCreate
from app.services.goal_service import archive_goal, create_goal, list_goals_for_athlete
from app.services.strava_service import get_athletes_for_user
from ui.session import require_login


st.set_page_config(page_title="Objectifs", page_icon="🎯", layout="wide")
st.title("Objectifs")

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
selected_label = st.selectbox("Athlete", list(athlete_map.keys()))
athlete_id = athlete_map[selected_label]

st.subheader("Creer un objectif")
with st.form("create_goal_form"):
    goal_name = st.text_input("Nom de l'objectif")
    goal_sport = st.text_input("Sport", value="Run")
    goal_date = st.date_input("Date cible")
    goal_distance = st.number_input("Distance cible (km)", min_value=0.0, value=10.0, step=0.5)
    goal_elevation = st.number_input("D+ cible (m)", min_value=0.0, value=0.0, step=10.0)
    goal_notes = st.text_area("Notes", height=80)
    submit_goal = st.form_submit_button("Creer")

if submit_goal:
    try:
        with get_db() as session:
            goal = create_goal(session=session, payload=GoalCreate(
                athlete_id=athlete_id,
                name=goal_name,
                sport_type=goal_sport or None,
                target_date=goal_date,
                target_distance_m=float(goal_distance) * 1000,
                target_elevation_gain_m=float(goal_elevation) or None,
                notes=goal_notes or None,
            ))
        st.success(f"Objectif cree : #{goal.id} — {goal.name}")
        st.rerun()
    except Exception as exc:
        st.error(str(exc))

include_inactive = st.checkbox("Inclure les objectifs archives", value=False)

with get_db() as session:
    goals = list_goals_for_athlete(session=session, athlete_id=athlete_id, include_inactive=include_inactive)

st.subheader("Mes objectifs")
if not goals:
    st.info("Aucun objectif.")
    st.stop()

for g in goals:
    status = "✅" if not g.is_active else "🎯"
    dist_km = f"{g.target_distance_m / 1000:.1f} km" if g.target_distance_m else "—"
    elev = f"{round(g.target_elevation_gain_m)} m" if g.target_elevation_gain_m else "—"
    date_str = g.target_date.strftime("%d/%m/%Y") if g.target_date else "—"
    st.write(f"{status} **{g.name}** ({g.sport_type or '—'}) — {dist_km} | D+ {elev} | Avant le {date_str}")

active_goals = [g for g in goals if g.is_active]
if active_goals:
    st.subheader("Archiver un objectif")
    archive_map = {f"#{g.id} — {g.name}": g for g in active_goals}
    archive_label = st.selectbox("Objectif a archiver", list(archive_map.keys()))
    if st.button("Archiver"):
        try:
            selected = archive_map[archive_label]
            with get_db() as session:
                goal_to_archive = session.get(selected.__class__, selected.id)
                archive_goal(session=session, goal=goal_to_archive)
            st.success("Objectif archive.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
