"use client"

import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ChartDataPoint = {
  metric_date: string
  training_load: number | null
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm text-sm">
      <p className="font-medium mb-1">
        {label ? format(parseISO(label), "d MMM yyyy", { locale: fr }) : ""}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name} : {Math.round(entry.value)}
        </p>
      ))}
    </div>
  )
}

export function CtlAtlChart({ data }: { data: ChartDataPoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        Aucune donnée sur les 90 derniers jours
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
        <XAxis
          dataKey="metric_date"
          tickFormatter={(v: string) => {
            try {
              return format(parseISO(v), "d MMM", { locale: fr })
            } catch {
              return v
            }
          }}
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="training_load"
          stroke="#3b82f6"
          name="Charge"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
