"use client"

import { useState, useMemo } from "react"
import { startOfWeek, subWeeks, addDays, format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type RawActivity = {
  id: string
  sport_type: string
  start_date: string
  distance_m: number | null
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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0)

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm text-sm space-y-1.5 border-border">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const sportKey = entry.name as string
          const labelText = SPORT_LABELS[sportKey] ?? sportKey
          const emoji = SPORT_EMOJIS[sportKey] ?? "🏅"
          return (
            <div key={sportKey} className="flex items-center justify-between gap-6 text-xs">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span>{emoji}</span>
                <span>{labelText}</span>
              </span>
              <span className="font-medium text-foreground">
                {entry.value.toFixed(1)} km
              </span>
            </div>
          )
        })}
      </div>
      {payload.length > 1 && (
        <div className="border-t border-border pt-1.5 flex items-center justify-between gap-6 text-xs font-bold">
          <span>Total</span>
          <span className="text-foreground">{total.toFixed(1)} km</span>
        </div>
      )}
    </div>
  )
}

export function WeeklyVolumeChart({ activities }: { activities: RawActivity[] }) {
  // Get unique sports with non-zero distance in the last 6 weeks
  const uniqueSports = useMemo(() => {
    const sports = new Set<string>()
    activities.forEach((a) => {
      if ((a.distance_m ?? 0) > 0) {
        sports.add(a.sport_type)
      }
    })
    return Array.from(sports)
  }, [activities])

  // State to track selected sports for visualization
  const [selectedSports, setSelectedSports] = useState<string[]>(() => uniqueSports)

  // Recalculate if activities change and initialize to all unique sports
  useMemo(() => {
    setSelectedSports(uniqueSports)
  }, [uniqueSports])

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) => {
      if (prev.includes(sport)) {
        // Allow deselecting all (or keep at least one, but empty chart is fine too)
        return prev.filter((s) => s !== sport)
      } else {
        return [...prev, sport]
      }
    })
  };

  // Group activities into 6 calendar weeks
  const chartData = useMemo(() => {
    const now = new Date()
    const weekStartOfCurrent = startOfWeek(now, { weekStartsOn: 1 })

    // Generate 6 weeks list: week 5 (oldest) to week 0 (current)
    const weeks = Array.from({ length: 6 }).map((_, index) => {
      const weekStart = subWeeks(weekStartOfCurrent, 5 - index)
      const weekEnd = addDays(weekStart, 6)
      return {
        start: weekStart,
        end: weekEnd,
        label: `${format(weekStart, "d MMM", { locale: fr })} - ${format(weekEnd, "d MMM", { locale: fr })}`,
        key: format(weekStart, "yyyy-MM-dd"),
      }
    })

    return weeks.map((week) => {
      const dataPoint: Record<string, any> = {
        weekLabel: week.label,
        weekKey: week.key,
      }

      // Initialize all unique sports to 0 for this week
      uniqueSports.forEach((sport) => {
        dataPoint[sport] = 0
      })

      // Filter and aggregate activities that belong to this week
      const weekActivities = activities.filter((a) => {
        const activityDate = parseISO(a.start_date)
        const actWeekStart = startOfWeek(activityDate, { weekStartsOn: 1 })
        return format(actWeekStart, "yyyy-MM-dd") === week.key
      })

      weekActivities.forEach((a) => {
        if (a.distance_m && uniqueSports.includes(a.sport_type)) {
          const distanceKm = a.distance_m / 1000
          dataPoint[a.sport_type] = (dataPoint[a.sport_type] || 0) + distanceKm
        }
      })

      // Round the final values to 1 decimal place
      uniqueSports.forEach((sport) => {
        if (dataPoint[sport] > 0) {
          dataPoint[sport] = Math.round(dataPoint[sport] * 10) / 10
        }
      })

      return dataPoint
    })
  }, [activities, uniqueSports])

  if (uniqueSports.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            📈 Volume hebdomadaire (6 semaines)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          Aucun volume en kilomètres enregistré sur les 6 dernières semaines
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-medium">
            📈 Volume hebdomadaire (6 semaines)
          </CardTitle>
          
          {/* Sports selector (multiple choice possible) */}
          <div className="flex flex-wrap gap-1.5">
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
                  className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all hover:bg-muted/50 cursor-pointer"
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pr-2 pt-4">
        {selectedSports.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Sélectionnez au moins un sport pour afficher le volume
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 10, right: 5, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={38}
                unit=" km"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.15 }} />
              {selectedSports.map((sport) => (
                <Bar
                  key={sport}
                  dataKey={sport}
                  name={sport}
                  stackId="sports"
                  fill={getSportColor(sport)}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
