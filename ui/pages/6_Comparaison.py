import pandas as pd
import plotly.express as px
import streamlit as st

from app.db import get_db
from app.services.group_service import get_all_users_weekly_comparison
from ui.session import require_login


def fmt_duration(seconds: int) -> str:
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h{m:02d}"


st.set_page_config(page_title="Comparaison", page_icon="⚖️", layout="wide")
st.title("Comparaison globale")

require_login()

col1, col2 = st.columns(2)
start_date_input = col1.date_input("Date debut", value=None)
end_date_input = col2.date_input("Date fin", value=None)

with get_db() as session:
    rows = get_all_users_weekly_comparison(
        session=session,
        start_date=start_date_input or None,
        end_date=end_date_input or None,
    )

if not rows:
    st.info("Aucune donnee de comparaison.")
    st.stop()

df = pd.DataFrame(rows)
df["distance_km"] = (df["distance_m"] / 1000).round(2)
df["duree"] = df["duration_sec"].apply(fmt_duration)

col1, col2 = st.columns(2)
col1.plotly_chart(
    px.bar(df, x="display_name", y="distance_km", title="Distance totale (km)",
           labels={"display_name": "Utilisateur", "distance_km": "km"}),
    use_container_width=True,
)
col2.plotly_chart(
    px.bar(df, x="display_name", y="sessions_count", title="Nombre de seances",
           labels={"display_name": "Utilisateur", "sessions_count": "Seances"}),
    use_container_width=True,
)

with st.expander("Donnees brutes", expanded=False):
    st.dataframe(
        df[["display_name", "sessions_count", "distance_km", "elevation_gain_m", "training_load", "duree"]],
        use_container_width=True,
        hide_index=True,
    )
