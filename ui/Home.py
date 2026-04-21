import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import streamlit as st

from ui.session import clear_current_user, ensure_auto_sync_for_current_user, get_current_user, save_current_user


st.set_page_config(page_title="SportTrack", page_icon="🏃", layout="wide")

# Gérer le retour du callback OAuth Strava : ?code=xxx
code = st.query_params.get("code")
error = st.query_params.get("error")

if error:
    st.query_params.clear()
    st.error("Connexion Strava refusee.")

elif code and not get_current_user():
    with st.spinner("Connexion Strava en cours..."):
        try:
            from app.db import get_db
            from app.services.auth_service import get_or_create_user_for_strava
            from app.services.strava_service import exchange_code_for_token, upsert_strava_athlete

            token_payload = exchange_code_for_token(code=code)
            athlete_payload = token_payload.get("athlete") or {}
            strava_athlete_id = str(athlete_payload.get("id", ""))

            with get_db() as session:
                user = get_or_create_user_for_strava(
                    session=session,
                    strava_athlete_id=strava_athlete_id,
                    firstname=athlete_payload.get("firstname"),
                    lastname=athlete_payload.get("lastname"),
                )
                upsert_strava_athlete(session=session, user_id=user.id, token_payload=token_payload)
                user_dict = {"id": user.id, "email": user.email, "display_name": user.display_name}

            save_current_user(user_dict)
            st.query_params.clear()
            st.rerun()
        except Exception as exc:
            st.query_params.clear()
            st.error(f"Erreur lors de la connexion Strava : {exc}")

st.title("SportTrack")
st.caption("Suivi d'entrainement connecte a Strava")

current_user = get_current_user()
if current_user:
    ensure_auto_sync_for_current_user()
    st.success(f"Connecte en tant que : **{current_user.get('display_name') or current_user.get('email')}**")
    if st.button("Se deconnecter"):
        clear_current_user()
        st.rerun()
    st.markdown("---")
    st.markdown(
        "Navigue via le menu a gauche :\n"
        "- **Mon dashboard** — apercu de ta periode\n"
        "- **Progression** — graphes hebdomadaires\n"
        "- **Comparaison** — comparaison entre tous les utilisateurs\n"
        "- **Objectifs** — tes objectifs de saison"
    )
else:
    st.markdown("### Connexion")
    st.write("Connecte ton compte Strava pour commencer a suivre tes entrainements.")
    try:
        from app.services.strava_service import build_strava_authorization_url
        url = build_strava_authorization_url(state="login")
        st.link_button("Se connecter avec Strava", url, type="primary")
    except Exception as exc:
        st.error(f"Erreur de configuration Strava : {exc}")
