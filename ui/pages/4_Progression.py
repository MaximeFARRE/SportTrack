import os
import sys
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pandas as pd
import plotly.express as px
import streamlit as st

from app.db import get_db
from app.services.metrics_service import get_dashboard_summary, get_progression_summary
from app.services.strava_service import get_athletes_for_user
from ui.session import require_login


def fmt_duration(seconds: float | int) -> str:
    total_minutes = int(round(float(seconds) / 60.0))
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours}h{minutes:02d}"


def fmt_km(meters: float) -> str:
    return f"{meters / 1000.0:.1f} km"


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.1f}%"


def fmt_pace(seconds_per_km: float | None) -> str:
    if seconds_per_km is None or seconds_per_km <= 0:
        return "n/a"
    minutes = int(seconds_per_km // 60)
    seconds = int(round(seconds_per_km % 60))
    return f"{minutes}:{seconds:02d} /km"


def fmt_time(seconds: int | None) -> str:
    if seconds is None:
        return "n/a"
    minutes, sec = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours}h{minutes:02d}m{sec:02d}s"
    return f"{minutes}m{sec:02d}s"


def render_summary_block(summary: dict[str, Any]) -> None:
    st.subheader("Bloc 1 - Resume de progression")
    cols = st.columns(5)

    volume = summary.get("volume_4w", {})
    avg_load = summary.get("average_load_4w", {})
    regularity = summary.get("regularity_4w", {})
    best_week = summary.get("best_recent_week")
    sport = summary.get("current_main_sport", "n/a")

    cols[0].metric(
        "Volume 4 sem",
        fmt_duration(volume.get("current_value", 0)),
        fmt_pct(volume.get("change_pct")),
    )
    cols[1].metric(
        "Charge moyenne",
        f"{float(avg_load.get('current_value', 0.0)):.1f}",
        fmt_pct(avg_load.get("change_pct")),
    )
    cols[2].metric(
        "Regularite",
        f"{float(regularity.get('current_value', 0.0)):.0f}/100",
        fmt_pct(regularity.get("change_pct")),
    )
    if best_week:
        cols[3].metric(
            "Meilleure semaine recente",
            f"{float(best_week.get('training_load', 0.0)):.1f}",
            f"{fmt_km(float(best_week.get('distance_m', 0.0)))}",
        )
    else:
        cols[3].metric("Meilleure semaine recente", "n/a")
    cols[4].metric("Sport principal actuel", sport)

    st.caption(f"Score progression: {float(summary.get('progression_score', 0.0)):.1f} / 100")


def render_long_term_block(weekly_trends: list[dict[str, Any]]) -> None:
    st.subheader("Bloc 2 - Tendances long terme")
    if not weekly_trends:
        st.info("Pas assez de donnees pour les tendances long terme.")
        return

    df = pd.DataFrame(weekly_trends).sort_values("week_start_date")
    df["week_start_date"] = pd.to_datetime(df["week_start_date"])
    df["duration_h"] = (df["duration_sec"] / 3600.0).round(2)
    df["duration_h_ma3"] = (df["duration_sec_ma3"] / 3600.0).round(2)
    df["distance_km"] = (df["distance_m"] / 1000.0).round(2)
    df["distance_km_ma3"] = (df["distance_m_ma3"] / 1000.0).round(2)
    df["dplus_m"] = df["elevation_gain_m"].round(0)

    c1, c2 = st.columns(2)
    c3, c4 = st.columns(2)

    fig_duration = px.bar(
        df,
        x="week_start_date",
        y="duration_h",
        title="Duree hebdo (3 mois / 6 mois)",
        labels={"week_start_date": "Semaine", "duration_h": "Heures"},
    )
    fig_duration.add_scatter(
        x=df["week_start_date"],
        y=df["duration_h_ma3"],
        mode="lines+markers",
        name="Moyenne glissante 3 sem",
    )
    c1.plotly_chart(fig_duration, use_container_width=True)

    fig_distance = px.bar(
        df,
        x="week_start_date",
        y="distance_km",
        title="Distance hebdo",
        labels={"week_start_date": "Semaine", "distance_km": "km"},
    )
    fig_distance.add_scatter(
        x=df["week_start_date"],
        y=df["distance_km_ma3"],
        mode="lines+markers",
        name="Moyenne glissante 3 sem",
    )
    c2.plotly_chart(fig_distance, use_container_width=True)

    c3.plotly_chart(
        px.line(
            df,
            x="week_start_date",
            y="dplus_m",
            markers=True,
            title="D+ hebdo",
            labels={"week_start_date": "Semaine", "dplus_m": "D+ (m)"},
        ),
        use_container_width=True,
    )
    c4.plotly_chart(
        px.line(
            df,
            x="week_start_date",
            y="sessions_count",
            markers=True,
            title="Nombre de seances",
            labels={"week_start_date": "Semaine", "sessions_count": "Seances"},
        ),
        use_container_width=True,
    )


