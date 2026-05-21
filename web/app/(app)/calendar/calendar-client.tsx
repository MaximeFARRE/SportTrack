"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState, useMemo } from "react"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Moon, Plus, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivitySummary = {
  id: string
  name: string | null
  sport_type: string
  duration_sec: number | null
  distance_m: number | null
}

export type MetricSummary = {
  training_load: number | null
  hrv_rmssd: number | null
  sleep_score: number | null
  sleep_duration_min: number | null
  training_readiness: number | null
}

export type DayData = {
  activities: ActivitySummary[]
  metrics: MetricSummary | null
}

type Metric = "charge" | "duration" | "distance"

const SPORT_EMOJIS: Record<string, string> = {
  Run: "🏃",
  Ride: "🚴",
  Swim: "🏊",
  Hike: "⛰️",
  Walk: "🚶",
  Yoga: "🧘",
  WeightTraining: "💪",
  Workout: "🏋️",
  VirtualRide: "🚴",
  AlpineSki: "⛷️",
  NordicSki: "🎿",
}

const SPORT_LABELS: Record<string, string> = {
  Run: "Course",
  Ride: "Vélo",
  Swim: "Natation",
  Hike: "Randonnée",
  Walk: "Marche",
  Yoga: "Yoga",
  WeightTraining: "Muscu",
  Workout: "Entraînement",
  VirtualRide: "Vélo virtuel",
  AlpineSki: "Ski alpin",
  NordicSki: "Ski nordique",
}

