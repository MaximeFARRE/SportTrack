"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Trophy, Award, Calendar, ExternalLink, Lock, Eye, AlertCircle, Clock, Map, TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

export type StravaKOM = {
  id: number
  name: string
  activity_id: number
  elapsed_time: number
  moving_time: number
  start_date: string
  distance: number
  segment: {
    id: number
    name: string
    activity_type: string
    distance: number
    average_grade: number
    city: string | null
    state: string | null
    country: string | null
  }
}

export type PRActivityWithRaw = {
  id: string
  name: string | null
  sport_type: string
  start_date: string
  duration_sec: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  raw_data_json: any
}

interface StravaAchievementsProps {
  koms: StravaKOM[]
  activities: PRActivityWithRaw[]
  isStravaConnected: boolean
}

type Top10Effort = {
  id: number
  name: string
  elapsed_time: number
  start_date: string
  distance: number
  average_grade?: number
  rank: number
  activityId: string
  activityName: string
  segmentId: number
  sportType: string
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function formatSegmentPace(seconds: number, distanceM: number, sport: string): string {
  if (!seconds || !distanceM) return "-"
  const cleanSport = sport.toLowerCase()
  if (cleanSport.includes("run")) {
    const paceSeconds = seconds / (distanceM / 1000)
    const paceMins = Math.floor(paceSeconds / 60)
    const paceSecs = Math.floor(paceSeconds % 60)
    return `${paceMins}:${paceSecs.toString().padStart(2, "0")} /km`
  } else if (cleanSport.includes("ride") || cleanSport.includes("cycle") || cleanSport.includes("bike")) {
    const speedKmh = (distanceM / 1000) / (seconds / 3600)
    return `${speedKmh.toFixed(1)} km/h`
  } else if (cleanSport.includes("swim")) {
    const paceSeconds = seconds / (distanceM / 100)
    const paceMins = Math.floor(paceSeconds / 60)
    const paceSecs = Math.floor(paceSeconds % 60)
    return `${paceMins}:${paceSecs.toString().padStart(2, "0")} /100m`
  }
  const speedKmh = (distanceM / 1000) / (seconds / 3600)
  return `${speedKmh.toFixed(1)} km/h`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function StravaAchievements({ koms, activities, isStravaConnected }: StravaAchievementsProps) {
  const [activeTab, setActiveTab] = useState<"koms" | "top10s">("koms")

  // Extract Top 10 rankings (rank 2 to 10) from db activities
  const top10s = useMemo(() => {
    const efforts: Top10Effort[] = []
    const seenSegments = new Set<number>()

    // Process activities sorted by date descending to find the best rank/time
    const sortedActivities = [...activities].sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    )

    for (const act of sortedActivities) {
      const raw = act.raw_data_json
      if (!raw || !Array.isArray(raw.segment_efforts)) continue

      for (const effort of raw.segment_efforts) {
        if (!effort.segment) continue

        let rank: number | null = null

        // Check if kom_rank is 2-10
        if (effort.kom_rank && effort.kom_rank >= 2 && effort.kom_rank <= 10) {
          rank = effort.kom_rank
        }

        // Check achievements list
        if (!rank && Array.isArray(effort.achievements)) {
          const overallAch = effort.achievements.find(
            (ach: any) => ach.type === "overall" && ach.rank >= 2 && ach.rank <= 10
          )
          if (overallAch) {
            rank = overallAch.rank
          }
        }

        if (rank !== null) {
          const segId = effort.segment.id
          // Deduplicate segments by keeping the best rank
          const existingIndex = efforts.findIndex((e) => e.segmentId === segId)
          if (existingIndex === -1) {
            efforts.push({
              id: effort.id,
              name: effort.segment.name,
              elapsed_time: effort.elapsed_time,
              start_date: effort.start_date,
              distance: effort.segment.distance,
              average_grade: effort.segment.average_grade,
              rank: rank,
              activityId: act.id,
              activityName: act.name ?? "Activité",
              segmentId: segId,
              sportType: effort.segment.activity_type ?? act.sport_type,
            })
          } else if (rank < efforts[existingIndex].rank) {
            // Replace with better rank
            efforts[existingIndex] = {
              id: effort.id,
              name: effort.segment.name,
              elapsed_time: effort.elapsed_time,
              start_date: effort.start_date,
              distance: effort.segment.distance,
              average_grade: effort.segment.average_grade,
              rank: rank,
              activityId: act.id,
              activityName: act.name ?? "Activité",
              segmentId: segId,
              sportType: effort.segment.activity_type ?? act.sport_type,
            }
          }
        }
      }
    }

    // Sort by rank ascending, then by date descending
    return efforts.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    })
  }, [activities])

  if (!isStravaConnected) {
    return (
      <Card className="border-muted bg-card/60 backdrop-blur-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Trophées Strava</CardTitle>
          </div>
          <CardDescription>
            Affichez vos couronnes (KOM/QOM) et classements du Top 10 sur les segments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <Lock className="h-6 w-6" />
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Connectez votre compte Strava dans les paramètres pour importer vos performances sur les segments.
          </p>
          <Link href="/connections" className="mt-4">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted font-medium py-1 px-3">
              Se connecter à Strava
            </Badge>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-muted bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">Trophées Strava</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Vos KOM/QOM en direct de Strava et vos Top 10 extraits de vos sorties synchronisées.
            </CardDescription>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "koms" | "top10s")}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-2 sm:w-[260px]">
              <TabsTrigger value="koms">
                👑 KOMs & QOMs ({koms.length})
              </TabsTrigger>
              <TabsTrigger value="top10s">
                🥈 Top 10 ({top10s.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {/* KOMs / QOMs List */}
        {activeTab === "koms" && (
          <div className="space-y-3">
            {koms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Trophy className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <span className="text-sm font-medium">Aucun KOM ou QOM actuellement</span>
                <span className="text-xs text-muted-foreground/60 max-w-xs mt-1">
                  Les segments où vous détenez le record général apparaîtront ici.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {koms.map((kom) => (
                  <div
                    key={kom.id}
                    className="flex flex-col justify-between rounded-xl border border-amber-500/20 bg-amber-500/[0.01] p-4 transition-all hover:border-amber-500/40 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <a
                          href={`https://www.strava.com/segments/${kom.segment.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-1 font-bold text-foreground hover:text-amber-500 text-sm"
                        >
                          <span className="truncate">{kom.segment.name}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground font-medium">
                          <span>
                            {kom.segment.activity_type === "Ride" ? "🚴 Vélo" : "🏃 Course"}
                          </span>
                          <span>•</span>
                          <span>{(kom.segment.distance / 1000).toFixed(2)} km</span>
                          {kom.segment.average_grade != null && (
                            <>
                              <span>•</span>
                              <span>Pente : {kom.segment.average_grade.toFixed(1)}%</span>
                            </>
                          )}
                          {(kom.segment.city || kom.segment.country) && (
                            <>
                              <span>•</span>
                              <span className="truncate">
                                {kom.segment.city || kom.segment.country}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-amber-500 text-amber-950 font-bold shrink-0 shadow-none hover:bg-amber-500">
                        👑 KOM
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-end justify-between border-t border-muted/30 pt-3">
                      <div>
                        <div className="text-lg font-black text-foreground">
                          {formatDuration(kom.elapsed_time)}
                        </div>
                        <div className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
                          {formatSegmentPace(kom.elapsed_time, kom.segment.distance, kom.segment.activity_type)}
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-muted-foreground space-y-0.5">
                        <Link
                          href={`/activities/${kom.activity_id}`}
                          className="flex items-center gap-0.5 justify-end font-semibold text-primary hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Voir l&apos;activité</span>
                        </Link>
                        <div className="flex items-center gap-0.5 justify-end">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(kom.start_date)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top 10s List */}
        {activeTab === "top10s" && (
          <div className="space-y-3">
            {top10s.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Award className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <span className="text-sm font-medium">Aucun Top 10 détecté</span>
                <span className="text-xs text-muted-foreground/60 max-w-xs mt-1">
                  Les segments sur lesquels vous êtes classé(e) du 2e au 10e rang s&apos;afficheront ici.
                </span>
                <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-dashed border-muted p-3 max-w-md text-left">
                  <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
                  <p className="text-[10px] leading-normal">
                    <strong>Note :</strong> Les segments sont extraits des détails de vos activités stockés en base. Les synchronisations en arrière-plan et les webhooks chargent les détails complets de vos sorties.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {top10s.map((effort) => {
                  const isSecond = effort.rank === 2
                  const isThird = effort.rank === 3
                  return (
                    <div
                      key={`${effort.segmentId}-${effort.id}`}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all hover:shadow-sm ${
                        isSecond
                          ? "border-slate-300 dark:border-slate-700 bg-slate-100/[0.01] hover:border-slate-400"
                          : isThird
                          ? "border-amber-600/20 dark:border-amber-600/30 bg-amber-600/[0.005] hover:border-amber-600/40"
                          : "border-muted bg-muted/5 hover:border-muted-foreground/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <a
                            href={`https://www.strava.com/segments/${effort.segmentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-1 font-bold text-foreground hover:text-primary text-sm"
                          >
                            <span className="truncate">{effort.name}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground font-medium">
                            <span>
                              {effort.sportType === "Ride" ? "🚴 Vélo" : "🏃 Course"}
                            </span>
                            <span>•</span>
                            <span>{(effort.distance / 1000).toFixed(2)} km</span>
                            {effort.average_grade != null && (
                              <>
                                <span>•</span>
                                <span>Pente : {effort.average_grade.toFixed(1)}%</span>
                              </>
                            )}
                          </div>
                        </div>

                        <Badge
                          className={`font-black shrink-0 shadow-none border ${
                            isSecond
                              ? "bg-slate-100 border-slate-300 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                              : isThird
                              ? "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/50 dark:border-amber-700/60 dark:text-amber-200"
                              : "bg-muted border-muted text-muted-foreground"
                          }`}
                        >
                          {isSecond ? "🥈 2ème" : isThird ? "🥉 3ème" : `#${effort.rank}`}
                        </Badge>
                      </div>

                      <div className="mt-4 flex items-end justify-between border-t border-muted/30 pt-3">
                        <div>
                          <div className="text-lg font-black text-foreground">
                            {formatDuration(effort.elapsed_time)}
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
                            {formatSegmentPace(effort.elapsed_time, effort.distance, effort.sportType)}
                          </div>
                        </div>

                        <div className="text-right text-[10px] text-muted-foreground space-y-0.5">
                          <Link
                            href={`/activities/${effort.activityId}`}
                            className="flex items-center gap-0.5 justify-end font-semibold text-primary hover:underline"
                            title={effort.activityName}
                          >
                            <Eye className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">{effort.activityName}</span>
                          </Link>
                          <div className="flex items-center gap-0.5 justify-end">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(effort.start_date)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
