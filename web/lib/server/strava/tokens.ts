import { createServiceClient } from "@/lib/supabase/service"

const TOKEN_URL = "https://www.strava.com/oauth/token"
const REFRESH_BUFFER_SEC = 10 * 60

export type StravaTokenPayload = {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string; lastname?: string; profile?: string }
  scope?: string
}

async function getStravaAppCredentials(): Promise<{
  client_id: string
  client_secret: string
}> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("strava_config")
    .select("client_id, client_secret")
    .eq("id", 1)
    .maybeSingle()

  if (error || !data?.client_id || !data?.client_secret) {
    throw new Error("Strava config absente — la renseigner dans /settings/strava")
  }

  return { client_id: data.client_id, client_secret: data.client_secret }
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenPayload> {
  const { client_id, client_secret } = await getStravaAppCredentials()
  const body = new URLSearchParams({
    client_id,
    client_secret,
    code,
    grant_type: "authorization_code",
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) throw new Error(`Strava exchange failed: ${res.status}`)
  return res.json()
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<StravaTokenPayload> {
  const { client_id, client_secret } = await getStravaAppCredentials()
  const body = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) throw new Error(`Strava refresh failed: ${res.status}`)
  return res.json()
}

export async function upsertStravaConnection(
  userId: string,
  payload: StravaTokenPayload,
): Promise<void> {
  if (!payload.athlete?.id) throw new Error("Strava athlete id manquant")

  const supabase = createServiceClient()
  const scopes = payload.scope
    ? payload.scope.split(",").map((scope) => scope.trim()).filter(Boolean)
    : []

  const { error } = await supabase.from("provider_connections").upsert(
    {
      user_id: userId,
      provider: "strava",
      provider_user_id: String(payload.athlete.id),
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_expires_at: payload.expires_at,
      scopes,
      is_active: true,
    },
    { onConflict: "user_id,provider" },
  )

  if (error) throw error
}

export async function ensureValidStravaToken(userId: string): Promise<string> {
  const supabase = createServiceClient()
  const { data: conn, error } = await supabase
    .from("provider_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .eq("is_active", true)
    .maybeSingle()

  if (error || !conn?.access_token) throw new Error("Strava non connecté")

  const nowTs = Math.floor(Date.now() / 1000)
  if ((conn.token_expires_at ?? 0) > nowTs + REFRESH_BUFFER_SEC) {
    return conn.access_token
  }

  if (!conn.refresh_token) throw new Error("Refresh token Strava manquant")

  const refreshed = await refreshAccessToken(conn.refresh_token)
  await supabase
    .from("provider_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: refreshed.expires_at,
    })
    .eq("user_id", userId)
    .eq("provider", "strava")

  return refreshed.access_token
}
