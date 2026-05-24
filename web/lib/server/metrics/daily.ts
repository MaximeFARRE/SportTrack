import { createServiceClient } from "@/lib/supabase/service"

type ActivityForLoad = {
  start_date: string
  sport_type: string
  duration_sec: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  average_heartrate: number | null
  max_heartrate: number | null
}

type DailyAggregate = {
  sessions_count: number
  duration_sec: number
  distance_m: number
  elevation_gain_m: number
  training_load: number
}

function normalizeSportType(sportType: string): string {
  return sportType.toLowerCase().replace(/[\s_-]/g, "")
}

function sportCoefficient(sportType: string): number {
  const normalized = normalizeSportType(sportType)
  if (normalized === "trailrun" || normalized === "trail") return 1.1
  if (normalized === "ride" || normalized === "cycling" || normalized === "cycle") return 0.8
  if (normalized === "swim" || normalized === "swimming") return 0.9
  if (normalized === "workout") return 0.7
  return 1.0
}

function intensityCoefficient(activity: ActivityForLoad): number {
  const averageHeartrate = Number(activity.average_heartrate ?? 0)
  const maxHeartrate = Number(activity.max_heartrate ?? 0)

  if (averageHeartrate <= 0 || maxHeartrate <= 0 || averageHeartrate > maxHeartrate) {
    return 1.0
  }

  const ratio = averageHeartrate / maxHeartrate
  if (ratio < 0.7) return 0.75
  if (ratio < 0.78) return 0.85
  if (ratio < 0.86) return 1.0
  if (ratio < 0.92) return 1.15
  return 1.3
}

function elevationCoefficient(activity: ActivityForLoad): number {
  const normalized = normalizeSportType(activity.sport_type)
  if (normalized !== "run" && normalized !== "running" && normalized !== "trailrun" && normalized !== "trail") {
    return 1.0
  }

  const elevationGain = Math.max(Number(activity.elevation_gain_m ?? 0), 0)
  return Math.min(1 + (elevationGain / 1000) * 0.2, 1.35)
}

export function computeTrainingLoad(activity: ActivityForLoad): number {
  const durationMinutes = Math.max(Number(activity.duration_sec ?? 0), 0) / 60
  const load =
    durationMinutes *
    sportCoefficient(activity.sport_type) *
    intensityCoefficient(activity) *
    elevationCoefficient(activity)

  return Math.round(load * 100) / 100
}

function metricDate(startDate: string): string {
  return new Date(startDate).toISOString().slice(0, 10)
}

function emptyAggregate(): DailyAggregate {
  return {
    sessions_count: 0,
    duration_sec: 0,
    distance_m: 0,
    elevation_gain_m: 0,
    training_load: 0,
  }
}

export async function recomputeDailyMetricsForUser(
  userId: string,
  opts?: { days?: number },
): Promise<void> {
  const days = opts?.days ?? 120
  const sinceDateTime = new Date(Date.now() - days * 86_400_000).toISOString()
  const sinceDate = sinceDateTime.slice(0, 10)
  const supabase = createServiceClient()

  const [{ data: activities, error: activitiesError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase
        .from("activities")
        .select(
          "start_date, sport_type, duration_sec, distance_m, elevation_gain_m, average_heartrate, max_heartrate",
        )
        .eq("user_id", userId)
        .gte("start_date", sinceDateTime),
      supabase
        .from("daily_metrics")
        .select("metric_date")
        .eq("user_id", userId)
        .gte("metric_date", sinceDate),
    ])

  if (activitiesError) throw activitiesError
  if (existingError) throw existingError

  const byDate = new Map<string, DailyAggregate>()

  for (const row of existing ?? []) {
    byDate.set(row.metric_date, emptyAggregate())
  }

  for (const activity of activities ?? []) {
    const date = metricDate(activity.start_date)
    const aggregate = byDate.get(date) ?? emptyAggregate()
    aggregate.sessions_count += 1
    aggregate.duration_sec += Math.max(Number(activity.duration_sec ?? 0), 0)
    aggregate.distance_m += Math.max(Number(activity.distance_m ?? 0), 0)
    aggregate.elevation_gain_m += Math.max(Number(activity.elevation_gain_m ?? 0), 0)
    aggregate.training_load += computeTrainingLoad(activity)
    byDate.set(date, aggregate)
  }

  const rows = Array.from(byDate.entries()).map(([date, aggregate]) => ({
    user_id: userId,
    metric_date: date,
    sessions_count: aggregate.sessions_count,
    duration_sec: aggregate.duration_sec,
    distance_m: Math.round(aggregate.distance_m * 100) / 100,
    elevation_gain_m: Math.round(aggregate.elevation_gain_m * 100) / 100,
    training_load: Math.round(aggregate.training_load * 100) / 100,
  }))

  if (rows.length === 0) return

  const { error } = await supabase
    .from("daily_metrics")
    .upsert(rows, { onConflict: "user_id,metric_date" })

  if (error) throw error
}
