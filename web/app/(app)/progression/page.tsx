import type { Metadata } from "next"
import { startOfWeek, subYears, subWeeks, format } from "date-fns"
import { fr } from "date-fns/locale"
import { LineChart } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ZoneBars, aggregateZones } from "@/components/activity/zone-bars"
import type { ZoneEntry } from "@/components/activity/zone-bars"
import { WeeklyVolume } from "@/components/progression/weekly-volume"
import { UserPRs } from "@/components/progression/user-prs"
import { StravaAchievements } from "@/components/progression/strava-achievements"
import { EffortProgressionCard } from "@/components/progression/effort-progression-card"
import { VmaEstimateCard } from "@/components/progression/vma-estimate-card"
import { computeEffortProgression } from "@/lib/compute/effort-progression"
import { estimateVma } from "@/lib/compute/vma-estimate"
import { ensureValidStravaToken } from "@/lib/server/strava/tokens"
import { getVmaStreamEfforts } from "@/lib/server/strava/vma"

import { HistoryRefreshButton } from "./history-refresh-button"
import { ProgressionAutoRefresh } from "./progression-auto-refresh"

export const metadata: Metadata = { title: "Progression · SportTrack" }

function computePolarization(zones: ZoneEntry[]): { low: number; mid: number; high: number } {
  const total = zones.reduce((s, z) => s + z.sec, 0)
  if (total === 0) return { low: 0, mid: 0, high: 0 }
  const low = ((zones.find((z) => z.zone === 1)?.sec ?? 0) + (zones.find((z) => z.zone === 2)?.sec ?? 0)) / total * 100
  const mid = (zones.find((z) => z.zone === 3)?.sec ?? 0) / total * 100
  const high = ((zones.find((z) => z.zone === 4)?.sec ?? 0) + (zones.find((z) => z.zone === 5)?.sec ?? 0)) / total * 100
  return { low: Math.round(low), mid: Math.round(mid), high: Math.round(high) }
}

