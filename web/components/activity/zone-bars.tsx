import { cn } from "@/lib/utils"

export interface ZoneEntry {
  zone: number
  name: string
  color: string
  sec: number
}

function formatDuration(sec: number): string {
  if (sec === 0) return "0s"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`
  return `${s}s`
}

interface ZoneBarsProps {
  zones: ZoneEntry[]
  showPolarization?: boolean
  className?: string
}

export function ZoneBars({ zones, showPolarization = false, className }: ZoneBarsProps) {
  const totalSec = zones.reduce((sum, z) => sum + z.sec, 0)
  if (totalSec === 0) return null

  const low = (zones.find((z) => z.zone === 1)?.sec ?? 0) + (zones.find((z) => z.zone === 2)?.sec ?? 0)
  const mid = zones.find((z) => z.zone === 3)?.sec ?? 0
  const high = (zones.find((z) => z.zone === 4)?.sec ?? 0) + (zones.find((z) => z.zone === 5)?.sec ?? 0)

  return (
    <div className={cn("space-y-3", className)}>
      {/* Stacked bar overview */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {zones.map((z) => {
          const pct = (z.sec / totalSec) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={z.zone}
              style={{ width: `${pct}%`, backgroundColor: z.color }}
              title={`${z.name}: ${Math.round(pct)}%`}
            />
          )
        })}
      </div>

      {/* Per-zone rows */}
      <div className="space-y-1.5">
        {zones.map((z) => {
          const pct = totalSec > 0 ? (z.sec / totalSec) * 100 : 0
          return (
            <div key={z.zone} className="flex items-center gap-2 text-xs">
              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: z.color }} />
              <span className="w-28 shrink-0 text-muted-foreground">{z.name}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: z.color }}
                />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                {Math.round(pct)}%
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums font-medium">
                {formatDuration(z.sec)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Polarization ratio */}
      {showPolarization && totalSec > 0 && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium">Répartition polarisée</span>
          <span className="ml-2 text-muted-foreground">
            Bas {Math.round((low / totalSec) * 100)}% · Tempo {Math.round((mid / totalSec) * 100)}% · Haut {Math.round((high / totalSec) * 100)}%
          </span>
          {low / totalSec >= 0.75 && high / totalSec >= 0.15 && (
            <span className="ml-2 text-emerald-600 font-medium">✓ Polarisé</span>
          )}
        </div>
      )}
    </div>
  )
}

// Aggregate multiple activities' zone data for weekly/monthly views
export function aggregateZones(zonesArrays: ZoneEntry[][]): ZoneEntry[] {
  const totals: Record<number, ZoneEntry> = {}

  for (const zones of zonesArrays) {
    for (const z of zones) {
      if (!totals[z.zone]) {
        totals[z.zone] = { ...z, sec: 0 }
      }
      totals[z.zone].sec += z.sec
    }
  }

  return Object.values(totals).sort((a, b) => a.zone - b.zone)
}
