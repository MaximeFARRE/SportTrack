"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function createActivity(
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const sportType = formData.get("sport_type") as string
  const name = (formData.get("name") as string).trim() || null
  const date = formData.get("date") as string
  const time = formData.get("time") as string
  const hours = parseInt((formData.get("hours") as string) || "0", 10)
  const minutes = parseInt((formData.get("minutes") as string) || "0", 10)
  const distanceKm = parseFloat((formData.get("distance_km") as string) || "0")

  if (!sportType) return { error: "Veuillez sélectionner un sport" }

  const durationSec = (isNaN(hours) ? 0 : hours) * 3600 + (isNaN(minutes) ? 0 : minutes) * 60
  if (durationSec <= 0) return { error: "Veuillez indiquer une durée" }

  const startDate = new Date(`${date}T${time || "00:00"}:00`).toISOString()

  const { error } = await supabase.from("activities").insert({
    user_id: user.id,
    provider: "manual",
    provider_activity_id: crypto.randomUUID(),
    source: "manual",
    name,
    sport_type: sportType,
    start_date: startDate,
    duration_sec: durationSec,
    distance_m: distanceKm > 0 ? Math.round(distanceKm * 1000) : null,
  })

  if (error) return { error: error.message }

  redirect("/activities")
}
