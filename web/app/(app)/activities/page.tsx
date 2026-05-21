import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { ActivitiesFilters } from "./activities-filters"

export const metadata: Metadata = { title: "Activités · SportTrack" }

const PAGE_SIZE = 20

const SPORT_LABELS: Record<string, string> = {
  Run: "Course",
  Ride: "Vélo",
  Swim: "Natation",
  Hike: "Randonnée",
  Walk: "Marche",
  VirtualRide: "Vélo virtuel",
  WeightTraining: "Musculation",
  AlpineSki: "Ski alpin",
  NordicSki: "Ski nordique",
  Workout: "Entraînement",
  Yoga: "Yoga",
}

function sportLabel(type: string): string {
  return SPORT_LABELS[type] ?? type
}

function getPeriodStart(period?: string): string | null {
  if (!period || period === "tout") return null
  const now = new Date()
  if (period === "7j") now.setDate(now.getDate() - 7)
  else if (period === "30j") now.setDate(now.getDate() - 30)
  else if (period === "3m") now.setMonth(now.getMonth() - 3)
  else if (period === "6m") now.setMonth(now.getMonth() - 6)
  else if (period === "1a") now.setFullYear(now.getFullYear() - 1)
  else return null
  return now.toISOString()
}

function formatDuration(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m`
}

function formatDistance(m: number | null): string {
  if (!m) return "-"
  return `${(m / 1000).toFixed(1)} km`
}

function formatElevation(m: number | null): string {
  if (!m) return "-"
  return `${Math.round(m)} m`
}

function buildPageUrl(sport?: string, period?: string, page?: number): string {
  const params = new URLSearchParams()
  if (sport && sport !== "tous") params.set("sport", sport)
  if (period && period !== "tout") params.set("period", period)
  if (page && page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `/activities?${qs}` : "/activities"
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; period?: string; page?: string }>
}) {
  const { sport, period, page } = await searchParams
  const currentPage = Math.max(1, parseInt(page ?? "1", 10) || 1)
  const periodStart = getPeriodStart(period)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let statsQuery = supabase
    .from("activities")
    .select("distance_m, elevation_gain_m, duration_sec")
    .eq("user_id", user!.id)

  if (sport && sport !== "tous") statsQuery = statsQuery.eq("sport_type", sport)
  if (periodStart) statsQuery = statsQuery.gte("start_date", periodStart)

  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let listQuery = supabase
    .from("activities")
    .select("id, name, sport_type, start_date, duration_sec, distance_m, elevation_gain_m, average_heartrate")
    .eq("user_id", user!.id)
    .order("start_date", { ascending: false })
    .range(from, to)

  if (sport && sport !== "tous") listQuery = listQuery.eq("sport_type", sport)
  if (periodStart) listQuery = listQuery.gte("start_date", periodStart)

  const [{ data: statsData }, { data: activities }] = await Promise.all([
    statsQuery,
    listQuery,
  ])

  const stats = (statsData ?? []).reduce(
    (acc, a) => ({
      count: acc.count + 1,
      distanceM: acc.distanceM + (a.distance_m ?? 0),
      elevationM: acc.elevationM + (a.elevation_gain_m ?? 0),
      durationSec: acc.durationSec + (a.duration_sec ?? 0),
    }),
    { count: 0, distanceM: 0, elevationM: 0, durationSec: 0 },
  )

  const totalPages = Math.ceil(stats.count / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activités</h1>
        <p className="text-sm text-muted-foreground">
          {stats.count} activité{stats.count !== 1 ? "s" : ""} importée{stats.count !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Activités" value={String(stats.count)} />
        <StatCard
          label="Distance"
          value={stats.distanceM > 0 ? `${(stats.distanceM / 1000).toFixed(0)} km` : "0 km"}
        />
        <StatCard
          label="Dénivelé +"
          value={stats.elevationM > 0 ? `${Math.round(stats.elevationM)} m` : "0 m"}
        />
        <StatCard label="Durée totale" value={formatDuration(stats.durationSec)} />
      </div>

      <Suspense>
        <ActivitiesFilters activeSport={sport} activePeriod={period} />
      </Suspense>

      {!activities || activities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune activité trouvée.{" "}
            {!sport && !period ? (
              <>
                Connectez Strava depuis la page{" "}
                <Link href="/connections" className="underline underline-offset-2">
                  Connexions
                </Link>{" "}
                pour importer vos activités.
              </>
            ) : (
              "Essayez d'élargir les filtres."
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Link key={activity.id} href={`/activities/${activity.id}`}>
              <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {activity.name ?? "Activité sans nom"}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {sportLabel(activity.sport_type)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {activity.distance_m != null && (
                        <span>{formatDistance(activity.distance_m)}</span>
                      )}
                      {activity.duration_sec != null && (
                        <span>{formatDuration(activity.duration_sec)}</span>
                      )}
                      {activity.elevation_gain_m != null && activity.elevation_gain_m > 0 && (
                        <span>D+ {formatElevation(activity.elevation_gain_m)}</span>
                      )}
                      {activity.average_heartrate != null && (
                        <span>{Math.round(activity.average_heartrate)} bpm</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(activity.start_date).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          {currentPage > 1 && (
            <Link href={buildPageUrl(sport, period, currentPage - 1)}>
              <Button variant="outline" size="sm">
                Précédent
              </Button>
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link href={buildPageUrl(sport, period, currentPage + 1)}>
              <Button variant="outline" size="sm">
                Suivant
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}
