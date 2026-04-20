import pandas as pd
import plotly.express as px
import streamlit as st

from ui.api_client import group_weekly_comparison, list_groups
from ui.session import require_login


st.set_page_config(page_title="Comparaison", page_icon="⚖️", layout="wide")
st.title("Comparaison groupe (hebdo)")

user = require_login()
actor_user_id = user["id"]

try:
    groups = list_groups(user_id=actor_user_id)
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

if not groups:
    st.info("Aucun groupe disponible.")
    st.stop()

group_map = {f"#{g['id']} - {g['name']}": g["id"] for g in groups}
selected_group_label = st.selectbox("Groupe", list(group_map.keys()))
group_id = group_map[selected_group_label]

col1, col2 = st.columns(2)
start_date_str = col1.text_input("Date debut (YYYY-MM-DD)", value="")
end_date_str = col2.text_input("Date fin (YYYY-MM-DD)", value="")

start_date_str = start_date_str.strip() or None
end_date_str = end_date_str.strip() or None

try:
    comparison = group_weekly_comparison(
        group_id=group_id,
        actor_user_id=actor_user_id,
        start_date=start_date_str,
        end_date=end_date_str,
    )
except RuntimeError as exc:
    st.error(str(exc))
    st.stop()

members = comparison.get("members", [])
if not members:
    st.info("Aucune donnee de comparaison.")
    st.stop()

df = pd.DataFrame(members)
st.dataframe(df, use_container_width=True)

fig = px.bar(df, x="user_id", y="training_load", title="Training load par membre")
st.plotly_chart(fig, use_container_width=True)
