"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export async function syncStrava(): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { error: "Non authentifié" }

  const fastapiUrl = process.env.FASTAPI_URL!
  let res: Response
  try {
    res = await fetch(`${fastapiUrl}/strava/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    return { error: "Impossible de joindre le serveur" }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { error: (body as { detail?: string }).detail ?? "Synchronisation échouée" }
  }

  revalidatePath("/connections")
  return (await res.json()) as { synced: number }
}

export async function syncStravaHistory(
  days: number = 90,
): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { error: "Non authentifié" }

  const fastapiUrl = process.env.FASTAPI_URL!
  let res: Response
  try {
    res = await fetch(`${fastapiUrl}/strava/sync/history?days=${days}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    return { error: "Impossible de joindre le serveur" }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { error: (body as { detail?: string }).detail ?? "Import historique échoué" }
  }

  revalidatePath("/connections")
  return (await res.json()) as { synced: number }
}

export async function disconnectTerra(): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("provider_connections")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("provider", "terra")

  if (error) return { error: error.message }

  revalidatePath("/connections")
  return { success: true }
}

export async function disconnectStrava(): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("provider_connections")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("provider", "strava")

  if (error) return { error: error.message }

  revalidatePath("/connections")
  return { success: true }
}
