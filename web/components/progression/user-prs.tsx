"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Trophy, Calendar, Clock, Map, TrendingUp, Flame, Compass } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export type PRActivity = {
  id: string
  name: string | null
  sport_type: string
  start_date: string
  duration_sec: number | null
  distance_m: number | null
  elevation_gain_m: number | null
}

interface UserPRsProps {
  activities: PRActivity[]
}

// Distance targets configurations
const SPORT_CONFIGS = {
  Run: {
    label: "Course à pied",
    icon: "🏃",
    distances: [
      { label: "400m", value: 400 },
      { label: "1 km", value: 1000 },
      { label: "5 km", value: 5000 },
      { label: "10 km", value: 10000 },
      { label: "Semi-marathon", value: 21097 },
      { label: "Marathon", value: 42195 },
      { label: "100 km", value: 100000 },
      { label: "160 km (100 mi)", value: 160934 },
    ],
  },
  Ride: {
    label: "Cyclisme",
    icon: "🚴",
    distances: [
      { label: "10 km", value: 10000 },
      { label: "20 km", value: 20000 },
      { label: "50 km", value: 50000 },
      { label: "90 km", value: 90000 },
      { label: "100 km", value: 100000 },
      { label: "180 km", value: 180000 },
      { label: "200 km", value: 200000 },
    ],
  },
  Swim: {
    label: "Natation",
    icon: "🏊",
    distances: [
      { label: "100m", value: 100 },
      { label: "400m", value: 400 },
      { label: "1 500m", value: 1500 },
      { label: "3 000m", value: 3000 },
      { label: "5 000m", value: 5000 },
      { label: "10 km", value: 10000 },
    ],
  },
}

function formatPRTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return "-"
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatPace(seconds: number, distanceM: number, sport: string): string {
  if (!seconds || !distanceM) return "-"
  if (sport === "Run") {
    // Pace in min/km
    const paceSeconds = seconds / (distanceM / 1000)
    const paceMins = Math.floor(paceSeconds / 60)
    const paceSecs = Math.floor(paceSeconds % 60)
    return `${paceMins}:${paceSecs.toString().padStart(2, "0")} /km`
  } else if (sport === "Ride") {
    // Speed in km/h
    const speedKmh = (distanceM / 1000) / (seconds / 3600)
    return `${speedKmh.toFixed(1)} km/h`
  } else if (sport === "Swim") {
    // Pace in min/100m
    const paceSeconds = seconds / (distanceM / 100)
    const paceMins = Math.floor(paceSeconds / 60)
    const paceSecs = Math.floor(paceSeconds % 60)
    return `${paceMins}:${paceSecs.toString().padStart(2, "0")} /100m`
  }
  return ""
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDuration(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

export function UserPRs({ activities }: UserPRsProps) {
  const [activeTab, setActiveTab] = useState<"Run" | "Ride" | "Swim">("Run")

  // Calculate PRs and stats for all supported sports
  const computedData = useMemo(() => {
    const results: Record<string, ReturnType<typeof calculatePRsForSport>> = {}
    
    const calculatePRsForSport = (sport: "Run" | "Ride" | "Swim") => {
      const config = SPORT_CONFIGS[sport]
      const sportActivities = activities.filter(
        (a) => a.sport_type === sport && a.distance_m && a.duration_sec
      )

      // Compute PR for each distance
      const prs = config.distances.map((dist) => {
        let bestActivity: PRActivity | null = null
        let bestEstimatedTime = Infinity

        for (const act of sportActivities) {
          if (act.distance_m! >= dist.value) {
            // Estimate duration for this target distance
            const estTime = act.duration_sec! * (dist.value / act.distance_m!)
            if (estTime < bestEstimatedTime) {
              bestEstimatedTime = estTime
              bestActivity = act
            }
          }
        }

        return {
          label: dist.label,
          distanceVal: dist.value,
          bestActivity,
          estimatedTime: bestActivity ? bestEstimatedTime : null,
        }
      })

      // Remarkable stats
      let longestDistanceActivity: PRActivity | null = null
      let longestDurationActivity: PRActivity | null = null
      let maxElevationActivity: PRActivity | null = null

      for (const act of sportActivities) {
        if (act.distance_m && (!longestDistanceActivity || act.distance_m > longestDistanceActivity.distance_m!)) {
          longestDistanceActivity = act
        }
        if (act.duration_sec && (!longestDurationActivity || act.duration_sec > longestDurationActivity.duration_sec!)) {
          longestDurationActivity = act
        }
        if (
          act.elevation_gain_m != null &&
          (!maxElevationActivity || act.elevation_gain_m > (maxElevationActivity.elevation_gain_m ?? -1))
        ) {
          maxElevationActivity = act
        }
      }

      return {
        prs,
        longestDistanceActivity,
        longestDurationActivity,
        maxElevationActivity,
      }
    }

    results.Run = calculatePRsForSport("Run")
    results.Ride = calculatePRsForSport("Ride")
    results.Swim = calculatePRsForSport("Swim")

    return results
  }, [activities])

  const currentStats = computedData[activeTab]

  return (
    <Card className="border-muted bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500 animate-pulse" />
            <CardTitle className="text-base font-semibold">Records Personnels (PR)</CardTitle>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "Run" | "Ride" | "Swim")}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-3 sm:w-[300px]">
              <TabsTrigger value="Run">
                <span className="mr-1">{SPORT_CONFIGS.Run.icon}</span> Course
              </TabsTrigger>
              <TabsTrigger value="Ride">
                <span className="mr-1">{SPORT_CONFIGS.Ride.icon}</span> Vélo
              </TabsTrigger>
              <TabsTrigger value="Swim">
                <span className="mr-1">{SPORT_CONFIGS.Swim.icon}</span> Nat
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* PRs Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {currentStats.prs.map((pr) => {
            const hasRecord = pr.bestActivity !== null && pr.estimatedTime !== null
            return (
              <div
                key={pr.label}
                className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                  hasRecord
                    ? "border-amber-500/20 bg-amber-500/[0.02] hover:scale-[1.02] hover:border-amber-500/40 hover:shadow-md"
                    : "border-muted bg-muted/10 opacity-60"
                }`}
              >
                {hasRecord && (
                  <div className="absolute right-2 top-2 text-amber-500 opacity-20">
                    <Trophy className="h-10 w-10" />
                  </div>
                )}
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {pr.label}
                </div>
                <div className="mt-2 text-2xl font-black text-foreground">
                  {hasRecord ? formatPRTime(pr.estimatedTime) : "--"}
                </div>
                {hasRecord && (
                  <div className="mt-1 flex flex-col gap-1 text-xs">
                    <div className="font-semibold text-emerald-500 dark:text-emerald-400">
                      {formatPace(pr.estimatedTime!, pr.distanceVal, activeTab)}
                    </div>
                    <Link
                      href={`/activities/${pr.bestActivity!.id}`}
                      className="mt-2 truncate font-medium text-primary hover:underline"
                      title={pr.bestActivity!.name ?? "Activité"}
                    >
                      {pr.bestActivity!.name ?? "Activité"}
                    </Link>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(pr.bestActivity!.start_date)}
                    </div>
                  </div>
                )}
                {!hasRecord && (
                  <div className="mt-3 text-xs text-muted-foreground italic">
                    Aucune activité
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Remarkable Stats Section */}
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Statistiques remarquables
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Longest Distance */}
            <div className="rounded-xl border border-muted bg-muted/5 p-4 flex flex-col justify-between hover:border-primary/20 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Distance la plus longue</span>
                <Map className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-3">
                {currentStats.longestDistanceActivity ? (
                  <>
                    <div className="text-xl font-bold">
                      {(currentStats.longestDistanceActivity.distance_m! / 1000).toFixed(2)} km
                    </div>
                    <Link
                      href={`/activities/${currentStats.longestDistanceActivity.id}`}
                      className="mt-1 block truncate text-xs font-medium text-primary hover:underline"
                    >
                      {currentStats.longestDistanceActivity.name ?? "Activité"}
                    </Link>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      le {formatDate(currentStats.longestDistanceActivity.start_date)}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Aucune donnée</span>
                )}
              </div>
            </div>

            {/* Longest Duration */}
            <div className="rounded-xl border border-muted bg-muted/5 p-4 flex flex-col justify-between hover:border-primary/20 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Durée la plus longue</span>
                <Clock className="h-4 w-4 text-purple-500" />
              </div>
              <div className="mt-3">
                {currentStats.longestDurationActivity ? (
                  <>
                    <div className="text-xl font-bold">
                      {formatDuration(currentStats.longestDurationActivity.duration_sec)}
                    </div>
                    <Link
                      href={`/activities/${currentStats.longestDurationActivity.id}`}
                      className="mt-1 block truncate text-xs font-medium text-primary hover:underline"
                    >
                      {currentStats.longestDurationActivity.name ?? "Activité"}
                    </Link>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      le {formatDate(currentStats.longestDurationActivity.start_date)}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Aucune donnée</span>
                )}
              </div>
            </div>

            {/* Max Elevation */}
            <div className="rounded-xl border border-muted bg-muted/5 p-4 flex flex-col justify-between hover:border-primary/20 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Plus grand dénivelé</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-3">
                {currentStats.maxElevationActivity && currentStats.maxElevationActivity.elevation_gain_m != null ? (
                  <>
                    <div className="text-xl font-bold">
                      D+ {Math.round(currentStats.maxElevationActivity.elevation_gain_m)} m
                    </div>
                    <Link
                      href={`/activities/${currentStats.maxElevationActivity.id}`}
                      className="mt-1 block truncate text-xs font-medium text-primary hover:underline"
                    >
                      {currentStats.maxElevationActivity.name ?? "Activité"}
                    </Link>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      le {formatDate(currentStats.maxElevationActivity.start_date)}
                    </div>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Aucune donnée</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
