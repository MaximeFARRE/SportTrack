import { createServiceClient } from "@/lib/supabase/service"
import type { Json } from "@/lib/types/database"

import { ensureValidStravaToken } from "./tokens"

const STREAMS_URL = "https://www.strava.com/api/v3/activities/{id}/streams"

type ZoneRow = {
  zone_number: number
  zone_name: string
  hr_min: number
  hr_max: number | null
  color_hex: string
}

type ZoneJsonEntry = {
  zone: number
  name: string
  color: string
  sec: number
}

export async function computeIntensityForActivity(
  userId: string,
  activityId: string,
): Promise<ZoneJsonEntry[] | null> {
  const supabase = createServiceClient()
  const { data: activity } = await supabase
    .from("activities")
    .select("provider, provider_activity_id")
    .eq("id", activityId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!activity || activity.provider !== "strava" || !activity.provider_activity_id) {
    return null
  }

  let token: string
  try {
    token = await ensureValidStravaToken(userId)
  } catch {
    return null
  }

  const url =
    STREAMS_URL.replace("{id}", activity.provider_activity_id) +
    "?keys=heartrate&key_by_type=true"
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null

  const payload = (await res.json()) as { heartrate?: { data?: number[] } }
  const heartrates = payload.heartrate?.data
  if (!Array.isArray(heartrates) || heartrates.length === 0) return null

  const { data: zones } = await supabase
    .from("hr_zones")
    .select("zone_number, zone_name, hr_min, hr_max, color_hex")
    .eq("user_id", userId)
    .order("zone_number")

  if (!zones || zones.length === 0) return null

  const sorted = (zones as ZoneRow[]).sort((a, b) => a.zone_number - b.zone_number)
  const counts: Record<number, number> = Object.fromEntries(
    sorted.map((zone) => [zone.zone_number, 0]),
  )

  for (const bpm of heartrates) {
    for (const zone of sorted) {
      if ((zone.hr_max == null || bpm < zone.hr_max) && bpm >= zone.hr_min) {
        counts[zone.zone_number] += 1
        break
      }
    }
  }

  const zonesJson: ZoneJsonEntry[] = sorted.map((zone) => ({
    zone: zone.zone_number,
    name: zone.zone_name,
    color: zone.color_hex,
    sec: counts[zone.zone_number] ?? 0,
  }))

  await supabase
    .from("activities")
    .update({ time_in_zones_json: zonesJson as unknown as Json })
    .eq("id", activityId)
    .eq("user_id", userId)

  return zonesJson
}
