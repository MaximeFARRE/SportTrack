import { recomputeDailyMetricsForUser } from "@/lib/server/metrics/daily"
import { createServiceClient } from "@/lib/supabase/service"
import type { Json } from "@/lib/types/database"

import { computeIntensityForActivity } from "./intensity"
import { ensureValidStravaToken } from "./tokens"

const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
const ACTIVITY_URL = "https://www.strava.com/api/v3/activities/{id}"

export type StravaSyncResult = {
  imported: number
  skipped: number
}

type StravaActivity = {
  id: number
  name?: string
  sport_type?: string
  type?: string
  start_date?: string
  timezone?: string
  elapsed_time?: number
  moving_time?: number
  distance?: number
  total_elevation_gain?: number
  average_speed?: number
  max_speed?: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  average_watts?: number
  calories?: number
  kilojoules?: number
}

function roundInt(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null
}

async function fetchPage(
  token: string,
  page: number,
  perPage: number,
  after?: number,
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) })
  if (after !== undefined) params.set("after", String(after))

  const res = await fetch(`${ACTIVITIES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const message = await res.text().catch(() => "")
    throw new Error(`Strava activities fetch failed: ${res.status}${message ? ` ${message}` : ""}`)
  }
  return res.json()
}

async function fetchActivity(token: string, activityId: number): Promise<StravaActivity> {
  const res = await fetch(ACTIVITY_URL.replace("{id}", String(activityId)), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const message = await res.text().catch(() => "")
    throw new Error(`Strava activity fetch failed: ${res.status}${message ? ` ${message}` : ""}`)
  }
  return res.json()
}

export function mapActivity(userId: string, activity: StravaActivity) {
  if (!activity.id || !activity.start_date) return null

  return {
    user_id: userId,
    provider: "strava",
    provider_activity_id: String(activity.id),
    name: activity.name ?? "Activité Strava",
    sport_type: activity.sport_type ?? activity.type ?? "Unknown",
    start_date: activity.start_date,
    timezone: activity.timezone ?? null,
    duration_sec: activity.elapsed_time ?? 0,
    moving_time_sec: activity.moving_time ?? 0,
    distance_m: activity.distance ?? 0,
    elevation_gain_m: activity.total_elevation_gain ?? 0,
    average_speed: activity.average_speed ?? null,
    max_speed: activity.max_speed ?? null,
    average_heartrate: roundInt(activity.average_heartrate),
    max_heartrate: roundInt(activity.max_heartrate),
    average_cadence: roundInt(activity.average_cadence),
    average_power: roundInt(activity.average_watts),
    calories: roundInt(activity.calories ?? activity.kilojoules),
    raw_data_json: activity as unknown as Json,
    source: "strava",
  }
}

async function getLatestKnownEpoch(userId: string): Promise<number | undefined> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("activities")
    .select("start_date")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.start_date) return undefined
  return Math.max(0, Math.floor(new Date(data.start_date).getTime() / 1000) - 1)
}

async function upsertActivity(userId: string, activity: StravaActivity): Promise<string | null> {
  const row = mapActivity(userId, activity)
  if (!row) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("activities")
    .upsert(row, { onConflict: "user_id,provider,provider_activity_id" })
    .select("id")
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

async function postProcessImportedActivities(userId: string, activityIds: string[]): Promise<void> {
  for (const activityId of activityIds.slice(0, 10)) {
    try {
      await computeIntensityForActivity(userId, activityId)
    } catch (e) {
      console.warn("intensity compute failed", activityId, e)
    }
  }

  await recomputeDailyMetricsForUser(userId, { days: 120 })
}

async function updateLastSyncAt(userId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("provider_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "strava")
}

async function doSync(
  userId: string,
  token: string,
  perPage: number,
  maxPages: number,
  after?: number,
): Promise<StravaSyncResult> {
  let imported = 0
  let skipped = 0
  let lastError: unknown
  const importedIds: string[] = []

  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(token, page, perPage, after)
    if (items.length === 0) break

    for (const item of items) {
      try {
        const activityId = await upsertActivity(userId, item)
        if (activityId) {
          imported += 1
          importedIds.push(activityId)
        } else {
          skipped += 1
        }
      } catch (error) {
        console.error("strava activity import failed", item.id, error)
        lastError = error
        skipped += 1
      }
    }

    if (items.length < perPage) break
  }

  await updateLastSyncAt(userId)
  await postProcessImportedActivities(userId, importedIds)

  if (imported === 0 && skipped > 0) {
    const detail = lastError instanceof Error ? ` (${lastError.message})` : ""
    throw new Error(`Aucune activité Strava n'a pu être importée${detail}`)
  }

  return { imported, skipped }
}

export async function syncRecentStrava(
  userId: string,
  opts?: { perPage?: number; maxPages?: number },
): Promise<StravaSyncResult> {
  const token = await ensureValidStravaToken(userId)
  const after = await getLatestKnownEpoch(userId)
  return doSync(userId, token, opts?.perPage ?? 30, opts?.maxPages ?? 3, after)
}

export async function importStravaHistory(
  userId: string,
  days: number = 90,
): Promise<StravaSyncResult> {
  const token = await ensureValidStravaToken(userId)
  const after = Math.floor((Date.now() - days * 86_400_000) / 1000)
  return doSync(userId, token, 100, 10, after)
}

export async function importAllStravaHistory(userId: string): Promise<StravaSyncResult> {
  const token = await ensureValidStravaToken(userId)
  return doSync(userId, token, 200, 100)
}

export async function syncSingleStravaActivity(
  userId: string,
  stravaActivityId: number,
): Promise<StravaSyncResult> {
  const token = await ensureValidStravaToken(userId)
  const activity = await fetchActivity(token, stravaActivityId)
  const activityId = await upsertActivity(userId, activity)
  await updateLastSyncAt(userId)
  await postProcessImportedActivities(userId, activityId ? [activityId] : [])

  return { imported: activityId ? 1 : 0, skipped: activityId ? 0 : 1 }
}

export async function deleteStravaActivity(
  userId: string,
  stravaActivityId: number,
): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("activities")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "strava")
    .eq("provider_activity_id", String(stravaActivityId))

  if (error) throw error

  await updateLastSyncAt(userId)
  await recomputeDailyMetricsForUser(userId, { days: 120 })
}
