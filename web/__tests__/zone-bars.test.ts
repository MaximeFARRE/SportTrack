import { describe, expect, it } from "vitest"

// Pure function extracted from zone-bars.tsx — tested without DOM
import type { ZoneEntry } from "../components/activity/zone-bars"

function aggregateZones(zonesArrays: ZoneEntry[][]): ZoneEntry[] {
  const totals: Record<number, ZoneEntry> = {}
  for (const zones of zonesArrays) {
    for (const z of zones) {
      if (!totals[z.zone]) totals[z.zone] = { ...z, sec: 0 }
      totals[z.zone].sec += z.sec
    }
  }
  return Object.values(totals).sort((a, b) => a.zone - b.zone)
}

const WEEK_1: ZoneEntry[] = [
  { zone: 1, name: "Récupération", color: "#60a5fa", sec: 1200 },
  { zone: 2, name: "Endurance", color: "#34d399", sec: 3600 },
  { zone: 3, name: "Tempo", color: "#fbbf24", sec: 900 },
]

const WEEK_2: ZoneEntry[] = [
  { zone: 1, name: "Récupération", color: "#60a5fa", sec: 600 },
  { zone: 2, name: "Endurance", color: "#34d399", sec: 1800 },
  { zone: 4, name: "Seuil", color: "#f97316", sec: 300 },
]

describe("aggregateZones", () => {
  it("sums matching zones across multiple sessions", () => {
    const result = aggregateZones([WEEK_1, WEEK_2])
    const z1 = result.find((z) => z.zone === 1)
    const z2 = result.find((z) => z.zone === 2)
    expect(z1?.sec).toBe(1800) // 1200 + 600
    expect(z2?.sec).toBe(5400) // 3600 + 1800
  })

  it("includes zones present in only one session", () => {
    const result = aggregateZones([WEEK_1, WEEK_2])
    expect(result.some((z) => z.zone === 3)).toBe(true) // only in WEEK_1
    expect(result.some((z) => z.zone === 4)).toBe(true) // only in WEEK_2
  })

  it("returns zones sorted by zone number", () => {
    const result = aggregateZones([WEEK_2, WEEK_1])
    const zoneNumbers = result.map((z) => z.zone)
    expect(zoneNumbers).toEqual([...zoneNumbers].sort((a, b) => a - b))
  })

  it("returns empty array for empty input", () => {
    expect(aggregateZones([])).toEqual([])
  })

  it("returns original zones for single session input", () => {
    const result = aggregateZones([WEEK_1])
    expect(result.length).toBe(3)
    expect(result.find((z) => z.zone === 2)?.sec).toBe(3600)
  })

  it("preserves zone metadata (name, color) from first occurrence", () => {
    const result = aggregateZones([WEEK_1, WEEK_2])
    const z1 = result.find((z) => z.zone === 1)
    expect(z1?.name).toBe("Récupération")
    expect(z1?.color).toBe("#60a5fa")
  })
})
