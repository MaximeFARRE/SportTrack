"use server"

import { revalidatePath } from "next/cache"

import { syncGarminMetrics } from "@/lib/server/garmin/sync"
import { importAllStravaHistory, importStravaHistory, syncRecentStrava } from "@/lib/server/strava/sync"
import { createClient } from "@/lib/supabase/server"

export async function syncStrava(): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const { imported } = await syncRecentStrava(user.id)
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced: imported }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Synchronisation échouée" }
  }
}

export async function syncStravaHistory(
  days: number = 90,
): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const { imported } = await importStravaHistory(user.id, days)
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced: imported }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import historique échoué" }
  }
}

export async function syncAllStravaHistory(): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const { imported } = await importAllStravaHistory(user.id)
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced: imported }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import complet échoué" }
  }
}

export async function syncGarminHistory(days = 30): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const synced = await syncGarminMetrics(user.id, days)
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Synchronisation Garmin échouée" }
  }
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

export async function disconnectPolar(): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("provider_connections")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("provider", "polar")

  if (error) return { error: error.message }

  revalidatePath("/connections")
  return { success: true }
}

export async function syncPolarHistory(days = 30): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const { syncPolarMetrics } = await import("@/lib/server/polar/sync")
    const synced = await syncPolarMetrics(user.id, days)
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Synchronisation Polar échouée" }
  }
}
