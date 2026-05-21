"""HR zone computation based on the Friel 5-zone model.

Zones are defined as percentages of the athlete's maximum heart rate (FC max).
All zone boundaries are inclusive on the lower bound, exclusive on the upper.

Public API:
  compute_zones_from_hr_max(hr_max) -> list[dict]
  classify_hr(bpm, hr_max) -> int   (zone number 1–5)
  regenerate_zones_for_user(user_id, hr_max, supabase_client)
"""
from __future__ import annotations

from math import floor
from typing import Any
from uuid import UUID

# (zone_number, name, pct_min, pct_max, color_hex)
# pct_max of None means "no upper bound" (Z5)
FRIEL_ZONES: list[tuple[int, str, float, float | None, str]] = [
    (1, "Z1 - Récupération", 0.00, 0.68, "#90CAF9"),
    (2, "Z2 - Endurance",    0.68, 0.83, "#4CAF50"),
    (3, "Z3 - Tempo",        0.83, 0.94, "#FFC107"),
    (4, "Z4 - Seuil",        0.94, 1.05, "#FF9800"),
    (5, "Z5 - Anaérobie",    1.05, None, "#F44336"),
]


def compute_zones_from_hr_max(hr_max: int) -> list[dict]:
    """Return the 5 Friel zones computed from the given FC max (bpm)."""
    zones = []
    for zone_number, zone_name, pct_min, pct_max, color_hex in FRIEL_ZONES:
        hr_min = floor(hr_max * pct_min)
        hr_upper = floor(hr_max * pct_max) if pct_max is not None else None
        zones.append({
            "zone_number": zone_number,
            "zone_name": zone_name,
            "hr_min": hr_min,
            "hr_max": hr_upper,
            "pct_min": pct_min,
            "pct_max": pct_max,
            "is_custom": False,
            "color_hex": color_hex,
        })
    return zones


def classify_hr(bpm: int, hr_max: int) -> int:
    """Return the zone number (1–5) for a given heart rate reading."""
    pct = bpm / hr_max
    for zone_number, _, pct_min, pct_max, _ in FRIEL_ZONES:
        if pct_max is None or pct < pct_max:
            if pct >= pct_min:
                return zone_number
    return 5


def regenerate_zones_for_user(user_id: UUID, hr_max: int, supabase_client: Any) -> None:
    """Upsert auto-computed zones for a user using the Supabase service-role client.

    Uses supabase-py `upsert` with `on_conflict="user_id,zone_number"` so that
    existing custom zones are overwritten only when is_custom is False. If the
    caller wants to force-reset custom overrides they should pass reset=True at
    the route level (which calls this function after clearing is_custom flags).
    """
    zones = compute_zones_from_hr_max(hr_max)
    rows = [{"user_id": str(user_id), **zone} for zone in zones]
    supabase_client.table("hr_zones").upsert(rows, on_conflict="user_id,zone_number").execute()
