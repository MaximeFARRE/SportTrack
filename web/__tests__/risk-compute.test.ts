import { beforeEach, describe, expect, it, vi } from "vitest"

const upsertMock = vi.fn()

let metricRows: unknown[] = []
let metricError: Error | null = null
let activeRows: Array<{ user_id: string }> = []
let activeError: Error | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "daily_metrics") {
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
      }

      if (table === "risk_assessments") {
        return {
          upsert: upsertMock,
        }
      }

      if (table === "activities") {
        return {
          select: () => ({
            gte: async () => ({ data: activeRows, error: activeError }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { computeRisk, getActiveUserIds, persistAssessment } from "@/lib/server/risk/compute"

describe("computeRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    metricRows = []
    metricError = null
    activeRows = []
    activeError = null
    upsertMock.mockResolvedValue({ error: null })
  })

  it("returns no risk when no metrics exist", async () => {
    await expect(computeRisk("user-1", new Date("2026-05-25T12:00:00Z"))).resolves.toEqual({
      user_id: "user-1",
      assessment_date: "2026-05-25",
      score: 0,
      level: "none",
      reasons: [],
    })
  })

  it("scores a critical risk when load and recovery markers are all degraded", async () => {
    metricRows = [
      ...Array.from({ length: 21 }, () => ({
        training_load: 40,
        hrv_rmssd: 70,
        resting_hr: 48,
        sleep_score: 82,
        body_battery_morning: 80,
      })),
      ...Array.from({ length: 6 }, () => ({
        training_load: 120,
        hrv_rmssd: 70,
        resting_hr: 48,
        sleep_score: 82,
        body_battery_morning: 80,
      })),
      {
        training_load: 120,
        hrv_rmssd: 35,
        resting_hr: 62,
        sleep_score: 42,
        body_battery_morning: 28,
      },
    ]

    const result = await computeRisk("user-1", new Date("2026-05-25T12:00:00Z"))

    expect(result.level).toBe("critical")
    expect(result.score).toBe(10)
    expect(result.reasons).toHaveLength(6)
    expect(result.reasons.join("\n")).toContain("ACWR")
    expect(result.reasons.join("\n")).toContain("Score sommeil faible")
  })

  it("persists assessments with the expected conflict target", async () => {
    await persistAssessment({
      user_id: "user-1",
      assessment_date: "2026-05-25",
      score: 4,
      level: "moderate",
      reasons: ["fatigue"],
    })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        assessment_date: "2026-05-25",
        score: 4,
        level: "moderate",
        reasons: ["fatigue"],
      },
      { onConflict: "user_id,assessment_date" },
    )
  })

  it("deduplicates active user ids", async () => {
    activeRows = [{ user_id: "user-1" }, { user_id: "user-2" }, { user_id: "user-1" }]

    await expect(getActiveUserIds()).resolves.toEqual(["user-1", "user-2"])
  })
})
