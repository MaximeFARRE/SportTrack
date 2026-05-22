"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const firstName = (formData.get("first_name") as string | null)?.trim() || null
  const lastName = (formData.get("last_name") as string | null)?.trim() || null
  const primarySport = (formData.get("primary_sport") as string | null) || null
  const hrMaxRaw = formData.get("hr_max")
  const hrMax = hrMaxRaw ? Number(hrMaxRaw) : null

  await supabase.from("athlete_profiles").upsert(
    { user_id: user.id, first_name: firstName, last_name: lastName, primary_sport: primarySport, hr_max: hrMax },
    { onConflict: "user_id" },
  )

  if (hrMax && hrMax >= 100 && hrMax <= 230) {
    const fastapiUrl = process.env.FASTAPI_URL ?? "http://localhost:8000"
    await fetch(`${fastapiUrl}/internal/regenerate-zones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ user_id: user.id, hr_max: hrMax }),
    }).catch(() => {})
  }

  redirect("/dashboard")
}
