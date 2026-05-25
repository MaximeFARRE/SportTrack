"use server"

import { revalidatePath } from "next/cache"

import { syncGarminMetrics, testGarminConnection } from "@/lib/server/garmin/sync"
import { createClient } from "@/lib/supabase/server"

export async function connectGarmin(
  formData: FormData,
): Promise<{ connected?: boolean; synced?: number; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const email = (formData.get("email") as string | null)?.trim() ?? ""
  const password = (formData.get("password") as string | null)?.trim() ?? ""
  const mfaCode = (formData.get("mfa_code") as string | null)?.trim() ?? ""

  if (!email || !password) return { error: "Email et mot de passe Garmin requis." }

  try {
    await testGarminConnection(user.id, { email, password, mfaCode })
    const synced = await syncGarminMetrics(user.id, 30)
    revalidatePath("/settings")
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { connected: true, synced }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connexion Garmin échouée" }
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
    revalidatePath("/settings")
    revalidatePath("/connections")
    revalidatePath("/dashboard")
    return { synced }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Synchronisation Garmin échouée" }
  }
}
