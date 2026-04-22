import os
import sys
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from app.db import get_db
from app.services.group_service import get_social_comparison_dashboard
from ui.session import require_login


PERIOD_OPTIONS = {
    "7j": 7,
    "30j": 30,
    "12 semaines": 84,
}


def fmt_duration(seconds: float | int) -> str:
    total_minutes = int(round(float(seconds) / 60.0))
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours}h{minutes:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000.0:.1f} km"


def render_overview_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 1 - Vue d'ensemble groupe")
    overview = summary.get("overview", {})
    cols = st.columns(6)
    cols[0].metric("Seances groupe", int(overview.get("sessions_count", 0)))
    cols[1].metric("Temps total", fmt_duration(float(overview.get("duration_sec", 0.0))))
    cols[2].metric("Distance totale", fmt_km(float(overview.get("distance_m", 0.0))))
    cols[3].metric("D+ total", f"{round(float(overview.get('elevation_gain_m', 0.0)))} m")
    cols[4].metric("Streak moyen", f"{float(overview.get('average_streak_days', 0.0)):.1f} j")
    cols[5].metric("Defi actuel", "En cours")
    st.info(overview.get("current_challenge", "Aucun defi actif."))


def render_leaderboards_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 2 - Classements multiples")
    leaderboards = summary.get("leaderboards", [])
    if not leaderboards:
        st.info("Classements indisponibles.")
        return

    columns = st.columns(2)
    for index, leaderboard in enumerate(leaderboards):
        podium = leaderboard.get("podium", [])
        if not podium:
            continue
        df = pd.DataFrame(podium)
        df["participant"] = df.apply(
            lambda row: f"{row['display_name']} (toi)" if row.get("is_current_user") else row["display_name"],
            axis=1,
        )
        with columns[index % 2]:
            st.markdown(f"**{leaderboard.get('label', 'Classement')}**")
            st.dataframe(
                df[["rank", "participant", "value"]],
                use_container_width=True,
                hide_index=True,
            )


def render_visual_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 3 - Comparaison visuelle")
    viz = summary.get("visualizations", {})

    weekly = viz.get("weekly_by_user", [])
    load_4w = viz.get("load_4w_by_user", [])
    radar_rows = viz.get("radar_by_user", [])
    cumulative = viz.get("monthly_cumulative", [])
    heatmap = viz.get("heatmap", [])

    if weekly:
        weekly_df = pd.DataFrame(weekly)
        weekly_df["week_start_date"] = pd.to_datetime(weekly_df["week_start_date"])
        weekly_df["duration_h"] = (weekly_df["duration_sec"] / 3600.0).round(2)
        st.plotly_chart(
            px.bar(
                weekly_df,
                x="week_start_date",
                y="duration_h",
                color="display_name",
                barmode="group",
                title="Volume hebdo par personne (heures)",
                labels={"week_start_date": "Semaine", "duration_h": "Heures"},
            ),
            use_container_width=True,
        )

    if load_4w:
        load_df = pd.DataFrame(load_4w).sort_values("load_4w", ascending=False)
        st.plotly_chart(
            px.bar(
                load_df,
                x="display_name",
                y="load_4w",
                color="display_name",
                title="Charge 4 semaines",
                labels={"display_name": "Membre", "load_4w": "Charge"},
            ),
            use_container_width=True,
        )

    if radar_rows:
        radar_df = pd.DataFrame(radar_rows).sort_values("group_score", ascending=False).head(6)
        radar_metrics = ["volume_norm", "regularity_norm", "progression_norm", "streak_norm", "group_score"]
        fig = go.Figure()
        for _, row in radar_df.iterrows():
            fig.add_trace(
                go.Scatterpolar(
                    r=[row[m] for m in radar_metrics],
                    theta=["Volume", "Regularite", "Progression", "Streak", "Score"],
                    fill="toself",
                    name=row["display_name"],
                )
            )
        fig.update_layout(
            title="Radar multi-metriques",
            polar={"radialaxis": {"visible": True, "range": [0, 100]}},
            showlegend=True,
        )
        st.plotly_chart(fig, use_container_width=True)

    if cumulative:
        cumulative_df = pd.DataFrame(cumulative)
        cumulative_df["date"] = pd.to_datetime(cumulative_df["date"])
        cumulative_df["cum_distance_km"] = (cumulative_df["cum_distance_m"] / 1000.0).round(2)
        st.plotly_chart(
            px.line(
                cumulative_df,
                x="date",
                y="cum_distance_km",
                color="display_name",
                title="Courbes cumulees du mois (distance)",
                labels={"date": "Date", "cum_distance_km": "km"},
            ),
            use_container_width=True,
        )

    if heatmap:
        heatmap_df = pd.DataFrame(heatmap)
        heatmap_df["date"] = pd.to_datetime(heatmap_df["date"])
        st.plotly_chart(
            px.density_heatmap(
                heatmap_df,
                x="date",
                y="display_name",
                z="active_minutes",
                histfunc="avg",
                title="Heatmap des jours d'activite",
                labels={"date": "Jour", "display_name": "Membre", "active_minutes": "Minutes"},
                color_continuous_scale="YlOrRd",
            ),
            use_container_width=True,
        )


