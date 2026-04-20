import streamlit as st

from ui.session import clear_current_user, get_current_user, save_current_user


st.set_page_config(page_title="Connexion", page_icon="🔐", layout="centered")
st.title("Connexion")

current_user = get_current_user()

if current_user:
    st.success(f"Connecte en tant que : **{current_user.get('display_name') or current_user.get('email')}**")

    with st.form("profile_form"):
        display_name = st.text_input("Nom affiche", value=current_user.get("display_name", ""))
        submitted = st.form_submit_button("Mettre a jour")

    if submitted:
        try:
            from app.db import get_db
            from app.services.auth_service import update_user_display_name
            with get_db() as session:
                updated = update_user_display_name(
                    session=session,
                    user_id=current_user["id"],
                    display_name=display_name,
                )
            user_dict = {"id": updated.id, "email": updated.email, "display_name": updated.display_name}
            save_current_user(user_dict)
            st.success("Profil mis a jour.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

    if st.button("Se deconnecter"):
        clear_current_user()
        st.rerun()
else:
    st.write("Connecte ton compte Strava pour acceder a SportTrack.")
    try:
        from app.services.strava_service import build_strava_authorization_url
        url = build_strava_authorization_url(state="login")
        st.link_button("Se connecter avec Strava", url, type="primary")
    except Exception as exc:
        st.error(f"Erreur de configuration Strava : {exc}")
