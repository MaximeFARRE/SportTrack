import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { StravaCard, TerraCard } from "./connections-client"

export const metadata: Metadata = { title: "Mes connexions · SportTrack" }

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ strava?: string; terra?: string }>
}) {
  const { strava, terra } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: stravaConn }, { data: terraConn }, { count: activitiesCount }] =
    await Promise.all([
      supabase
        .from("provider_connections")
        .select("provider_user_id,last_sync_at,is_active")
        .eq("user_id", user!.id)
        .eq("provider", "strava")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("provider_connections")
        .select("provider_user_id,last_sync_at,is_active")
        .eq("user_id", user!.id)
        .eq("provider", "terra")
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

      {strava === "connected" ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Strava est connecté. Une première synchronisation vient d'être lancée ; utilisez
          "Importer 90 jours" si certaines activités anciennes manquent.
        </div>
      ) : null}

      {strava === "error" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          La connexion Strava a échoué. Vérifiez la configuration Strava puis réessayez.
        </div>
      ) : null}

      {terra === "connected" ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          L'appareil est connecté via Terra. Les données arriveront automatiquement via webhook.
        </div>
      ) : null}

      {terra === "error" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          La connexion Terra a échoué. Vérifiez la configuration puis réessayez.
        </div>
      ) : null}

      <StravaCard
        connected={!!stravaConn}
        providerUserId={stravaConn?.provider_user_id}
        lastSyncAt={stravaConn?.last_sync_at}
        activitiesCount={activitiesCount ?? 0}
      />

      <TerraCard
        connected={!!terraConn}
        providerUserId={terraConn?.provider_user_id}
        lastSyncAt={terraConn?.last_sync_at}
      />
    </div>
  )
}
