import streamlit as st


SESSION_USER_KEY = "sporttrack_current_user"
SESSION_AUTO_SYNC_STATE_KEY = "sporttrack_auto_sync_state_by_user_id"
SESSION_AUTO_SYNC_LAST_RESULT_KEY = "sporttrack_auto_sync_last_result"
SESSION_AUTO_SYNC_LAST_ERROR_KEY = "sporttrack_auto_sync_last_error"


def get_current_user() -> dict | None:
    return st.session_state.get(SESSION_USER_KEY)


def save_current_user(user: dict) -> None:
    st.session_state[SESSION_USER_KEY] = user


def clear_current_user() -> None:
    if SESSION_USER_KEY in st.session_state:
        del st.session_state[SESSION_USER_KEY]
    if SESSION_AUTO_SYNC_STATE_KEY in st.session_state:
        del st.session_state[SESSION_AUTO_SYNC_STATE_KEY]
    if SESSION_AUTO_SYNC_LAST_RESULT_KEY in st.session_state:
        del st.session_state[SESSION_AUTO_SYNC_LAST_RESULT_KEY]
    if SESSION_AUTO_SYNC_LAST_ERROR_KEY in st.session_state:
        del st.session_state[SESSION_AUTO_SYNC_LAST_ERROR_KEY]


def _run_auto_sync_once_per_session(user: dict) -> None:
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        return

    state_by_user = st.session_state.get(SESSION_AUTO_SYNC_STATE_KEY, {})
    if state_by_user.get(user_id):
        return

    state_by_user[user_id] = True
    st.session_state[SESSION_AUTO_SYNC_STATE_KEY] = state_by_user

    try:
        from app.db import get_db
        from app.services.sync_service import auto_sync_user_athletes_if_stale

        with get_db() as session:
            result = auto_sync_user_athletes_if_stale(session=session, user_id=int(user_id))
        st.session_state[SESSION_AUTO_SYNC_LAST_RESULT_KEY] = result
        if SESSION_AUTO_SYNC_LAST_ERROR_KEY in st.session_state:
            del st.session_state[SESSION_AUTO_SYNC_LAST_ERROR_KEY]
    except Exception as exc:
        st.session_state[SESSION_AUTO_SYNC_LAST_ERROR_KEY] = str(exc)


def ensure_auto_sync_for_current_user() -> None:
    user = get_current_user()
    if user:
        _run_auto_sync_once_per_session(user=user)


def require_login() -> dict | None:
    user = get_current_user()
    if not user:
        st.warning("Connecte-toi d'abord depuis la page Login.")
        st.stop()
    _run_auto_sync_once_per_session(user=user)
    return user
