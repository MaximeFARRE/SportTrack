import streamlit as st

from ui.api_client import connect_strava_url, update_display_name
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
            updated = update_display_name(user_id=current_user["id"], display_name=display_name)
            save_current_user(updated)
            st.success("Profil mis a jour.")
            st.rerun()
        except RuntimeError as exc:
            st.error(str(exc))

    if st.button("Se deconnecter"):
        clear_current_user()
        st.rerun()
else:
    st.write("Connecte ton compte Strava pour acceder a SportTrack.")
    try:
        url = connect_strava_url()
        st.link_button("Se connecter avec Strava", url, type="primary")
    except RuntimeError as exc:
        st.error(f"Backend injoignable : {exc}")
