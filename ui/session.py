import streamlit as st


SESSION_USER_KEY = "sporttrack_current_user"


def get_current_user() -> dict | None:
    return st.session_state.get(SESSION_USER_KEY)


def save_current_user(user: dict) -> None:
    st.session_state[SESSION_USER_KEY] = user


def clear_current_user() -> None:
    if SESSION_USER_KEY in st.session_state:
        del st.session_state[SESSION_USER_KEY]


def require_login() -> dict | None:
    user = get_current_user()
    if not user:
        st.warning("Connecte-toi d'abord depuis la page Login.")
        st.stop()
    return user
