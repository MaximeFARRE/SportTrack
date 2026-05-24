"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type WeekItem = {
  label: string
  totalSec: number
  totalKm: number
}

export function WeeklyVolume({
  weeks,
  currentWeekLabel,
}: {
  weeks: WeekItem[]
  currentWeekLabel: string
}) {
  const [metric, setMetric] = useState<"duration" | "distance">("duration")

  const maxVal = Math.max(
    ...weeks.map((w) => (metric === "duration" ? w.totalSec : w.totalKm)),
    1
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Volume hebdomadaire</CardTitle>
          
          {/* Metric Selector Toggle */}
          <div className="flex rounded-md bg-muted p-0.5 text-xs border border-border/50">
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
      </CardHeader>
      
      <CardContent className="space-y-2 pt-2">
        {weeks.map((week) => {
          const val = metric === "duration" ? week.totalSec : week.totalKm
          const pct = (val / maxVal) * 100
          const isCurrentWeek = week.label === currentWeekLabel
          
          let displayLabel = "–"
          if (val > 0) {
            if (metric === "duration") {
              const h = Math.floor(val / 3600)
              const m = Math.floor((val % 3600) / 60)
              displayLabel = h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`
            } else {
              displayLabel = `${val.toFixed(1)} km`
            }
          }

          return (
            <div key={week.label} className="flex items-center gap-3 text-xs">
              <span className={`w-12 shrink-0 ${isCurrentWeek ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {week.label}
              </span>
              <div className="flex-1 overflow-hidden rounded-sm bg-muted h-4">
                <div
                  className={`h-full rounded-sm transition-all duration-300 ${
                    isCurrentWeek ? "bg-primary" : "bg-primary/40"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground font-medium">
                {displayLabel}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
