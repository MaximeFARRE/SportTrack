import pandas as pd
import plotly.express as px
import streamlit as st

from ui.api_client import weekly_comparison_all_users
from ui.session import require_login


st.set_page_config(page_title="Comparaison", page_icon="⚖️", layout="wide")
st.title("Comparaison globale (hebdo)")

user = require_login()
actor_user_id = user["id"]

col1, col2 = st.columns(2)
start_date_str = col1.text_input("Date debut (YYYY-MM-DD)", value="")
end_date_str = col2.text_input("Date fin (YYYY-MM-DD)", value="")

start_date_str = start_date_str.strip() or None
end_date_str = end_date_str.strip() or None

try:
    comparison = weekly_comparison_all_users(
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

fig = px.bar(
    df,
    x="display_name",
    y="training_load",
    hover_data=["user_id", "distance_m", "sessions_count", "athlete_count"],
    title="Training load par utilisateur",
    labels={"display_name": "Utilisateur", "training_load": "Charge"},
)
st.plotly_chart(fig, use_container_width=True)
