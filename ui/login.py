import streamlit as st

from ui.api_client import (
    login_user,
    read_user,
    register_user,
    update_display_name,
)
from ui.session import clear_current_user, get_current_user, save_current_user


st.set_page_config(page_title="SportTrack - Login", page_icon="🔐", layout="centered")
st.title("Connexion SportTrack")

current_user = get_current_user()
if current_user:
    st.success(f"Utilisateur connecte: {current_user.get('email')}")

    with st.form("profile_form"):
        display_name = st.text_input("Display name", value=current_user.get("display_name", ""))
        submitted_profile = st.form_submit_button("Mettre a jour le profil")

    if submitted_profile:
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
    tab_register, tab_login = st.tabs(["Inscription", "Connexion"])

    with tab_register:
        with st.form("register_form"):
            reg_email = st.text_input("Email", key="reg_email")
            reg_password = st.text_input("Mot de passe", type="password", key="reg_password")
            reg_display_name = st.text_input("Display name", key="reg_display_name")
            submitted_register = st.form_submit_button("Creer un compte")

        if submitted_register:
            try:
                user = register_user(email=reg_email, password=reg_password, display_name=reg_display_name)
                save_current_user(user)
                st.success("Compte cree et session ouverte.")
                st.rerun()
            except RuntimeError as exc:
                st.error(str(exc))

    with tab_login:
        with st.form("login_form"):
            log_email = st.text_input("Email", key="log_email")
            log_password = st.text_input("Mot de passe", type="password", key="log_password")
            submitted_login = st.form_submit_button("Se connecter")

        if submitted_login:
            try:
                result = login_user(email=log_email, password=log_password)
                user = result["user"]
                fresh_user = read_user(user_id=user["id"])
                save_current_user(fresh_user)
                st.success("Connexion reussie.")
                st.rerun()
            except RuntimeError as exc:
                st.error(str(exc))
