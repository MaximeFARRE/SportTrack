"""Tests for app/services/hr_zones_service.py.

Pure computation tests — no database required.
"""
import pytest

from app.services.hr_zones_service import (
    FRIEL_ZONES,
    classify_hr,
    compute_zones_from_hr_max,
)

# ── compute_zones_from_hr_max ─────────────────────────────────────────────────

def test_compute_zones_returns_five():
    zones = compute_zones_from_hr_max(180)
    assert len(zones) == 5


def test_compute_zones_zone_numbers():
    zones = compute_zones_from_hr_max(180)
    assert [z["zone_number"] for z in zones] == [1, 2, 3, 4, 5]


def test_compute_zones_z5_has_no_upper_bound():
    zones = compute_zones_from_hr_max(180)
    z5 = zones[4]
    assert z5["hr_max"] is None
    assert z5["pct_max"] is None


def test_compute_zones_is_custom_false():
    zones = compute_zones_from_hr_max(180)
    assert all(not z["is_custom"] for z in zones)


@pytest.mark.parametrize("hr_max", [150, 180, 200, 220])
def test_compute_zones_boundaries_consistent(hr_max: int):
    zones = compute_zones_from_hr_max(hr_max)
    # Z1 starts at 0
    assert zones[0]["hr_min"] == 0
    # Each zone's upper bound matches next zone's lower bound (±1 due to floor)
    for i in range(len(zones) - 1):
        assert zones[i]["hr_max"] == zones[i + 1]["hr_min"]


def test_compute_zones_friel_example():
    # FC max 187 bpm → Z2 endurance 68% = 127 bpm
    zones = compute_zones_from_hr_max(187)
    z2 = zones[1]
    assert z2["hr_min"] == int(187 * 0.68)
    assert z2["hr_max"] == int(187 * 0.83)


def test_compute_zones_colors_present():
    zones = compute_zones_from_hr_max(180)
    for zone in zones:
        assert zone["color_hex"].startswith("#")
        assert len(zone["color_hex"]) == 7


# ── classify_hr ───────────────────────────────────────────────────────────────

def test_classify_hr_low_is_z1():
    # 50% of FC max → Z1
    assert classify_hr(90, 180) == 1


def test_classify_hr_boundary_z2():
    # hr_min for Z2 = floor(180 * 0.68) = 122, so 122 bpm → Z1 (pct 0.678 < 0.68)
    # First bpm squarely in Z2 is 123 (pct 0.683)
    assert classify_hr(122, 180) == 1
    assert classify_hr(123, 180) == 2


def test_classify_hr_z3():
    # 88% → Z3
    assert classify_hr(int(180 * 0.88), 180) == 3


def test_classify_hr_z4():
    # 99% → Z4
    assert classify_hr(int(180 * 0.99), 180) == 4


def test_classify_hr_very_high_is_z5():
    # 110% → Z5
    assert classify_hr(int(180 * 1.10), 180) == 5


def test_classify_hr_at_max_is_z4():
    # 100% of FC max = 1.0, which falls in Z4 (0.94–1.05); Z5 requires >1.05
    hr_max = 200
    assert classify_hr(hr_max, hr_max) == 4


def test_classify_hr_above_max_is_z5():
    # 106% → Z5
    hr_max = 200
    assert classify_hr(int(hr_max * 1.06), hr_max) == 5


# ── FRIEL_ZONES constant ──────────────────────────────────────────────────────

def test_friel_zones_count():
    assert len(FRIEL_ZONES) == 5


def test_friel_zones_percentages_ordered():
    pct_mins = [z[2] for z in FRIEL_ZONES]
    assert pct_mins == sorted(pct_mins)
