import { describe, expect, it } from "vitest"

// ── Inline copies of pure helpers (no React imports needed) ──────────────────

function formatDurationSec(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m`
}

function getPeriodStart(period?: string): string | null {
  if (!period || period === "tout") return null
  const now = new Date("2026-05-22T00:00:00Z") // fixed date for deterministic tests
  if (period === "7j") now.setDate(now.getDate() - 7)
  else if (period === "30j") now.setDate(now.getDate() - 30)
  else if (period === "3m") now.setMonth(now.getMonth() - 3)
  else return null
  return now.toISOString()
}

// ── formatDurationSec ────────────────────────────────────────────────────────

describe("formatDurationSec", () => {
  it("returns dash for null", () => {
    expect(formatDurationSec(null)).toBe("-")
  })

  it("returns dash for zero", () => {
    expect(formatDurationSec(0)).toBe("-")
  })

  it("formats minutes correctly", () => {
    expect(formatDurationSec(45 * 60)).toBe("45m")
  })

  it("formats hours and minutes", () => {
    expect(formatDurationSec(1 * 3600 + 30 * 60)).toBe("1h 30m")
  })

  it("pads single-digit minutes", () => {
    expect(formatDurationSec(2 * 3600 + 5 * 60)).toBe("2h 05m")
  })
})

// ── getPeriodStart ───────────────────────────────────────────────────────────

describe("getPeriodStart", () => {
  it("returns null for undefined period", () => {
    expect(getPeriodStart(undefined)).toBeNull()
  })

  it("returns null for 'tout'", () => {
    expect(getPeriodStart("tout")).toBeNull()
  })

  it("returns a date string for '7j'", () => {
    const result = getPeriodStart("7j")
    expect(result).not.toBeNull()
    expect(new Date(result!).toISOString().slice(0, 10)).toBe("2026-05-15")
  })

  it("returns null for unknown period", () => {
    expect(getPeriodStart("2y")).toBeNull()
  })
})