def render_challenges_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 4 - Defis / missions entre amis")
    challenges = summary.get("challenges", [])
    if not challenges:
        st.info("Aucun defi actif.")
        return

    for challenge in challenges:
        title = challenge.get("title", "Defi")
        current_value = float(challenge.get("current_value", 0.0))
        target_value = float(challenge.get("target_value", 0.0))
        unit = challenge.get("unit", "")
        progress_pct = challenge.get("progress_pct")
        leader = challenge.get("leader")
        st.markdown(f"**{title}**")
        st.caption(f"{current_value:.1f} / {target_value:.1f} {unit}")
        if isinstance(progress_pct, (int, float)):
            st.progress(int(max(0, min(100, round(progress_pct)))))
            st.caption(f"Progression: {progress_pct:.1f}%")
        if leader and str(leader).lower() != "none":
            st.caption(f"Leader: {leader}")
        details = challenge.get("details")
        if isinstance(details, dict):
            st.caption(
                "Duel: "
                f"course {details.get('course_km', 0.0):.1f} km, "
                f"trail {details.get('trail_km', 0.0):.1f} km, "
                f"velo {details.get('velo_km', 0.0):.1f} km"
            )


def render_badges_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 5 - Recompenses et badges")
    badges = summary.get("badges", [])
    if not badges:
        st.info("Pas de badges cette semaine.")
        return

    for badge in badges:
        winner = badge.get("display_name", "Membre")
        if badge.get("is_current_user"):
            winner = f"{winner} (toi)"
        st.success(f"{badge.get('title', 'Badge')} - {winner}: {badge.get('reason', '')}")


def render_history_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 6 - Historique social")
    events = summary.get("social_history", [])
    if not events:
        st.info("Aucun evenement recent.")
        return
    for event in events:
        st.write(f"- {event.get('message', '')}")


st.set_page_config(page_title="Comparaison", page_icon="⚖️", layout="wide")
st.title("Comparaison")
st.caption("Competition saine, cooperation, defis et progression collective.")

user = require_login()

left, middle, right = st.columns([1, 1, 1])
period_label = left.selectbox("Periode", options=list(PERIOD_OPTIONS.keys()), index=1)
period_days = PERIOD_OPTIONS[period_label]
sessions_target = middle.selectbox("Defi seances / semaine", options=[3, 4, 5, 6], index=1)

with get_db() as session:
    seed = get_social_comparison_dashboard(
        session=session,
        actor_user_id=user["id"],
        period_days=period_days,
        sport_type=None,
        sessions_target=int(sessions_target),
    )

sport_options = ["Tous sports"] + [sport for sport in seed.get("available_sports", []) if sport]
sport_label = right.selectbox("Sport", options=sport_options, index=0)
sport_filter = None if sport_label == "Tous sports" else sport_label

summary = seed
if sport_filter:
    with get_db() as session:
        summary = get_social_comparison_dashboard(
            session=session,
            actor_user_id=user["id"],
            period_days=period_days,
            sport_type=sport_filter,
            sessions_target=int(sessions_target),
        )

members = summary.get("members", [])
if not members:
    st.info("Aucune donnee de comparaison disponible.")
    st.stop()

render_overview_block(summary=summary)
render_leaderboards_block(summary=summary)
render_visual_block(summary=summary)
render_challenges_block(summary=summary)
render_badges_block(summary=summary)
render_history_block(summary=summary)
