"use server"

import { revalidatePath } from "next/cache"

import { importAllStravaHistory } from "@/lib/server/strava/sync"
import { createClient } from "@/lib/supabase/server"

export async function refreshProgressionHistory(): Promise<{ synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  try {
    const { imported } = await importAllStravaHistory(user.id)
    revalidatePath("/progression")
    revalidatePath("/dashboard")
    revalidatePath("/activities")
    return { synced: imported }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import historique échoué" }
  }
}
