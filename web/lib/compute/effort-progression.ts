export type EffortProgressionActivity = {
  sport_type: string
  start_date: string
  duration_sec: number | null
  moving_time_sec: number | null
  distance_m: number | null
  average_heartrate: number | null
  time_in_zones_json?: unknown
}
export type EffortProgressionZone = { zone_number: number; zone_name: string; hr_min: number; hr_max: number | null; color_hex?: string }
export type EffortProgressionBucket = { key: string; label: string; sampleCount: number; medianPaceSecPerKm: number | null }

export type EffortProgressionZoneSummary = { zone: number; zoneName: string; color: string | null; currentPaceSecPerKm: number | null; baselinePaceSecPerKm: number | null; deltaPct: number | null; currentSampleCount: number; baselineSampleCount: number }

export type EffortProgressionResult = { monthlyZone2: EffortProgressionBucket[]; zoneSummaries: EffortProgressionZoneSummary[]; zone2Summary: EffortProgressionZoneSummary | null; usableRunCount: number }
type Sample = { date: string; zone: number; paceSecPerKm: number; heartRate: number }
const ZONE_COLORS: Record<number, string> = { 1: "#90CAF9", 2: "#4CAF50", 3: "#FFC107", 4: "#FF9800", 5: "#F44336" }

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function isClassicRun(sportType: string): boolean {
  const normalized = sportType.trim().toLowerCase()
  return normalized === "run" || normalized === "running"
}

function zoneFromHr(bpm: number, zones: EffortProgressionZone[]): number {
  return zones.find((zone) => bpm >= zone.hr_min && (zone.hr_max == null || bpm < zone.hr_max))?.zone_number ?? 0
}

function dominantZone(activity: EffortProgressionActivity): number | null {
  if (!Array.isArray(activity.time_in_zones_json)) return null

  const entries = activity.time_in_zones_json
    .map((entry) => {
      if (entry == null || typeof entry !== "object") return null
      const zone = Number((entry as { zone?: unknown }).zone)
      const sec = Number((entry as { sec?: unknown }).sec)
      return Number.isFinite(zone) && Number.isFinite(sec) && sec > 0 ? { zone, sec } : null
    })
    .filter((entry): entry is { zone: number; sec: number } => entry != null)
  const totalSec = entries.reduce((total, entry) => total + entry.sec, 0)
  if (totalSec === 0) return null

  const dominant = entries.reduce((best, entry) => (entry.sec > best.sec ? entry : best), entries[0])
  return dominant.sec / totalSec >= 0.5 ? dominant.zone : 0
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-")
  return `${month}/${year.slice(2)}`
}

function monthlyBuckets(samples: Sample[]): EffortProgressionBucket[] {
  const groups = new Map<string, Sample[]>()
  for (const sample of samples) {
    const key = monthKey(new Date(sample.date))
    groups.set(key, [...(groups.get(key) ?? []), sample])
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      key,
      label: monthLabel(key),
      sampleCount: group.length,
      medianPaceSecPerKm: median(group.map((sample) => sample.paceSecPerKm)),
    }))
}

function windowed(samples: Sample[], latestDate: Date, startDaysAgo: number, endDaysAgo: number): Sample[] {
  const start = new Date(latestDate)
  const end = new Date(latestDate)
  start.setUTCDate(start.getUTCDate() - startDaysAgo)
  end.setUTCDate(end.getUTCDate() - endDaysAgo)
  return samples.filter((sample) => {
    const date = new Date(sample.date)
    return date >= start && date < end
  })
}

function summary(zone: EffortProgressionZone, samples: Sample[], latestDate: Date): EffortProgressionZoneSummary {
  const zoneSamples = samples.filter((sample) => sample.zone === zone.zone_number)
  const current = windowed(zoneSamples, latestDate, 56, -1)
  const baseline = windowed(zoneSamples, latestDate, 168, 84)
  const currentPace = median(current.map((sample) => sample.paceSecPerKm))
  const baselinePace = median(baseline.map((sample) => sample.paceSecPerKm))

  return {
    zone: zone.zone_number,
    zoneName: zone.zone_name,
    color: zone.color_hex ?? ZONE_COLORS[zone.zone_number] ?? null,
    currentPaceSecPerKm: currentPace,
    baselinePaceSecPerKm: baselinePace,
    deltaPct: currentPace != null && baselinePace != null ? ((baselinePace - currentPace) / baselinePace) * 100 : null,
    currentSampleCount: current.length,
    baselineSampleCount: baseline.length,
  }
}

export function formatPace(paceSecPerKm: number | null): string {
  if (paceSecPerKm == null || !Number.isFinite(paceSecPerKm)) return "—"
  const rounded = Math.round(paceSecPerKm)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`
}

export function computeEffortProgression(
  activities: EffortProgressionActivity[],
  zones: EffortProgressionZone[],
  now: Date = new Date(),
): EffortProgressionResult {
  const sortedZones = [...zones].sort((a, b) => a.zone_number - b.zone_number)
  const since = new Date(now)
  since.setUTCDate(since.getUTCDate() - 180)

  const samples = activities
    .filter((activity) => isClassicRun(activity.sport_type))
    .map((activity) => {
      const date = new Date(activity.start_date)
      const distanceKm = (activity.distance_m ?? 0) / 1000
      const durationSec = activity.moving_time_sec && activity.moving_time_sec > 0 ? activity.moving_time_sec : activity.duration_sec ?? 0
      const heartRate = activity.average_heartrate ?? 0
      const zone = dominantZone(activity) ?? zoneFromHr(heartRate, sortedZones)
      const paceSecPerKm = distanceKm > 0 ? durationSec / distanceKm : 0
      return { date: activity.start_date, heartRate, paceSecPerKm, zone, valid: date >= since && date <= now && zone > 0 && distanceKm >= 2 && durationSec >= 600 && paceSecPerKm >= 150 && paceSecPerKm <= 900 }
    })
    .filter((sample) => sample.valid)
    .map(({ valid: _valid, ...sample }) => sample)
    .sort((a, b) => a.date.localeCompare(b.date))

  const latestDate = samples.length > 0 ? new Date(samples[samples.length - 1].date) : now
  const zoneSummaries = sortedZones.map((zone) => summary(zone, samples, latestDate))
  const zone2Samples = samples.filter((sample) => sample.zone === 2)

  return {
    monthlyZone2: monthlyBuckets(zone2Samples),
    zoneSummaries,
    zone2Summary: zoneSummaries.find((item) => item.zone === 2) ?? null,
    usableRunCount: samples.length,
  }
}
