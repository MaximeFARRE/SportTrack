import { spawn } from "child_process"
import path from "path"

import { createServiceClient } from "@/lib/supabase/service"
import type { Json } from "@/lib/types/database"

type GarminMetric = {
  metric_date: string
  resting_hr?: number | null
  stress_score_avg?: number | null
  body_battery_morning?: number | null
  body_battery_evening?: number | null
  sleep_duration_min?: number | null
}

type GarminScriptResult = {
  ok: boolean
  error?: string
  provider_user_id?: string
  metrics?: GarminMetric[]
  token_data?: Json
}

function getDeploymentBaseUrl(): string | null {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_BASE_URL ?? null
}

async function runGarminBridge(payload: Record<string, unknown>): Promise<GarminScriptResult> {
  const baseUrl = getDeploymentBaseUrl()
  if (baseUrl && process.env.NODE_ENV === "production") {
    const secret = process.env.GARMIN_BRIDGE_SECRET ?? process.env.INTERNAL_SECRET ?? ""
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/garmin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-garmin-bridge-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as GarminScriptResult
    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? `Garmin bridge failed: ${res.status}`)
    }
    return json
  }

  return runGarminScript(payload)
}

function runGarminScript(payload: Record<string, unknown>): Promise<GarminScriptResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py")
    const child = spawn("python3", [scriptPath], {
      env: {
        ...process.env,
        PYTHONPATH: path.join(process.cwd(), ".python"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      const parsed = JSON.parse(stdout || "{}") as GarminScriptResult
      if (code !== 0 || !parsed.ok) {
        reject(new Error(parsed.error || stderr || "Garmin sync failed"))
        return
      }
      resolve(parsed)
    })

    child.stdin.end(JSON.stringify(payload))
  })
}

async function getCredentials(userId: string): Promise<{
  email: string
  password: string
  token_data: Json | null
}> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("garmin_credentials")
    .select("email, password, token_data")
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data?.email || !data.password) {
    throw new Error("Identifiants Garmin manquants")
  }

  return data
}

async function updateTokenData(userId: string, tokenData: Json | undefined): Promise<void> {
  if (!tokenData) return

  const supabase = createServiceClient()
  const { error } = await supabase
    .from("garmin_credentials")
    .update({ token_data: tokenData })
    .eq("user_id", userId)

  if (error) throw error
}

export async function testGarminConnection(
  userId: string,
  opts: { email: string; password: string; mfaCode?: string },
): Promise<void> {
  const result = await runGarminBridge({
    command: "test",
    email: opts.email,
    password: opts.password,
    mfa_code: opts.mfaCode ?? "",
  })

  const supabase = createServiceClient()
  const providerUserId = result.provider_user_id ?? opts.email
  const [{ error: credentialError }, { error: connectionError }] = await Promise.all([
    supabase
      .from("garmin_credentials")
      .upsert(
        {
          user_id: userId,
          email: opts.email,
          password: opts.password,
          token_data: result.token_data,
        },
        { onConflict: "user_id" },
      ),
    supabase.from("provider_connections").upsert(
      {
        user_id: userId,
        provider: "garmin",
        provider_user_id: providerUserId,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    ),
  ])

  if (credentialError) throw credentialError
  if (connectionError) throw connectionError
}

export async function syncGarminMetrics(userId: string, days = 30): Promise<number> {
  const credentials = await getCredentials(userId)
  if (!credentials.token_data) {
    throw new Error("Reconnectez Garmin avant d'importer les données.")
  }

  const result = await runGarminBridge({
    command: "sync",
    email: credentials.email,
    password: credentials.password,
    token_data: credentials.token_data,
    days,
  })

  const metrics = result.metrics ?? []
  const rows = metrics
    .filter((metric) => metric.metric_date)
    .map((metric) => ({
      user_id: userId,
      metric_date: metric.metric_date,
      resting_hr: metric.resting_hr,
      stress_score_avg: metric.stress_score_avg,
      body_battery_morning: metric.body_battery_morning,
      body_battery_evening: metric.body_battery_evening,
      sleep_duration_min: metric.sleep_duration_min,
    }))

  const supabase = createServiceClient()
  await updateTokenData(userId, result.token_data)

  if (rows.length > 0) {
    const { error } = await supabase
      .from("daily_metrics")
      .upsert(rows, { onConflict: "user_id,metric_date" })
    if (error) throw error
  }

  await supabase
    .from("provider_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "garmin")

  return rows.length
}

export async function getActiveGarminUserIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("provider_connections")
    .select("user_id")
    .eq("provider", "garmin")
    .eq("is_active", true)

  if (error) throw error

  const ids = new Set<string>()
  for (const row of data ?? []) {
    ids.add(row.user_id)
  }
  return Array.from(ids)
}
