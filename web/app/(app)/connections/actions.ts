"use server"

import { revalidatePath } from "next/cache"

import { importStravaHistory, syncRecentStrava } from "@/lib/server/strava/sync"
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
