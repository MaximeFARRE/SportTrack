"""Tests for app/services/ai_export_service.py — pure logic, no Supabase."""
from app.services.ai_export_service import _avg, _strip_none, to_markdown


# ── _avg ──────────────────────────────────────────────────────────────────────

def test_avg_empty():
    assert _avg([]) is None


def test_avg_filters_none():
    assert _avg([10.0, None, 20.0]) == 15.0  # type: ignore[arg-type]


def test_avg_rounds():
    result = _avg([1.0, 2.0, 3.0])
    assert result == 2.0


# ── _strip_none ───────────────────────────────────────────────────────────────

def test_strip_none_removes_none_values():
    d = {"a": 1, "b": None, "c": "hello"}
    assert _strip_none(d) == {"a": 1, "c": "hello"}


def test_strip_none_keeps_zero():
    d = {"a": 0, "b": None}
    assert _strip_none(d) == {"a": 0}


def test_strip_none_keeps_false():
    d = {"a": False, "b": None}
    assert _strip_none(d) == {"a": False}


def test_strip_none_empty_dict():
    assert _strip_none({}) == {}


# ── to_markdown ───────────────────────────────────────────────────────────────

def _minimal_export() -> dict:
    return {
        "athlete": {"sport_principal": "trail", "hr_max": 187, "age": 32},
        "forme_actuelle": {"ctl": 55.0, "atl": 62.0, "tsb": -7.0, "acwr": 1.13, "statut": "equilibre"},
        "recuperation_7j": {"hrv_moyen": 42.0, "sleep_score_moy": 68.0},
        "semaine_en_cours": {"sessions": 3, "volume_km": 40.0},
        "ressenti_recent": [
            {"date": "2026-05-19", "rpe": 8, "feel_score": 3, "tags": ["jambes_lourdes"]},
        ],
        "alertes_actives": ["ACWR à 1.13 — charge modérée"],
        "blessures_actives": [],
        "plan_semaine_prochaine": [
            {"jour": "lundi", "type": "récupération", "duree_min": 45}
        ],
    }


def test_to_markdown_returns_string():
    md = to_markdown(_minimal_export())
    assert isinstance(md, str)


def test_to_markdown_has_title():
    md = to_markdown(_minimal_export())
    assert "# Bilan d'entraînement SportTrack" in md


def test_to_markdown_has_athlete_section():
    md = to_markdown(_minimal_export())
    assert "## Profil athlète" in md
    assert "trail" in md
    assert "187" in md


def test_to_markdown_has_forme_section():
    md = to_markdown(_minimal_export())
    assert "## Forme actuelle" in md
    assert "55.0" in md
    assert "1.13" in md


def test_to_markdown_has_recovery_section():
    md = to_markdown(_minimal_export())
    assert "## Récupération" in md
    assert "42.0" in md


def test_to_markdown_has_alertes():
    md = to_markdown(_minimal_export())
    assert "Alertes actives" in md
    assert "ACWR" in md


def test_to_markdown_no_injuries_shows_aucune():
    md = to_markdown(_minimal_export())
    assert "Aucune blessure active" in md


def test_to_markdown_with_injuries():
    data = _minimal_export()
    data["blessures_actives"] = [{"zone": "genou droit", "depuis": "2026-05-01", "type": "tendinous"}]
    md = to_markdown(data)
    assert "genou droit" in md


def test_to_markdown_plan_section():
    md = to_markdown(_minimal_export())
    assert "Plan semaine prochaine" in md
    assert "Lundi" in md or "lundi" in md.lower()


def test_to_markdown_no_null_fields():
    data = _minimal_export()
    md = to_markdown(data)
    assert "None" not in md


def test_to_markdown_empty_sections_omitted():
    data = {"athlete": {"sport_principal": "run"}, "blessures_actives": []}
    md = to_markdown(data)
    assert "## Récupération" not in md
    assert "## Forme" not in md
