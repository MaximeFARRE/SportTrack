"""Tests for app/services/injury_service.py — pure logic only, no Supabase."""
from datetime import date
from unittest.mock import MagicMock, patch

from app.services.injury_service import (
    _PAIN_TAG_ZONES,
    _avg,
    get_acwr_context,
    get_injury_suggestions,
)


# ── _avg ──────────────────────────────────────────────────────────────────────

def test_avg_empty():
    assert _avg([]) == 0.0


def test_avg_single():
    assert _avg([10.0]) == 10.0


def test_avg_multiple():
    assert _avg([10.0, 20.0, 30.0]) == 20.0


# ── pain tag map ──────────────────────────────────────────────────────────────

def test_pain_tag_zones_coverage():
    expected_keys = {
        "douleur_genou_droit",
        "douleur_genou_gauche",
        "douleur_dos",
        "douleur_cheville",
        "douleur_hanche",
        "douleur_epaule",
    }
    assert set(_PAIN_TAG_ZONES.keys()) == expected_keys


def test_pain_tag_zones_values_no_spaces():
    for zone in _PAIN_TAG_ZONES.values():
        assert " " not in zone, f"Zone label must use underscores: {zone!r}"


# ── get_acwr_context ──────────────────────────────────────────────────────────

def _make_supabase_mock(rows: list[dict]) -> MagicMock:
    mock = MagicMock()
    chain = mock.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value
    chain.execute.return_value.data = rows
    return mock


@patch("app.services.injury_service._get_supabase")
def test_acwr_context_no_data(mock_get):
    mock_get.return_value = _make_supabase_mock([])
    result = get_acwr_context("user-1", date(2026, 5, 1))

    assert result["acwr"] == 0.0
    assert result["acute_load_7d"] == 0.0
    assert result["chronic_load_28d"] == 0.0
    assert result["trend_14d"] == []
    assert result["reference_date"] == "2026-05-01"


@patch("app.services.injury_service._get_supabase")
def test_acwr_context_with_data(mock_get):
    rows = [
        {"metric_date": f"2026-04-{d:02d}", "training_load": 100.0}
        for d in range(4, 29)  # 25 rows
    ]
    mock_get.return_value = _make_supabase_mock(rows)
    result = get_acwr_context("user-1", date(2026, 4, 28))

    assert result["acwr"] == 1.0  # equal acute and chronic
    assert result["chronic_load_28d"] == 100.0
    assert result["acute_load_7d"] == 100.0
    assert len(result["trend_14d"]) == 14


@patch("app.services.injury_service._get_supabase")
def test_acwr_context_high_acute(mock_get):
    # 21 days at load 50, last 7 days at load 150 → ACWR > 1
    rows = (
        [{"metric_date": f"2026-04-{d:02d}", "training_load": 50.0} for d in range(1, 22)]
        + [{"metric_date": f"2026-04-{d:02d}", "training_load": 150.0} for d in range(22, 29)]
    )
    mock_get.return_value = _make_supabase_mock(rows)
    result = get_acwr_context("user-1", date(2026, 4, 28))

    assert result["acwr"] > 1.0


# ── get_injury_suggestions ────────────────────────────────────────────────────

def _make_activities_mock(activities: list[dict]) -> MagicMock:
    mock = MagicMock()
    chain = (
        mock.table.return_value
        .select.return_value
        .eq.return_value
        .gte.return_value
        .order.return_value
    )
    chain.execute.return_value.data = activities
    return mock


@patch("app.services.injury_service._get_supabase")
def test_suggestions_no_activities(mock_get):
    mock_get.return_value = _make_activities_mock([])
    assert get_injury_suggestions("user-1") == []


@patch("app.services.injury_service._get_supabase")
def test_suggestions_below_threshold(mock_get):
    acts = [
        {"id": str(i), "name": "run", "start_date": "2026-05-01T07:00:00", "body_feeling_tags": ["douleur_dos"]}
        for i in range(2)
    ]
    mock_get.return_value = _make_activities_mock(acts)
    assert get_injury_suggestions("user-1") == []


@patch("app.services.injury_service._get_supabase")
def test_suggestions_reaches_threshold(mock_get):
    acts = [
        {"id": str(i), "name": "run", "start_date": f"2026-05-{i+1:02d}T07:00:00", "body_feeling_tags": ["douleur_genou_droit"]}
        for i in range(3)
    ]
    mock_get.return_value = _make_activities_mock(acts)
    suggestions = get_injury_suggestions("user-1")

    assert len(suggestions) == 1
    s = suggestions[0]
    assert s["body_zone"] == "genou_droit"
    assert s["activity_count"] == 3


@patch("app.services.injury_service._get_supabase")
def test_suggestions_multiple_zones(mock_get):
    acts = (
        [
            {"id": str(i), "name": "run", "start_date": f"2026-05-{i+1:02d}T07:00:00", "body_feeling_tags": ["douleur_dos"]}
            for i in range(3)
        ]
        + [
            {"id": str(i + 10), "name": "bike", "start_date": f"2026-05-{i+1:02d}T10:00:00", "body_feeling_tags": ["douleur_cheville"]}
            for i in range(4)
        ]
    )
    mock_get.return_value = _make_activities_mock(acts)
    suggestions = get_injury_suggestions("user-1")

    zones = {s["body_zone"] for s in suggestions}
    assert zones == {"dos", "cheville"}


@patch("app.services.injury_service._get_supabase")
def test_suggestions_ignores_non_pain_tags(mock_get):
    acts = [
        {"id": str(i), "name": "run", "start_date": f"2026-05-{i+1:02d}T07:00:00", "body_feeling_tags": ["jambes_lourdes", "fatigue_generale"]}
        for i in range(5)
    ]
    mock_get.return_value = _make_activities_mock(acts)
    assert get_injury_suggestions("user-1") == []


@patch("app.services.injury_service._get_supabase")
def test_suggestions_null_tags_ignored(mock_get):
    acts = [
        {"id": str(i), "name": "run", "start_date": f"2026-05-{i+1:02d}T07:00:00", "body_feeling_tags": None}
        for i in range(5)
    ]
    mock_get.return_value = _make_activities_mock(acts)
    assert get_injury_suggestions("user-1") == []
