export type HrZone = {
  zone_number: number
  zone_name: string
  hr_min: number
  hr_max: number | null
  pct_min: number
  pct_max: number | null
  is_custom: boolean
  color_hex: string
}

const FRIEL_ZONES = [
  { n: 1, name: "Z1 - Récupération", min: 0.0, max: 0.68, color: "#90CAF9" },
  { n: 2, name: "Z2 - Endurance", min: 0.68, max: 0.83, color: "#4CAF50" },
  { n: 3, name: "Z3 - Tempo", min: 0.83, max: 0.94, color: "#FFC107" },
  { n: 4, name: "Z4 - Seuil", min: 0.94, max: 1.05, color: "#FF9800" },
  { n: 5, name: "Z5 - Anaérobie", min: 1.05, max: null, color: "#F44336" },
] as const

export function computeZonesFromHrMax(hrMax: number): HrZone[] {
  return FRIEL_ZONES.map((zone) => ({
    zone_number: zone.n,
    zone_name: zone.name,
    hr_min: Math.floor(hrMax * zone.min),
    hr_max: zone.max != null ? Math.floor(hrMax * zone.max) : null,
    pct_min: zone.min,
    pct_max: zone.max,
    is_custom: false,
    color_hex: zone.color,
  }))
}

export function classifyHr(bpm: number, hrMax: number): number {
  const pct = bpm / hrMax
  for (const zone of FRIEL_ZONES) {
    if ((zone.max == null || pct < zone.max) && pct >= zone.min) {
      return zone.n
    }
  }
  return 5
}
