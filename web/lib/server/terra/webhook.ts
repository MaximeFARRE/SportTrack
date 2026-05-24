import { createServiceClient } from "@/lib/supabase/service"

type TerraPayload = {
  type?: "auth" | "daily" | "sleep" | "activity" | "body" | string
  reference_id?: string | null
  user?: {
    user_id?: string | null
    reference_id?: string | null
    provider?: string | null
  } | null
  data?: Record<string, unknown>[] | null
}

type MetricFields = Record<string, number | string | null | undefined>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function roundedNumber(value: unknown): number | null {
  const numeric = numberValue(value)
  return numeric == null ? null : Math.round(numeric)
}

function metricDateFromMetadata(entry: Record<string, unknown>, fallback: "start" | "end" = "start"): string | null {
  const metadata = asRecord(entry.metadata)
  const start = typeof metadata.start_time === "string" ? metadata.start_time : ""
  const end = typeof metadata.end_time === "string" ? metadata.end_time : ""
  const value = fallback === "start" ? start || end : end || start
  return value ? value.slice(0, 10) : null
}

export function normalizeTerraDaily(entry: Record<string, unknown>): MetricFields & {
  metric_date: string | null
} {
  const heartRateSummary = asRecord(asRecord(entry.heart_rate_data).summary)
  const hrvSummary = asRecord(asRecord(entry.hrv_data).summary)
  const stress = asRecord(entry.stress_data)
  const oxygen = asRecord(entry.oxygen_data)
  const respiration = asRecord(asRecord(entry.respiration_data).breaths_data)
  const vo2max = asRecord(entry.vo2max_data)

  return {
    metric_date: metricDateFromMetadata(entry),
    resting_hr: roundedNumber(heartRateSummary.resting_hr_bpm),
    hrv_rmssd:
      numberValue(hrvSummary.rmssd_sdnn) ?? numberValue(hrvSummary.avg_rmssd_ms),
    stress_score_avg: roundedNumber(stress.avg_stress_level),
    spo2_avg: numberValue(oxygen.avg_saturation_percentage),
    respiration_avg: numberValue(respiration.avg_breaths_per_min),
    vo2max_estimated: numberValue(vo2max.vo2max_ml_per_min_per_kg),
  }
}

export function normalizeTerraSleep(entry: Record<string, unknown>): MetricFields & {
  metric_date: string | null
} {
  const durations = asRecord(entry.sleep_durations_data)
  const readiness = asRecord(entry.readiness_data)
  const scoreRaw = numberValue(readiness.readiness_score_percentage)

  const awakeSec = numberValue(asRecord(durations.awake).duration_awake_state_seconds)
  const lightSec = numberValue(asRecord(durations.light_sleep).duration_light_sleep_state_seconds)
  const deepSec = numberValue(asRecord(durations.deep_sleep).duration_deep_sleep_state_seconds)
  const remSec = numberValue(asRecord(durations.rem_sleep).duration_REM_sleep_state_seconds)
  const parts: Array<number | null> = [awakeSec, lightSec, deepSec, remSec]
  const totalSec = parts.reduce<number>((sum, value) => sum + (value ?? 0), 0)

  return {
    metric_date: metricDateFromMetadata(entry),
    sleep_score: scoreRaw == null ? null : Math.round(scoreRaw <= 1 ? scoreRaw * 100 : scoreRaw),
    sleep_duration_min: parts.some((value) => value != null) ? Math.round(totalSec / 60) : null,
    sleep_awake_min: awakeSec == null ? null : Math.round(awakeSec / 60),
    sleep_light_min: lightSec == null ? null : Math.round(lightSec / 60),
    sleep_deep_min: deepSec == null ? null : Math.round(deepSec / 60),
    sleep_rem_min: remSec == null ? null : Math.round(remSec / 60),
  }
}

async function resolveUserId(providerUserId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("provider_connections")
    .select("user_id")
    .eq("provider", "terra")
    .eq("provider_user_id", providerUserId)
    .eq("is_active", true)
    .maybeSingle()

  return data?.user_id ?? null
}

async function upsertMetric(userId: string, row: MetricFields & { metric_date: string | null }): Promise<boolean> {
  const { metric_date, ...fields } = row
  if (!metric_date) return false

  const updateFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value != null),
  )
  if (Object.keys(updateFields).length === 0) return false

  const supabase = createServiceClient()
  const { error } = await supabase.from("daily_metrics").upsert(
    {
      user_id: userId,
      metric_date,
      ...updateFields,
    },
    { onConflict: "user_id,metric_date" },
  )

  if (error) throw error
  return true
}

async function processMetricPayload(
  providerUserId: string,
  entries: Record<string, unknown>[],
  normalize: (entry: Record<string, unknown>) => MetricFields & { metric_date: string | null },
): Promise<number> {
  const userId = await resolveUserId(providerUserId)
  if (!userId) return 0

  let upserted = 0
  for (const entry of entries) {
    if (await upsertMetric(userId, normalize(entry))) {
      upserted += 1
    }
  }
  return upserted
}

export async function processTerraWebhook(
  payload: TerraPayload,
): Promise<{ connected?: boolean; upserted?: number; skipped?: boolean }> {
  if (!payload?.type || !payload.user) return { skipped: true }

  const providerUserId = payload.user.user_id
  if (!providerUserId) return { skipped: true }

  if (payload.type === "auth") {
    const userId = payload.reference_id ?? payload.user.reference_id
    if (!userId) return { skipped: true }

    const supabase = createServiceClient()
    const { error } = await supabase.from("provider_connections").upsert(
      {
        user_id: userId,
        provider: "terra",
        provider_user_id: providerUserId,
        is_active: true,
      },
      { onConflict: "user_id,provider" },
    )
    if (error) throw error
    return { connected: true }
  }

  const entries = payload.data ?? []
  if (payload.type === "daily") {
    return { upserted: await processMetricPayload(providerUserId, entries, normalizeTerraDaily) }
  }
  if (payload.type === "sleep") {
    return { upserted: await processMetricPayload(providerUserId, entries, normalizeTerraSleep) }
  }

  return { skipped: true }
}
