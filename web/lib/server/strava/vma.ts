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
      const speedA = (a.distance_m ?? 0) / Math.max(1, a.moving_time_sec ?? a.duration_sec ?? 1)
      const speedB = (b.distance_m ?? 0) / Math.max(1, b.moving_time_sec ?? b.duration_sec ?? 1)
      return speedB - speedA
    })
    .slice(0, 6)
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
  const efforts: VmaStreamEffort[] = []
  for (const activity of candidateActivities(activities)) {
    const payload = await fetchStreams(token, activity.provider_activity_id as string)
    const time = payload?.time?.data
    const distance = payload?.distance?.data
    if (!time || !distance || time.length !== distance.length) continue

    efforts.push(
      ...bestStreamEfforts({
        time,
        distance,
        velocity: payload?.velocity_smooth?.data,
        heartrate: payload?.heartrate?.data,
        altitude: payload?.altitude?.data,
        date: activity.start_date,
      }),
    )
  }
  return efforts
}
