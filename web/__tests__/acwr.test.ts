import { beforeEach, describe, expect, it, vi } from "vitest"

let metricRows: unknown[] = []
let metricError: Error | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "daily_metrics") throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({
                order: async () => ({ data: metricRows, error: metricError }),
              }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { getAcwrContext } from "@/lib/server/injuries/acwr"

describe("getAcwrContext", () => {
  beforeEach(() => {
    metricRows = []
    metricError = null
  })

  it("computes acute, chronic, acwr, and keeps the last 14 trend days", async () => {
    metricRows = Array.from({ length: 28 }, (_, index) => ({
      metric_date: `2026-05-${String(index + 1).padStart(2, "0")}`,
      training_load: index < 21 ? 40 : 80,
    }))

    const result = await getAcwrContext("user-1", new Date("2026-05-28T12:00:00Z"))

    expect(result).toMatchObject({
      reference_date: "2026-05-28",
      chronic_load_28d: 50,
      acute_load_7d: 80,
      acwr: 1.6,
    })
    expect(result.trend_14d).toHaveLength(14)
    expect(result.trend_14d[0]).toEqual({ date: "2026-05-15", load: 40 })
    expect(result.trend_14d.at(-1)).toEqual({ date: "2026-05-28", load: 80 })
  })

  it("ignores null loads when calculating averages but keeps them in the trend", async () => {
    metricRows = [
      { metric_date: "2026-05-23", training_load: null },
      { metric_date: "2026-05-24", training_load: 10 },
      { metric_date: "2026-05-25", training_load: 30 },
    ]

    const result = await getAcwrContext("user-1", new Date("2026-05-25T12:00:00Z"))

    expect(result.chronic_load_28d).toBe(20)
    expect(result.acute_load_7d).toBe(20)
    expect(result.trend_14d[0]).toEqual({ date: "2026-05-23", load: null })
  })

  it("throws database errors", async () => {
    metricError = new Error("metrics failed")

    await expect(getAcwrContext("user-1")).rejects.toThrow("metrics failed")
  })
})