def render_performance_block(performance: dict[str, Any]) -> None:
    st.subheader("Bloc 3 - Progression de la performance")
    sport_type = performance.get("sport_type", "n/a")
    summary = performance.get("summary", {})
    run_records = performance.get("run_records", [])

    if sport_type == "run":
        left, right = st.columns(2)
        left.metric("Allure moy 4 sem", fmt_pace(summary.get("avg_pace_sec_per_km_current_4w")))
        right.metric(
            "Evolution allure",
            f"{summary.get('pace_change_sec_per_km', 0):+.1f} sec/km"
            if summary.get("pace_change_sec_per_km") is not None
            else "n/a",
            fmt_pct(summary.get("pace_improvement_pct")),
        )

        if run_records:
            records_df = pd.DataFrame(run_records)
            records_df["distance"] = records_df["distance_km"].apply(lambda x: f"{x:g} km")
            records_df["chrono estime"] = records_df["best_estimated_time_sec"].apply(fmt_time)
            records_df["allure"] = records_df["pace_sec_per_km"].apply(fmt_pace)
            records_df["date"] = pd.to_datetime(records_df["activity_date"]).dt.strftime("%d/%m/%Y")
            st.dataframe(
                records_df[["distance", "chrono estime", "allure", "activity_name", "date"]],
                use_container_width=True,
                hide_index=True,
            )
        else:
            st.info("Pas assez de sorties course pour calculer des references 1k/5k/10k/semi.")
        return

    if sport_type == "ride":
        c1, c2, c3 = st.columns(3)
        c1.metric(
            "Distance 4 sem",
            fmt_km(float(summary.get("distance_current_4w_m", 0.0))),
            fmt_pct(summary.get("distance_change_pct_4w")),
        )
        c2.metric(
            "Duree 4 sem",
            fmt_duration(float(summary.get("duration_current_4w_sec", 0.0))),
            fmt_pct(summary.get("duration_change_pct_4w")),
        )
        c3.metric(
            "Puissance moy 4 sem",
            "n/a" if summary.get("avg_power_current_4w_w") is None else f"{summary['avg_power_current_4w_w']} W",
            "",
        )

        st.caption(
            "Bests velo: "
            f"distance {fmt_km(float(summary.get('best_distance_m', 0.0)))}, "
            f"duree {fmt_duration(float(summary.get('best_duration_sec', 0.0)))}, "
            f"D+ {round(float(summary.get('best_elevation_gain_m', 0.0)))} m"
        )
        return

    st.info("Progression performance detaillee indisponible pour ce sport. Utilise un filtre course ou velo.")


def render_robustness_block(robustness: dict[str, Any], sessions_target: int) -> None:
    st.subheader("Bloc 4 - Progression de la robustesse")
    cols = st.columns(4)
    cols[0].metric("Semaines consecutives", int(robustness.get("consecutive_training_weeks", 0)))
    cols[1].metric(f"Semaines >= {sessions_target} seances", int(robustness.get("weeks_above_target", 0)))
    cols[2].metric("Stabilite de charge", f"{round(float(robustness.get('stable_load_ratio', 0.0)) * 100)}%")
    cols[3].metric("Plus longue serie de jours actifs", int(robustness.get("longest_active_streak_days", 0)))


def render_badges_block(badges: list[dict[str, str]]) -> None:
    st.subheader("Bloc 5 - Badges / accomplissements")
    if not badges:
        st.info("Aucun badge pour le moment. Continue la regularite.")
        return

    for badge in badges:
        st.success(f"**{badge.get('title', 'Badge')}** - {badge.get('description', '')}")


st.set_page_config(page_title="Progression", page_icon="📈", layout="wide")
st.title("Progression")
st.caption("Volume, regularite, performance et robustesse compares sur des periodes equivalentes.")

user = require_login()

with get_db() as session:
    athletes = get_athletes_for_user(session=session, user_id=user["id"])

if not athletes:
    st.info("Aucun athlete disponible.")
    st.stop()

athlete_map = {
    (f"{athlete.firstname or ''} {athlete.lastname or ''}".strip() or f"Athlete #{athlete.id}"): athlete.id
    for athlete in athletes
}

left, mid, right = st.columns([2, 1, 1])
selected_athlete_label = left.selectbox("Athlete", list(athlete_map.keys()))
selected_horizon = mid.selectbox("Horizon", options=["3 mois", "6 mois"], index=1)
weeks = 12 if selected_horizon == "3 mois" else 26
sessions_target = right.selectbox("Objectif seances / semaine", options=[2, 3, 4, 5], index=1)
athlete_id = athlete_map[selected_athlete_label]

with get_db() as session:
    dashboard_seed = get_dashboard_summary(
        session=session,
        athlete_id=athlete_id,
        period_days=84,
        recent_activities_limit=1,
    )

sport_options = ["Tous sports"] + sorted([item["sport_type"] for item in dashboard_seed.get("sports_breakdown", [])])
selected_sport = st.selectbox("Filtre sport", options=sport_options, index=0)
sport_filter = None if selected_sport == "Tous sports" else selected_sport

with get_db() as session:
    progression = get_progression_summary(
        session=session,
        athlete_id=athlete_id,
        weeks=weeks,
        sport_type=sport_filter,
        sessions_target=int(sessions_target),
    )

render_summary_block(progression.get("summary", {}))
render_long_term_block(progression.get("weekly_trends", []))
render_performance_block(progression.get("performance", {}))
render_robustness_block(progression.get("robustness", {}), sessions_target=int(sessions_target))
render_badges_block(progression.get("badges", []))
