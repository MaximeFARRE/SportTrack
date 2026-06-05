export type VmaActivity = {
  sport_type: string
  start_date: string
  duration_sec: number | null
  moving_time_sec: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  average_heartrate: number | null
  max_heartrate: number | null
}

export type VmaZone = {
  zone_number: number
  hr_min: number
  hr_max: number | null
}

export type VmaEstimate = {
  valueKmh: number | null
  confidence: "low" | "medium" | "good"
  candidateCount: number
  tooltip: string
}

type Candidate = { valueKmh: number; score: number }

function isClassicRun(sportType: string): boolean {
  const normalized = sportType.trim().toLowerCase()
  return normalized === "run" || normalized === "running"
}

function durationFractionOfVma(minutes: number): number {
  if (minutes <= 4) return 1.04
  if (minutes <= 6) return 1.01
  if (minutes <= 8) return 0.99
  if (minutes <= 12) return 0.96
  if (minutes <= 20) return 0.92
  if (minutes <= 30) return 0.88
  if (minutes <= 45) return 0.84
  return 0.8
}

function zoneNumberForHr(bpm: number | null, zones: VmaZone[]): number {
  if (!bpm) return 0
  return zones.find((zone) => bpm >= zone.hr_min && (zone.hr_max == null || bpm < zone.hr_max))?.zone_number ?? 0
}

function recencyScore(date: Date, now: Date): number {
  const days = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000)
  return Math.max(0.35, 1 - days / 240)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function weightedAverage(candidates: Candidate[]): number | null {
  const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, 6)
  const center = median(top.map((candidate) => candidate.valueKmh))
  if (center == null) return null
  const filtered = top.filter((candidate) => Math.abs(candidate.valueKmh - center) <= 2.5)
  const scoreSum = filtered.reduce((sum, candidate) => sum + candidate.score, 0)
  if (scoreSum === 0) return null
  return filtered.reduce((sum, candidate) => sum + candidate.valueKmh * candidate.score, 0) / scoreSum
}

export function paceFromKmh(kmh: number | null): string {
  if (kmh == null || kmh <= 0) return "—"
  const sec = Math.round(3600 / kmh)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}/km`
}

export function estimateVma(
  activities: VmaActivity[],
  zones: VmaZone[],
  now: Date = new Date(),
): VmaEstimate {
  const sortedZones = [...zones].sort((a, b) => a.zone_number - b.zone_number)
  const candidates = activities.flatMap((activity): Candidate[] => {
    const date = new Date(activity.start_date)
    const durationSec = activity.moving_time_sec && activity.moving_time_sec > 0 ? activity.moving_time_sec : activity.duration_sec ?? 0
    const distanceKm = (activity.distance_m ?? 0) / 1000
    const elevationPerKm = distanceKm > 0 ? (activity.elevation_gain_m ?? 0) / distanceKm : 999
    if (!isClassicRun(activity.sport_type) || durationSec < 180 || distanceKm < 0.8 || elevationPerKm > 35) return []

    const minutes = durationSec / 60
    const speedKmh = distanceKm / (durationSec / 3600)
    const valueKmh = speedKmh / durationFractionOfVma(minutes)
    if (!Number.isFinite(valueKmh) || valueKmh < 8 || valueKmh > 28) return []

    const maxZone = zoneNumberForHr(activity.max_heartrate, sortedZones)
    const avgZone = zoneNumberForHr(activity.average_heartrate, sortedZones)
    const durationScore = minutes >= 4 && minutes <= 12 ? 1 : minutes <= 30 ? 0.78 : 0.55
    const intensityScore = maxZone >= 5 ? 1 : maxZone >= 4 || avgZone >= 4 ? 0.82 : avgZone >= 3 ? 0.62 : 0.42
    const elevationScore = elevationPerKm <= 12 ? 1 : elevationPerKm <= 25 ? 0.78 : 0.55
    const score = durationScore * intensityScore * elevationScore * recencyScore(date, now)
    return score >= 0.22 ? [{ valueKmh, score }] : []
  })

  const value = weightedAverage(candidates)
  const rounded = value == null ? null : Math.round(value * 10) / 10
  const confidence = candidates.length >= 5 ? "good" : candidates.length >= 3 ? "medium" : "low"
  const tooltip =
    rounded == null
      ? "VMA indisponible: pas assez de sorties course route exploitables."
      : `Estimation V1 basée sur ${candidates.length} sortie${candidates.length > 1 ? "s" : ""} course route récente${candidates.length > 1 ? "s" : ""}. Les trails, sorties très vallonnées et données improbables sont ignorés. Allure à 100%: ${paceFromKmh(rounded)}.`

  return { valueKmh: rounded, confidence, candidateCount: candidates.length, tooltip }
}
