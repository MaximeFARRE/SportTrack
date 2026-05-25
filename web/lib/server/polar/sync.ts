import { createServiceClient } from "@/lib/supabase/service"

async function callPolarApi(endpoint: string, accessToken: string) {
  const url = `https://www.polaraccesslink.com${endpoint}`
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Polar API error: ${res.status} for ${endpoint}`)
  }
  return res.json()
}

export async function syncPolarMetrics(userId: string, days = 30): Promise<number> {
  const supabase = createServiceClient()

  // 1. Get user Polar connection
  const { data: conn, error: connError } = await supabase
    .from("provider_connections")
    .select("access_token, provider_user_id")
    .eq("user_id", userId)
    .eq("provider", "polar")
    .eq("is_active", true)
    .maybeSingle()

  if (connError || !conn?.access_token) {
    console.warn(`Polar connection not active or missing for user ${userId}`)
    return 0
  }

  const { access_token } = conn

  // 2. Fetch list of sleep and nightly recharge dates
  const sleepList = await callPolarApi("/v3/users/sleep", access_token)
  const rechargeList = await callPolarApi("/v3/users/nightly-recharge", access_token)

  // 3. Filter dates to range (last 'days')
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split("T")[0] // "YYYY-MM-DD"

  const sleepDates = ((sleepList?.["available-sleep-data"] || []) as string[]).filter(
    (d) => d >= cutoffStr
  )
  const rechargeDates = ((rechargeList?.["available-nightly-recharge-data"] || []) as string[]).filter(
    (d) => d >= cutoffStr
  )

  // 4. Fetch details in parallel
  const sleepDetails = await Promise.all(
    sleepDates.map(async (date) => {
      try {
        const data = await callPolarApi(`/v3/users/sleep/${date}`, access_token)
        return { date, data }
      } catch (e) {
        console.error(`Error fetching Polar sleep for ${date}:`, e)
        return { date, data: null }
      }
    })
  )

  const rechargeDetails = await Promise.all(
    rechargeDates.map(async (date) => {
      try {
        const data = await callPolarApi(`/v3/users/nightly-recharge/${date}`, access_token)
        return { date, data }
      } catch (e) {
        console.error(`Error fetching Polar recharge for ${date}:`, e)
        return { date, data: null }
      }
    })
  )

  // 5. Combine and map metrics
  const metricsByDate: Record<
    string,
    {
      sleep_score?: number | null
      sleep_duration_min?: number | null
      resting_hr?: number | null
      hrv_rmssd?: number | null
    }
  > = {}

  for (const s of sleepDetails) {
    if (!s.data) continue
    if (!metricsByDate[s.date]) metricsByDate[s.date] = {}
    metricsByDate[s.date].sleep_score = s.data.sleep_score ?? null
    if (s.data.sleep_start_time && s.data.sleep_end_time) {
      const start = new Date(s.data.sleep_start_time).getTime()
      const end = new Date(s.data.sleep_end_time).getTime()
      metricsByDate[s.date].sleep_duration_min = Math.round((end - start) / 60000)
    }
  }

  for (const r of rechargeDetails) {
    if (!r.data) continue
    if (!metricsByDate[r.date]) metricsByDate[r.date] = {}
    metricsByDate[r.date].resting_hr = r.data.heart_rate_avg ?? null
    metricsByDate[r.date].hrv_rmssd = r.data.heart_rate_variability_avg ?? null
  }

  const rows = Object.entries(metricsByDate).map(([date, m]) => ({
    user_id: userId,
    metric_date: date,
    sleep_score: m.sleep_score ?? null,
    sleep_duration_min: m.sleep_duration_min ?? null,
    resting_hr: m.resting_hr ?? null,
    hrv_rmssd: m.hrv_rmssd ?? null,
  }))

  // 6. Upsert into daily_metrics
  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("daily_metrics")
      .upsert(rows, { onConflict: "user_id,metric_date" })

    if (upsertError) throw upsertError
  }

  // 7. Update last sync time
  await supabase
    .from("provider_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "polar")

  return rows.length
}

export async function getActivePolarUserIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("provider_connections")
    .select("user_id")
    .eq("provider", "polar")
    .eq("is_active", true)

  if (error) throw error

  const ids = new Set<string>()
  for (const row of data ?? []) {
    ids.add(row.user_id)
  }
  return Array.from(ids)
}
