import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserGroups } from "@/lib/server/groups"
import { CoachingClient } from "./coaching-client"

export const metadata: Metadata = { title: "Coaching & Groupes · SportTrack" }

export default async function CoachingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const groups = await getUserGroups(supabase, user.id)

  return <CoachingClient initialGroups={groups} />
}
