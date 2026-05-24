"use server"

import { randomBytes } from "crypto"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export interface StravaConfigData {
  client_id: string
  client_secret: string
}

function formatStravaError(json: Record<string, unknown>, status: number): string {
  const errors = Array.isArray(json.errors)
    ? json.errors
        .map((error) => {
          if (!error || typeof error !== "object") return null
          const { resource, field, code } = error as Record<string, unknown>
          return [resource, field, code].filter(Boolean).join(" ")
        })
        .filter(Boolean)
    : []

  if (errors.length > 0) return errors.join(", ")
  return (json.message as string | undefined) ?? `Erreur ${status}`
}

function isExistingSubscriptionError(json: Record<string, unknown>): boolean {
  return JSON.stringify(json).toLowerCase().includes("already exists")
}

async function requireAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/dashboard")
}

export async function getStravaConfig(): Promise<StravaConfigData> {
  await requireAdmin()
  const service = createServiceClient()
  const { data } = await service
    .from("strava_config")
    .select("client_id, client_secret, webhook_verify_token")
    .eq("id", 1)
    .single()

  return {
    client_id: data?.client_id ?? "",
    client_secret: data?.client_secret ?? "",
  }
}

export async function saveStravaConfig(
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin()
  const client_id = (formData.get("client_id") as string | null)?.trim() ?? ""
  const client_secret = (formData.get("client_secret") as string | null)?.trim() ?? ""

  const service = createServiceClient()
  const { data: current } = await service
    .from("strava_config")
    .select("webhook_verify_token")
    .eq("id", 1)
    .maybeSingle()

  const webhook_verify_token = current?.webhook_verify_token || randomBytes(32).toString("hex")

  const { error } = await service
    .from("strava_config")
    .upsert({ id: 1, client_id, client_secret, webhook_verify_token }, { onConflict: "id" })

  if (error) return { error: error.message }
  return {}
}

export async function registerStravaWebhook(): Promise<{ ok?: boolean; error?: string; subscription_id?: number }> {
  await requireAdmin()

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
  if (!baseUrl) return { error: "NEXT_PUBLIC_BASE_URL non configuré" }

  const service = createServiceClient()
  const { data: cfg } = await service
    .from("strava_config")
    .select("client_id, client_secret, webhook_verify_token")
    .eq("id", 1)
    .single()

  if (!cfg?.client_id || !cfg?.client_secret) {
    return { error: "Enregistre d'abord le Client ID et Client Secret." }
  }
  if (!cfg.webhook_verify_token) {
    return { error: "Enregistre d'abord les identifiants Strava." }
  }

  const body = new URLSearchParams({
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    callback_url: `${baseUrl}/api/strava/webhook`,
    verify_token: cfg.webhook_verify_token,
  })

  let res: Response
  try {
    res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
  } catch {
    return { error: "Impossible de joindre l'API Strava." }
  }

  const json = await res.json().catch(() => ({})) as Record<string, unknown>

  if (!res.ok) {
    if (res.status === 400 && isExistingSubscriptionError(json)) {
      return { ok: true }
    }
    return { error: formatStravaError(json, res.status) }
  }

  return { ok: true, subscription_id: json.id as number | undefined }
}
