import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { StravaCard } from "./connections-client"

export const metadata: Metadata = { title: "Mes connexions · SportTrack" }

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: stravaConn }, { count: activitiesCount }] = await Promise.all([
    supabase
      .from("provider_connections")
      .select("provider_user_id,last_sync_at,is_active")
      .eq("user_id", user!.id)
      .eq("provider", "strava")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("provider", "strava"),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mes connexions</h1>
        <p className="text-sm text-muted-foreground">
          Connectez vos appareils et plateformes pour importer vos activités automatiquement.
        </p>
      </div>

      <StravaCard
        connected={!!stravaConn}
        providerUserId={stravaConn?.provider_user_id}
        lastSyncAt={stravaConn?.last_sync_at}
        activitiesCount={activitiesCount ?? 0}
      />
    </div>
  )
}