export default async function ProgressionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const vmaHistoryStart = subYears(now, 4)

  const [activitiesRes, zonesRes, prActivitiesRes] = await Promise.all([
    supabase
      .from("activities")
      .select("provider, provider_activity_id, sport_type, start_date, duration_sec, moving_time_sec, distance_m, elevation_gain_m, average_heartrate, max_heartrate, max_speed, time_in_zones_json")
      .eq("user_id", user.id)
      .gte("start_date", vmaHistoryStart.toISOString())
      .order("start_date"),
    supabase
      .from("hr_zones")
      .select("zone_number, zone_name, hr_min, hr_max, color_hex")
      .eq("user_id", user.id)
      .order("zone_number"),
    supabase
      .from("activities")
      .select("id, name, sport_type, start_date, duration_sec, distance_m, elevation_gain_m, raw_data_json")
      .eq("user_id", user.id)
      .in("sport_type", ["Run", "Ride", "Swim"])
  ])

  const activities = activitiesRes.data
  const zones = zonesRes.data
  const prActivities = prActivitiesRes.data
  const effortProgression = computeEffortProgression(
    (activities as any) ?? [],
    (zones as any) ?? [],
    now,
  )
  let vmaStreamEfforts: any[] = []

  let koms: any[] = []
  let isStravaConnected = false

  try {
    const token = await ensureValidStravaToken(user.id)
    isStravaConnected = true
    vmaStreamEfforts = await getVmaStreamEfforts(token, (activities as any) ?? [])

    const { data: conn } = await supabase
      .from("provider_connections")
      .select("provider_user_id")
      .eq("user_id", user.id)
      .eq("provider", "strava")
      .eq("is_active", true)
      .maybeSingle()

    if (conn?.provider_user_id) {
      const res = await fetch(`https://www.strava.com/api/v3/athletes/${conn.provider_user_id}/koms?per_page=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        koms = await res.json()
      }
    }
  } catch (error) {
    console.warn("Strava token or KOMs retrieval failed:", error)
  }

  const vmaEstimate = estimateVma((activities as any) ?? [], (zones as any) ?? [], now, vmaStreamEfforts)

  // Build weekly buckets
  const weeks: Array<{
    label: string
    start: Date
    activities: typeof activities
    zones: ZoneEntry[] | null
    totalSec: number
    totalKm: number
  }> = []

  for (let w = 11; w >= 0; w--) {
    const weekStart = startOfWeek(subWeeks(now, w), { weekStartsOn: 1 })
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const weekActs = (activities ?? []).filter((a) => {
      const d = new Date(a.start_date)
      return d >= weekStart && d < weekEnd
    })

    const zonesArrays: ZoneEntry[][] = weekActs
      .map((a) => a.time_in_zones_json)
      .filter((z) => Array.isArray(z) && z.length > 0)
      .map((z) => z as unknown as ZoneEntry[])

    weeks.push({
      label: format(weekStart, "d MMM", { locale: fr }),
      start: weekStart,
      activities: weekActs,
      zones: zonesArrays.length > 0 ? aggregateZones(zonesArrays) : null,
      totalSec: weekActs.reduce((s, a) => s + (a.duration_sec ?? 0), 0),
      totalKm: weekActs.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000,
    })
  }

  const currentWeek = weeks[weeks.length - 1]
  const polarization = currentWeek.zones ? computePolarization(currentWeek.zones) : null
  const serializedWeeks = weeks.map((w) => {
    const sportBreakdown: Record<string, { sec: number; km: number }> = {}
    ;(w.activities ?? []).forEach((a) => {
      const sport = a.sport_type
      if (!sportBreakdown[sport]) {
        sportBreakdown[sport] = { sec: 0, km: 0 }
      }
      sportBreakdown[sport].sec += a.duration_sec ?? 0
      sportBreakdown[sport].km += (a.distance_m ?? 0) / 1000
    })
    return {
      label: w.label,
      totalSec: w.totalSec,
      totalKm: w.totalKm,
      sportBreakdown,
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ProgressionAutoRefresh />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Progression</h1>
        </div>
        <HistoryRefreshButton />
      </div>

      <VmaEstimateCard estimate={vmaEstimate} />

      <EffortProgressionCard progression={effortProgression} />

      {/* Current week zones + polarization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Zones cette semaine</CardTitle>
        </CardHeader>
        <CardContent>
          {currentWeek.zones ? (
            <ZoneBars zones={currentWeek.zones} showPolarization />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune donnée de zones cette semaine. Calculez les zones depuis le détail d&apos;une activité Strava.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Polarization trend — 12 weeks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tendance polarisation (12 semaines)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {weeks.some((w) => w.zones !== null) ? (
            weeks.map((week) => {
              const pol = week.zones ? computePolarization(week.zones) : null
              const isCurrentWeek = week === currentWeek
              return (
                <div key={week.label} className="flex items-center gap-3 text-xs">
                  <span className={`w-12 shrink-0 ${isCurrentWeek ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {week.label}
                  </span>
                  {pol ? (
                    <>
                      <div className="flex h-4 flex-1 overflow-hidden rounded-sm">
                        <div
                          className="h-full bg-blue-400"
                          style={{ width: `${pol.low}%` }}
                          title={`Bas ${pol.low}%`}
                        />
                        <div
                          className="h-full bg-amber-400"
                          style={{ width: `${pol.mid}%` }}
                          title={`Tempo ${pol.mid}%`}
                        />
                        <div
                          className="h-full bg-red-400"
                          style={{ width: `${pol.high}%` }}
                          title={`Haut ${pol.high}%`}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-muted-foreground">
                        {pol.low}% / {pol.mid}% / {pol.high}%
                      </span>
                    </>
                  ) : (
                    <div className="h-4 flex-1 rounded-sm bg-muted" />
                  )}
                  <span className="w-16 shrink-0 text-right text-muted-foreground">
                    {week.activities?.length ?? 0} séance{(week.activities?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              Calculez les zones sur vos activités Strava pour voir la tendance de polarisation.
            </p>
          )}
          {weeks.some((w) => w.zones !== null) && (
            <p className="pt-1 text-xs text-muted-foreground">
              Bleu = Bas (Z1+Z2) · Amber = Tempo (Z3) · Rouge = Haut (Z4+Z5)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Volume per week */}
      <WeeklyVolume weeks={serializedWeeks} currentWeekLabel={currentWeek.label} />

      {/* Records personnels */}
      <UserPRs activities={(prActivities as any) ?? []} />

      {/* Trophées Strava */}
      <StravaAchievements
        koms={koms}
        activities={(prActivities as any) ?? []}
        isStravaConnected={isStravaConnected}
      />
    </div>
  )
}
