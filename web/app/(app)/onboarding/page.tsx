import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { OnboardingWizard } from "./onboarding-wizard"

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("first_name, last_name, primary_sport, hr_max")
    .eq("user_id", user.id)
    .maybeSingle()

  return <OnboardingWizard initialProfile={profile} />
}
