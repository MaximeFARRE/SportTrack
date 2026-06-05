import { TrendingDown, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatPace,
  type EffortProgressionResult,
  type EffortProgressionZoneSummary,
} from "@/lib/compute/effort-progression"

type EffortProgressionCardProps = {
  progression: EffortProgressionResult
}

function formatDelta(deltaPct: number | null): string {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return "—"
  const sign = deltaPct > 0 ? "+" : ""
  return `${sign}${deltaPct.toFixed(1)}%`
}

function confidence(summary: EffortProgressionZoneSummary | null): {
  label: string
  variant: "default" | "secondary" | "outline"
} {
  if (!summary || summary.currentSampleCount < 2 || summary.baselineSampleCount < 2) {
    return { label: "Données limitées", variant: "outline" }
  }
  if (summary.currentSampleCount >= 4 && summary.baselineSampleCount >= 4) {
    return { label: "Signal stable", variant: "default" }
  }
  return { label: "Signal à confirmer", variant: "secondary" }
}

function ZoneRow({ summary }: { summary: EffortProgressionZoneSummary }) {
  const improved = summary.deltaPct != null && summary.deltaPct >= 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_64px] items-center gap-2 border-t py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: summary.color ?? undefined }}
        />
        <span className="truncate font-medium">{summary.zoneName.replace(/^Z\d+\s*-\s*/, `Z${summary.zone} `)}</span>
      </div>
      <span className="text-right tabular-nums">{formatPace(summary.currentPaceSecPerKm)}</span>
      <span className="text-right text-muted-foreground tabular-nums">
        {formatPace(summary.baselinePaceSecPerKm)}
      </span>
      <span className={improved ? "text-right text-emerald-600" : "text-right text-rose-600"}>
        {formatDelta(summary.deltaPct)}
      </span>
    </div>
  )
}

export function EffortProgressionCard({ progression }: EffortProgressionCardProps) {
  const zone2 = progression.zone2Summary
  const quality = confidence(zone2)
  const improved = zone2?.deltaPct != null && zone2.deltaPct >= 0
  const chartBuckets = progression.monthlyZone2.filter((bucket) => bucket.medianPaceSecPerKm != null)
  const paces = chartBuckets.map((bucket) => bucket.medianPaceSecPerKm as number)
  const fastest = paces.length > 0 ? Math.min(...paces) : null
  const slowest = paces.length > 0 ? Math.max(...paces) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Progression à effort égal</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Course route</Badge>
            <Badge variant={quality.variant}>{quality.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {zone2?.currentPaceSecPerKm != null ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Allure actuelle en Zone 2</p>
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className="text-3xl font-semibold tabular-nums">
                    {formatPace(zone2.currentPaceSecPerKm)}
                  </span>
                  {zone2.deltaPct != null && (
                    <span className={improved ? "flex items-center gap-1 text-sm font-medium text-emerald-600" : "flex items-center gap-1 text-sm font-medium text-rose-600"}>
                      {improved ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {formatDelta(zone2.deltaPct)}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="text-muted-foreground">Référence ancienne</div>
                <div className="font-medium tabular-nums">{formatPace(zone2.baselinePaceSecPerKm)}</div>
              </div>
            </div>

            {chartBuckets.length > 0 && fastest != null && slowest != null && (
              <div className="space-y-2">
                <div className="flex h-28 items-end gap-2 rounded-lg border bg-muted/20 px-3 py-3">
                  {chartBuckets.map((bucket) => {
                    const pace = bucket.medianPaceSecPerKm as number
                    const range = Math.max(1, slowest - fastest)
                    const height = 34 + ((slowest - pace) / range) * 58
                    return (
                      <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div className="flex h-[92px] w-full items-end">
                          <div
                            className="w-full rounded-t-sm bg-emerald-500"
                            style={{ height: `${height}%` }}
                            title={`${bucket.label} · ${formatPace(pace)} · ${bucket.sampleCount} sorties`}
                          />
                        </div>
                        <span className="max-w-full truncate text-[10px] text-muted-foreground">{bucket.label}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Plus la barre est haute, meilleure est l&apos;allure médiane en Zone 2 sur le mois.
                </p>
              </div>
            )}

            <div>
              <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_64px] gap-2 pb-2 text-xs font-medium text-muted-foreground">
                <span>Zone</span>
                <span className="text-right">Récent</span>
                <span className="text-right">Ancien</span>
                <span className="text-right">Écart</span>
              </div>
              {progression.zoneSummaries.map((summary) => (
                <ZoneRow key={summary.zone} summary={summary} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pas encore assez de sorties course à pied avec fréquence cardiaque pour comparer l&apos;allure à effort égal.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
