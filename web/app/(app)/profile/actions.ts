"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const SPORTS = ["running", "cycling", "swimming", "triathlon", "trail", "other"] as const

const profileSchema = z.object({
  first_name: z.string().min(1, "Prénom requis").max(50),
  last_name: z.string().min(1, "Nom requis").max(50),
  birth_date: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  height_cm: z.coerce.number().min(100).max(250).optional().nullable(),
  weight_kg: z.coerce.number().min(30).max(200).optional().nullable(),
  hr_max: z.coerce.number().int().min(100).max(230).optional().nullable(),
  hr_rest: z.coerce.number().int().min(30).max(100).optional().nullable(),
  vma_kmh: z.coerce.number().min(5).max(25).optional().nullable(),
  ftp_watts: z.coerce.number().int().min(50).max(600).optional().nullable(),
  css_pace_per_100m: z.string().max(10).optional().nullable(),
  primary_sport: z.enum(SPORTS).optional().nullable(),
  practiced_sports: z.array(z.enum(SPORTS)).default([]),
  training_years: z.coerce.number().int().min(0).max(80).optional().nullable(),
  weekly_target_hours: z.coerce.number().min(0).max(50).optional().nullable(),
})

export type ProfileState = { error?: string; success?: boolean } | undefined

export async function upsertProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  // practiced_sports arrives as multiple values with the same key
  const raw = Object.fromEntries(formData)
  const practicedSports = formData.getAll("practiced_sports") as string[]

  const parsed = profileSchema.safeParse({ ...raw, practiced_sports: practicedSports })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" }
  }

  const { error } = await supabase
    .from("athlete_profiles")
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" })

  if (error) return { error: error.message }

  // Trigger zone regeneration on FastAPI when FC max is provided
  if (parsed.data.hr_max) {
    const fastapiUrl = process.env.FASTAPI_URL ?? "http://localhost:8000"
    const internalSecret = process.env.INTERNAL_SECRET ?? ""
    await fetch(`${fastapiUrl}/internal/regenerate-zones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ user_id: user.id, hr_max: parsed.data.hr_max }),
    }).catch(() => {
      // Non-blocking: zones will be stale but profile is saved
    })
  }

  revalidatePath("/profile")
  return { success: true }
}