const METRIC_LABELS: Record<Metric, string> = {
  charge: "Charge",
  duration: "Durée",
  distance: "Distance",
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`
  return `${m}m`
}

function formatDistance(m: number | null): string {
  if (!m) return "-"
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

/** Returns bg class string based on intensity 0–4 */
function heatClass(bucket: number): string {
  switch (bucket) {
    case 1: return "bg-emerald-100 dark:bg-emerald-950"
    case 2: return "bg-emerald-300 dark:bg-emerald-700"
    case 3: return "bg-amber-300 dark:bg-amber-700"
    case 4: return "bg-red-400 dark:bg-red-700"
    default: return ""
  }
}

/** Convert training_load/duration/distance per day to a 0–4 bucket */
function computeBuckets(
  dayKeys: (string | null)[],
  dayData: Record<string, DayData>,
  metric: Metric,
): Map<string, number> {
  const values: { key: string; value: number }[] = []

  dayKeys.forEach((key) => {
    if (!key) return
    const day = dayData[key]
    if (!day) return
    let v = 0
    if (metric === "charge") v = day.metrics?.training_load ?? 0
    else if (metric === "duration")
      v = day.activities.reduce((s, a) => s + (a.duration_sec ?? 0), 0)
    else if (metric === "distance")
      v = day.activities.reduce((s, a) => s + (a.distance_m ?? 0), 0)
    if (v > 0) values.push({ key, value: v })
  })

  if (!values.length) return new Map()
  const max = Math.max(...values.map((v) => v.value))
  const result = new Map<string, number>()
  values.forEach(({ key, value }) => {
    const pct = value / max
    if (pct < 0.2) result.set(key, 1)
    else if (pct < 0.4) result.set(key, 2)
    else if (pct < 0.7) result.set(key, 3)
    else result.set(key, 4)
  })
  return result
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarClient({
  year,
  month,
  dayData,
  allSports,
  missedDays = [],
}: {
  year: number
  month: number
  dayData: Record<string, DayData>
  allSports: string[]
  missedDays?: string[]
}) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [metric, setMetric] = useState<Metric>("charge")

  const today = new Date().toISOString().slice(0, 10)
  const missedSet = new Set(missedDays)

  // ── Calendar grid cells ──────────────────────────────────────────────────
  const { cells, dayKeys } = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const totalDays = new Date(year, month, 0).getDate()
    const startPadding = (firstDay.getDay() + 6) % 7 // Monday-first

    const dayKeys: (string | null)[] = [
      ...Array(startPadding).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => {
        const d = i + 1
        return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      }),
    ]
    while (dayKeys.length % 7 !== 0) dayKeys.push(null)
    return { cells: dayKeys, dayKeys }
  }, [year, month])

  const buckets = useMemo(
    () => computeBuckets(dayKeys, dayData, metric),
    [dayKeys, dayData, metric],
  )

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigate(direction: -1 | 1) {
    let y = year
    let m = month + direction
    if (m < 1) { m = 12; y -= 1 }
    if (m > 12) { m = 1; y += 1 }
    router.push(`/calendar?month=${y}-${String(m).padStart(2, "0")}`)
  }

  // ── Sport filter toggle ───────────────────────────────────────────────────
  function toggleSport(sport: string) {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport],
    )
  }

  // ── Derived: filter activities in cells ──────────────────────────────────
  const filteredDayData = useMemo<Record<string, DayData>>(() => {
    if (!selectedSports.length) return dayData
    return Object.fromEntries(
      Object.entries(dayData).map(([key, data]) => [
        key,
        {
          ...data,
          activities: data.activities.filter((a) =>
            selectedSports.includes(a.sport_type),
          ),
        },
      ]),
    )
  }, [dayData, selectedSports])

  const selectedDayData = selectedDay ? filteredDayData[selectedDay] : null

  const monthLabel = format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: fr })
  const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  return (
    <div className="space-y-4">
      {/* Header: navigation + titre */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">{monthLabelCapitalized}</h2>
        <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        {/* Sport chips */}
        {allSports.map((sport) => (
          <button
            key={sport}
            onClick={() => toggleSport(sport)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selectedSports.includes(sport)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50",
            )}
          >
            {SPORT_EMOJIS[sport] ?? "🏅"} {SPORT_LABELS[sport] ?? sport}
          </button>
        ))}

        {/* Metric selector */}
        <div className="ml-auto flex gap-1">
          {(["charge", "duration", "distance"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                metric === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50",
              )}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {dayKeys.map((key, idx) => {
            if (!key) {
              return <div key={`empty-${idx}`} className="aspect-square border-b border-r last:border-r-0 bg-muted/30" />
            }

            const data = filteredDayData[key]
            const bucket = buckets.get(key) ?? 0
            const isToday = key === today
            const isMissed = missedSet.has(key)
            const dayNum = parseInt(key.split("-")[2], 10)
            const sports = [...new Set(data?.activities.map((a) => a.sport_type) ?? [])]

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={cn(
                  "relative aspect-square border-b border-r p-1 text-left transition-opacity hover:opacity-80",
                  (idx + 1) % 7 === 0 && "border-r-0",
                  heatClass(bucket),
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                    isToday && "bg-primary text-primary-foreground font-bold",
                  )}
                >
                  {dayNum}
                </span>

                {/* Missed planned session badge */}
                {isMissed && (
                  <span className="absolute right-0.5 top-0.5 text-[10px]" title="Séance non réalisée">
                    ⚠️
                  </span>
                )}

                {/* Sport emojis */}
                {sports.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-px">
                    {sports.slice(0, 3).map((sport) => (
                      <span key={sport} className="text-[10px] leading-none">
                        {SPORT_EMOJIS[sport] ?? "🏅"}
                      </span>
                    ))}
                    {sports.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{sports.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Légende heatmap */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Intensité :</span>
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={cn("h-3 w-3 rounded-sm", heatClass(b))} />
        ))}
        <span>faible → élevée</span>
      </div>

      {/* Day detail Sheet */}
      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedDay && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle>
                  {format(parseISO(selectedDay), "EEEE d MMMM yyyy", { locale: fr })
                    .replace(/^\w/, (c) => c.toUpperCase())}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-4">
                {/* Activités */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Activités</h3>
                  {selectedDayData?.activities.length ? (
                    <div className="space-y-2">
                      {selectedDayData.activities.map((activity) => (
                        <Link
                          key={activity.id}
                          href={`/activities/${activity.id}`}
                          onClick={() => setSelectedDay(null)}
                          className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm hover:bg-muted"
                        >
                          <div className="flex items-center gap-2">
                            <span>{SPORT_EMOJIS[activity.sport_type] ?? "🏅"}</span>
                            <div>
                              <p className="font-medium">
                                {activity.name ?? SPORT_LABELS[activity.sport_type] ?? activity.sport_type}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDuration(activity.duration_sec)}
                                {activity.distance_m ? ` · ${formatDistance(activity.distance_m)}` : ""}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune activité ce jour.</p>
                  )}
                  <Link href="/activities/new" onClick={() => setSelectedDay(null)}>
                    <Button variant="outline" size="sm" className="mt-3 w-full">
                      <Plus className="mr-1 h-4 w-4" />
                      Ajouter une activité
                    </Button>
                  </Link>
                </section>

                {/* Récupération */}
                {selectedDayData?.metrics && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Récupération</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedDayData.metrics.hrv_rmssd != null && (
                        <div className="rounded-lg border bg-background p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Zap className="h-3 w-3 text-pink-500" />
                            HRV
                          </div>
                          <p className="text-lg font-bold">
                            {Math.round(selectedDayData.metrics.hrv_rmssd)}
                          </p>
                        </div>
                      )}
                      {selectedDayData.metrics.sleep_score != null && (
                        <div className="rounded-lg border bg-background p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Moon className="h-3 w-3 text-indigo-400" />
                            Sommeil
                          </div>
                          <p className="text-lg font-bold">
                            {selectedDayData.metrics.sleep_score}
                            <span className="text-xs font-normal text-muted-foreground"> /100</span>
                          </p>
                          {selectedDayData.metrics.sleep_duration_min != null && (
                            <p className="text-xs text-muted-foreground">
                              {Math.floor(selectedDayData.metrics.sleep_duration_min / 60)}h
                              {(selectedDayData.metrics.sleep_duration_min % 60)
                                .toString()
                                .padStart(2, "0")}
                            </p>
                          )}
                        </div>
                      )}
                      {selectedDayData.metrics.training_readiness != null && (
                        <div className="rounded-lg border bg-background p-3 col-span-2">
                          <p className="text-xs text-muted-foreground">Readiness</p>
                          <p className="text-lg font-bold">
                            {Math.round(selectedDayData.metrics.training_readiness)}
                            <span className="text-xs font-normal text-muted-foreground"> /100</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
