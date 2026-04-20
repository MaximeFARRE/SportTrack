import streamlit as st

from ui.api_client import get_api_base_url, health_check
from ui.session import clear_current_user, get_current_user


st.set_page_config(page_title="SportTrack", page_icon="🏃", layout="wide")
st.title("SportTrack")
st.caption("Suivi d'entrainement multi-utilisateur (V1 locale)")

st.subheader("Etat du backend")
st.write(f"API: `{get_api_base_url()}`")
try:
    health = health_check()
    st.success(f"Backend OK: {health.get('status', 'ok')}")
except RuntimeError as exc:
    st.error(str(exc))

st.subheader("Session")
current_user = get_current_user()
if current_user:
    st.info(f"Connecte en tant que: {current_user.get('email')} (user_id={current_user.get('id')})")
    if st.button("Se deconnecter"):
        clear_current_user()
        st.rerun()
else:
    st.warning("Aucun utilisateur connecte. Va sur la page `login`.")

st.subheader("Navigation rapide")
st.markdown(
    "- `login`\n"
    "- `pages/1_Mon_dashboard`\n"
    "- `pages/2_Mes_activites`\n"
    "- `pages/5_Groupes`\n"
    "- `pages/6_Comparaison`\n"
    "- `pages/7_Objectifs`"
)
