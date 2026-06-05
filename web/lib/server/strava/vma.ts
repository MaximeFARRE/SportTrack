import { bestStreamEfforts, type VmaActivity, type VmaStreamEffort } from "@/lib/compute/vma-estimate"

const STREAMS_URL = "https://www.strava.com/api/v3/activities/{id}/streams"

type VmaStravaActivity = VmaActivity & {
  provider: string
  provider_activity_id: string | null
}

type StreamPayload = {
  time?: { data?: number[] }
  distance?: { data?: number[] }
  velocity_smooth?: { data?: number[] }
  heartrate?: { data?: number[] }
  altitude?: { data?: number[] }
}

function isClassicRun(sportType: string): boolean {
  const normalized = sportType.trim().toLowerCase()
  return normalized === "run" || normalized === "running"
}

function candidateActivities(activities: VmaStravaActivity[]): VmaStravaActivity[] {
  return activities
    .filter((activity) => activity.provider === "strava" && activity.provider_activity_id && isClassicRun(activity.sport_type))
    .filter((activity) => {
      const distanceKm = (activity.distance_m ?? 0) / 1000
      const durationSec = activity.moving_time_sec && activity.moving_time_sec > 0 ? activity.moving_time_sec : activity.duration_sec ?? 0
      const elevationPerKm = distanceKm > 0 ? (activity.elevation_gain_m ?? 0) / distanceKm : 999
      return distanceKm >= 2 && durationSec >= 600 && elevationPerKm <= 35
    })
    .sort((a, b) => {
      const score = (activity: VmaStravaActivity) => {
        const avgSpeed = ((activity.distance_m ?? 0) / Math.max(1, activity.moving_time_sec ?? activity.duration_sec ?? 1)) * 3.6
        const maxSpeed = (activity.max_speed ?? 0) * 3.6
        const hrScore = Math.max(activity.max_heartrate ?? 0, activity.average_heartrate ?? 0) / 10
        const daysAgo = Math.max(0, (Date.now() - new Date(activity.start_date).getTime()) / 86_400_000)
        const recency = Math.max(0, 4 - daysAgo / 180)
        return Math.max(avgSpeed, maxSpeed * 0.82) + hrScore + recency
      }
      return score(b) - score(a)
    })
    .slice(0, 12)
}

async function fetchStreams(token: string, providerActivityId: string): Promise<StreamPayload | null> {
  const url =
    STREAMS_URL.replace("{id}", providerActivityId) +
    "?keys=time,distance,velocity_smooth,heartrate,altitude&key_by_type=true"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as StreamPayload
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function getVmaStreamEfforts(
  token: string,
  activities: VmaStravaActivity[],
): Promise<VmaStreamEffort[]> {
  const results = await Promise.all(candidateActivities(activities).map(async (activity) => {
    const payload = await fetchStreams(token, activity.provider_activity_id as string)
    const time = payload?.time?.data
    const distance = payload?.distance?.data
    if (!time || !distance || time.length !== distance.length) return []

    return bestStreamEfforts({
      time,
      distance,
      velocity: payload?.velocity_smooth?.data,
      heartrate: payload?.heartrate?.data,
      altitude: payload?.altitude?.data,
      date: activity.start_date,
    })
  }))
  return results.flat()
}
