"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SportMetrics = {
  sec: number
  km: number
}

type WeekItem = {
  label: string
  totalSec: number
  totalKm: number
  sportBreakdown: Record<string, SportMetrics>
}

const SPORT_EMOJIS: Record<string, string> = {
  Run: "🏃",
  Ride: "🚴",
  Swim: "🏊",
  Hike: "🥾",
  Walk: "🚶",
  VirtualRide: "💻🚴",
  WeightTraining: "🏋️",
  AlpineSki: "⛷️",
  NordicSki: "🎿",
  Workout: "💪",
  Yoga: "🧘",
}

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

const SPORT_COLORS: Record<string, string> = {
  Run: "#3b82f6", // Blue
  Ride: "#10b981", // Emerald
  Swim: "#06b6d4", // Cyan
  Hike: "#f59e0b", // Amber
  Walk: "#84cc16", // Lime
  VirtualRide: "#0ea5e9", // Sky
  WeightTraining: "#8b5cf6", // Purple
  AlpineSki: "#ec4899", // Pink
  NordicSki: "#f43f5e", // Rose
  Workout: "#64748b", // Slate
  Yoga: "#d946ef", // Fuchsia
}

const getSportColor = (sport: string) => SPORT_COLORS[sport] ?? "#94a3b8"

function formatValue(val: number, metric: "duration" | "distance") {
  if (metric === "duration") {
    const h = Math.floor(val / 3600)
    const m = Math.floor((val % 3600) / 60)
    return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`
  } else {
    return `${val.toFixed(1)} km`
  }
}

export function WeeklyVolume({
  weeks,
  currentWeekLabel,
}: {
  weeks: WeekItem[]
  currentWeekLabel: string
}) {
  const [metric, setMetric] = useState<"duration" | "distance">("duration")

  // Collect all unique sports from breakdown
  const uniqueSports = useMemo(() => {
    const sports = new Set<string>()
    weeks.forEach((w) => {
      Object.keys(w.sportBreakdown).forEach((sport) => {
        const data = w.sportBreakdown[sport]
        if (data.sec > 0 || data.km > 0) {
          sports.add(sport)
        }
      })
    })
    return Array.from(sports)
  }, [weeks])

  const [selectedSports, setSelectedSports] = useState<string[]>(() => uniqueSports)

  useMemo(() => {
    setSelectedSports(uniqueSports)
  }, [uniqueSports])

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    )
  }

  // Get active value for a specific sport in a week
  const getWeekValue = (week: WeekItem, sport: string) => {
    const data = week.sportBreakdown[sport]
    if (!data) return 0
    return metric === "duration" ? data.sec : data.km
  }

  // Get total value of active/selected sports for a week
  const getWeekTotal = (week: WeekItem) => {
    return selectedSports.reduce((sum, sport) => sum + getWeekValue(week, sport), 0)
  }

  // Find max total value across all weeks
  const maxVal = Math.max(
    ...weeks.map((w) => getWeekTotal(w)),
    1
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Volume hebdomadaire</CardTitle>
          
          {/* Metric Selector Toggle */}
          <div className="flex rounded-md bg-muted p-0.5 text-xs border border-border/50 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setMetric("duration")}
              className={`rounded-sm px-2.5 py-1 font-medium transition-all duration-150 cursor-pointer ${
                metric === "duration"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Durée
            </button>
            <button
              onClick={() => setMetric("distance")}
              className={`rounded-sm px-2.5 py-1 font-medium transition-all duration-150 cursor-pointer ${
                metric === "distance"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Distance
            </button>
          </div>
        </div>

        {/* Sports selector */}
        {uniqueSports.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40 mt-1">
            {uniqueSports.map((sport) => {
              const isSelected = selectedSports.includes(sport)
              const color = getSportColor(sport)
              const label = SPORT_LABELS[sport] ?? sport
              const emoji = SPORT_EMOJIS[sport] ?? "🏅"
              
              return (
                <button
                  key={sport}
                  onClick={() => toggleSport(sport)}
                  style={{
                    borderColor: isSelected ? color : "var(--border)",
                    backgroundColor: isSelected ? `${color}15` : "transparent",
                    color: isSelected ? color : "var(--muted-foreground)",
                  }}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all hover:bg-muted/50 cursor-pointer"
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-2 pt-2">
        {selectedSports.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Sélectionnez au moins un sport pour afficher le volume
          </div>
        ) : (
          weeks.map((week) => {
            const weekTotal = getWeekTotal(week)
            const isCurrentWeek = week.label === currentWeekLabel
            
            const displayLabel = weekTotal > 0 ? formatValue(weekTotal, metric) : "–"

            return (
              <div key={week.label} className="flex items-center gap-3 text-xs">
                <span className={`w-12 shrink-0 ${isCurrentWeek ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {week.label}
                </span>
                
                {/* Horizontal Stacked Bar */}
                <div className="flex flex-1 overflow-hidden rounded-sm bg-muted h-4 items-center">
                  {selectedSports.map((sport) => {
                    const val = getWeekValue(week, sport)
                    if (val === 0) return null
                    const segmentPct = (val / maxVal) * 100
                    return (
                      <div
                        key={sport}
                        style={{
                          width: `${segmentPct}%`,
                          backgroundColor: getSportColor(sport),
                        }}
                        title={`${SPORT_LABELS[sport] ?? sport}: ${formatValue(val, metric)}`}
                        className="h-full transition-all duration-300 first:rounded-l-sm last:rounded-r-sm border-r border-background/25 last:border-r-0"
                      />
                    )
                  })}
                </div>
                
                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground font-medium">
                  {displayLabel}
                </span>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
