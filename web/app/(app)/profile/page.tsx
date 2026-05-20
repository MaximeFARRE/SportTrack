import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { ProfileForm } from "./profile-form"

export const metadata: Metadata = { title: "Mon profil · SportTrack" }

export default async function ProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: profile }, { data: zones }] = await Promise.all([
    supabase
      .from("athlete_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("hr_zones")
      .select("*")
      .eq("user_id", user!.id)
      .order("zone_number"),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mon profil sportif</h1>
        <p className="text-sm text-muted-foreground">
          Ces données sont utilisées pour calculer vos zones d&apos;intensité et vos métriques d&apos;entraînement.
        </p>
      </div>
      <ProfileForm profile={profile} zones={zones ?? []} />
    </div>
  )
}
