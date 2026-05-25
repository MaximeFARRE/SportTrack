"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type DailyMetric = {
  metric_date: string
  resting_hr: number | null
  hrv_rmssd: number | null
}

interface HealthChartProps {
  data: DailyMetric[]
}

function CustomTooltip({
  active,
  payload,
  label,
  type,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  type: "hr" | "hrv"
}) {
  if (!active || !payload?.length) return null

  const value = payload[0].value
  const dateStr = label ? format(parseISO(label), "d MMMM yyyy", { locale: fr }) : ""

  return (
    <div className="rounded-lg border bg-card p-3 shadow-md border-border text-sm space-y-1">
      <p className="text-xs text-muted-foreground">{dateStr}</p>
      <p className="font-semibold text-foreground flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: type === "hr" ? "#ef4444" : "#8b5cf6" }}
        />
        {type === "hr" ? "FC repos : " : "VFC (HRV) : "}
        <span className="font-bold text-base">{value}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {type === "hr" ? " bpm" : " ms"}
        </span>
      </p>
    </div>
  )
}

export function HealthChart({ data }: HealthChartProps) {
  const [activeTab, setActiveTab] = useState<"hr" | "hrv">("hr")

  // Filter metrics that have the active metric populated to avoid empty points
  const chartData = data
    .map((d) => ({
      date: d.metric_date,
      value: activeTab === "hr" ? d.resting_hr : d.hrv_rmssd,
    }))
    .filter((d) => d.value !== null)

  const hasData = chartData.length > 0

  return (
    <Card>
      <CardHeader className="pb-2 border-b border-border/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            📈 Tendances (30 jours)
          </CardTitle>
          <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium border border-border">
            <button
              onClick={() => setActiveTab("hr")}
              className={`rounded-md px-3 py-1 transition-all cursor-pointer ${
                activeTab === "hr"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              FC repos
            </button>
            <button
              onClick={() => setActiveTab("hrv")}
              className={`rounded-md px-3 py-1 transition-all cursor-pointer ${
                activeTab === "hrv"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              VFC (HRV)
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pr-4 pl-2">
        {!hasData ? (
          <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground text-center px-4">
            Données insuffisantes sur les 30 derniers jours.<br />
            Synchronisez votre montre connectée pour afficher le graphique.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(tick) => format(parseISO(tick), "d MMM", { locale: fr })}
              />
              <YAxis
                domain={activeTab === "hr" ? ["dataMin - 5", "dataMax + 5"] : ["dataMin - 10", "dataMax + 10"]}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={35}
                unit={activeTab === "hr" ? " bpm" : " ms"}
              />
              <Tooltip content={<CustomTooltip type={activeTab} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={activeTab === "hr" ? "#ef4444" : "#8b5cf6"}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0, fill: activeTab === "hr" ? "#ef4444" : "#8b5cf6" }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
