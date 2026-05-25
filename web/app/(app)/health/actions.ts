"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type InjuryFormState = { error?: string }

export async function createInjury(formData: FormData): Promise<InjuryFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const bodyZone = (formData.get("body_zone") as string).trim()
  const injuryType = (formData.get("injury_type") as string) || null
  const severityRaw = formData.get("severity") as string
  const severity = severityRaw ? parseInt(severityRaw, 10) : null
  const startDate = formData.get("start_date") as string
  const endDate = (formData.get("end_date") as string) || null
  const description = (formData.get("description") as string).trim() || null
  const treatment = (formData.get("treatment") as string).trim() || null

  if (!bodyZone) return { error: "La zone corporelle est requise" }
  if (!startDate) return { error: "La date de début est requise" }

  const { error } = await supabase.from("injuries").insert({
    user_id: user.id,
    body_zone: bodyZone,
    injury_type: injuryType as "muscular" | "tendinous" | "bone" | "ligament" | "other" | null,
    severity,
    start_date: startDate,
    end_date: endDate,
    description,
    treatment,
  })

  if (error) return { error: error.message }

  revalidatePath("/health")
  return {}
}

export async function updateInjuryEndDate(
  injuryId: string,
  endDate: string,
): Promise<InjuryFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("injuries")
    .update({ end_date: endDate })
    .eq("id", injuryId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/health")
  return {}
}

export async function deleteInjury(injuryId: string): Promise<InjuryFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("injuries")
    .delete()
    .eq("id", injuryId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/health")
  return {}
}
