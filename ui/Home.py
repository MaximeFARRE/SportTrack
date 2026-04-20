import streamlit as st

from ui.api_client import connect_strava_url, get_api_base_url, health_check, read_user
from ui.session import clear_current_user, get_current_user, save_current_user


st.set_page_config(page_title="SportTrack", page_icon="🏃", layout="wide")

# Gérer le retour du callback Strava : ?strava_user_id=X
strava_user_id = st.query_params.get("strava_user_id")
if strava_user_id and not get_current_user():
    try:
        user = read_user(user_id=int(strava_user_id))
        save_current_user(user)
        st.query_params.clear()
        st.rerun()
    except (RuntimeError, ValueError):
        st.query_params.clear()

st.title("SportTrack")
st.caption("Suivi d'entrainement connecte a Strava")

current_user = get_current_user()
if current_user:
    st.success(f"Connecte en tant que : **{current_user.get('display_name') or current_user.get('email')}**")
    if st.button("Se deconnecter"):
        clear_current_user()
        st.rerun()
    st.markdown("---")
    st.markdown(
        "Navigue via le menu a gauche :\n"
        "- **Mon dashboard** — apercu de ta periode\n"
        "- **Mes activites** — liste et filtres\n"
        "- **Progression** — graphes hebdomadaires\n"
        "- **Analyse seance** — detail d'une activite\n"
        "- **Groupes / Comparaison** — challenge entre amis\n"
        "- **Objectifs** — tes objectifs de saison"
    )
else:
    st.markdown("### Connexion")
    st.write("Connecte ton compte Strava pour commencer a suivre tes entrainements.")
    try:
        url = connect_strava_url()
        st.link_button("Se connecter avec Strava", url, type="primary")
    except RuntimeError as exc:
        st.error(f"Impossible de contacter le backend : {exc}")
        st.info("Verifie que FastAPI tourne sur le port 8000.")

with st.expander("Etat du backend", expanded=False):
    st.write(f"API : `{get_api_base_url()}`")
    try:
        health = health_check()
        st.success(f"Backend OK — {health.get('status', 'ok')}")
    except RuntimeError as exc:
        st.error(str(exc))
