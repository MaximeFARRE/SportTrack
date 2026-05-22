"""Tests for app/services/intensity_distribution_service.py — pure logic only."""
import pytest

from app.services.intensity_distribution_service import (
    _build_zones_json,
    _classify_seconds,
    compute_polarization_ratio,
)

# Canonical 5-zone config used across tests
ZONES = [
    {"zone_number": 1, "zone_name": "Z1", "hr_min": 0,   "hr_max": 122, "color_hex": "#90CAF9"},
    {"zone_number": 2, "zone_name": "Z2", "hr_min": 122, "hr_max": 149, "color_hex": "#4CAF50"},
    {"zone_number": 3, "zone_name": "Z3", "hr_min": 149, "hr_max": 169, "color_hex": "#FFC107"},
    {"zone_number": 4, "zone_name": "Z4", "hr_min": 169, "hr_max": 189, "color_hex": "#FF9800"},
    {"zone_number": 5, "zone_name": "Z5", "hr_min": 189, "hr_max": None, "color_hex": "#F44336"},
]


# ── _classify_seconds ─────────────────────────────────────────────────────────

def test_classify_all_in_z1():
    counts = _classify_seconds([100, 110, 120], ZONES)
    assert counts[1] == 3
    assert counts[2] == 0


def test_classify_boundary_z1_z2():
    # 122 is the lower bound of Z2 → should fall in Z2
    counts = _classify_seconds([121, 122, 123], ZONES)
    assert counts[1] == 1  # 121 is Z1 (hr_max=122 exclusive)
    assert counts[2] == 2  # 122, 123 are Z2


def test_classify_z5_no_upper_bound():
    counts = _classify_seconds([200, 210, 220], ZONES)
    assert counts[5] == 3
    assert counts[4] == 0


def test_classify_mixed_distribution():
    hr_data = [100] * 60 + [135] * 120 + [155] * 30 + [175] * 45 + [195] * 15
    counts = _classify_seconds(hr_data, ZONES)
    assert counts[1] == 60
    assert counts[2] == 120
    assert counts[3] == 30
    assert counts[4] == 45
    assert counts[5] == 15


def test_classify_empty_stream():
    counts = _classify_seconds([], ZONES)
    assert all(v == 0 for v in counts.values())


def test_classify_total_equals_input_length():
    hr_data = list(range(80, 220))
    counts = _classify_seconds(hr_data, ZONES)
    assert sum(counts.values()) == len(hr_data)


# ── _build_zones_json ─────────────────────────────────────────────────────────

def test_build_zones_json_length():
    counts = {1: 600, 2: 1800, 3: 300, 4: 120, 5: 0}
    result = _build_zones_json(counts, ZONES)
    assert len(result) == 5


def test_build_zones_json_order():
    counts = {1: 600, 2: 1800, 3: 300, 4: 120, 5: 60}
    result = _build_zones_json(counts, ZONES)
    assert [r["zone"] for r in result] == [1, 2, 3, 4, 5]


def test_build_zones_json_seconds():
    counts = {1: 600, 2: 1800, 3: 300, 4: 120, 5: 60}
    result = _build_zones_json(counts, ZONES)
    assert result[0]["sec"] == 600
    assert result[1]["sec"] == 1800


def test_build_zones_json_has_name_and_color():
    counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    result = _build_zones_json(counts, ZONES)
    for entry in result:
        assert "name" in entry
        assert "color" in entry


# ── compute_polarization_ratio ────────────────────────────────────────────────

def test_polarization_all_low():
    zones = [
        {"zone": 1, "sec": 1800, "name": "Z1", "color": "#000"},
        {"zone": 2, "sec": 1800, "name": "Z2", "color": "#000"},
        {"zone": 3, "sec": 0,    "name": "Z3", "color": "#000"},
        {"zone": 4, "sec": 0,    "name": "Z4", "color": "#000"},
        {"zone": 5, "sec": 0,    "name": "Z5", "color": "#000"},
    ]
    result = compute_polarization_ratio(zones)
    assert result["low_pct"] == 100.0
    assert result["high_pct"] == 0.0


def test_polarization_perfect_80_20():
    zones = [
        {"zone": 1, "sec": 2400, "name": "Z1", "color": "#000"},
        {"zone": 2, "sec": 1200, "name": "Z2", "color": "#000"},
        {"zone": 3, "sec": 0,    "name": "Z3", "color": "#000"},
        {"zone": 4, "sec": 600,  "name": "Z4", "color": "#000"},
        {"zone": 5, "sec": 300,  "name": "Z5", "color": "#000"},
    ]
    result = compute_polarization_ratio(zones)
    total = 2400 + 1200 + 600 + 300
    assert result["low_pct"] == round(3600 / total * 100, 1)
    assert result["high_pct"] == round(900 / total * 100, 1)


def test_polarization_empty():
    zones = [{"zone": z, "sec": 0, "name": "", "color": ""} for z in range(1, 6)]
    result = compute_polarization_ratio(zones)
    assert result == {"low_pct": 0.0, "mid_pct": 0.0, "high_pct": 0.0}


def test_polarization_sums_to_100():
    zones = [
        {"zone": 1, "sec": 600,  "name": "Z1", "color": "#000"},
        {"zone": 2, "sec": 1200, "name": "Z2", "color": "#000"},
        {"zone": 3, "sec": 300,  "name": "Z3", "color": "#000"},
        {"zone": 4, "sec": 400,  "name": "Z4", "color": "#000"},
        {"zone": 5, "sec": 100,  "name": "Z5", "color": "#000"},
    ]
    result = compute_polarization_ratio(zones)
    total = result["low_pct"] + result["mid_pct"] + result["high_pct"]
    assert abs(total - 100.0) < 0.2
