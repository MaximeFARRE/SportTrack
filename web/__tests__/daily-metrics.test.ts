import { beforeEach, describe, expect, it, vi } from "vitest"

const upsertMock = vi.fn()

let activitiesRows: unknown[] = []
let existingRows: unknown[] = []
let activitiesError: Error | null = null
let existingError: Error | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "activities") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ data: activitiesRows, error: activitiesError }),
            }),
          }),
        }
      }

      if (table === "daily_metrics") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ data: existingRows, error: existingError }),
            }),
          }),
          upsert: upsertMock,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { computeTrainingLoad, recomputeDailyMetricsForUser } from "@/lib/server/metrics/daily"

describe("computeTrainingLoad", () => {
  it("uses duration as the baseline load for a normal run", () => {
    expect(
      computeTrainingLoad({
        start_date: "2026-05-25T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 10000,
        elevation_gain_m: 0,
        average_heartrate: null,
        max_heartrate: null,
      }),
    ).toBe(60)
  })

  it("applies sport, intensity, and elevation coefficients", () => {
    expect(
      computeTrainingLoad({
        start_date: "2026-05-25T08:00:00Z",
        sport_type: "TrailRun",
        duration_sec: 3600,
        distance_m: 12000,
        elevation_gain_m: 500,
        average_heartrate: 175,
        max_heartrate: 190,
      }),
    ).toBe(94.38)
  })

  it("ignores invalid heart-rate ratios and negative durations", () => {
    expect(
      computeTrainingLoad({
        start_date: "2026-05-25T08:00:00Z",
        sport_type: "Ride",
        duration_sec: -120,
        distance_m: 5000,
        elevation_gain_m: 200,
        average_heartrate: 190,
        max_heartrate: 180,
      }),
    ).toBe(0)
  })
})

describe("recomputeDailyMetricsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activitiesRows = []
    existingRows = []
    activitiesError = null
    existingError = null
    upsertMock.mockResolvedValue({ error: null })
    vi.setSystemTime(new Date("2026-05-25T12:00:00Z"))
  })

  it("aggregates activities by metric date and preserves empty existing days", async () => {
    existingRows = [{ metric_date: "2026-05-23" }]
    activitiesRows = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 10000.456,
        elevation_gain_m: 120.456,
        average_heartrate: 140,
        max_heartrate: 180,
      },
      {
        start_date: "2026-05-24T18:00:00Z",
        sport_type: "Ride",
        duration_sec: 1800,
        distance_m: 20000,
        elevation_gain_m: 80,
        average_heartrate: null,
        max_heartrate: null,
      },
    ]

    await recomputeDailyMetricsForUser("user-1", { days: 7 })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "user-1",
          metric_date: "2026-05-23",
          sessions_count: 0,
          training_load: 0,
        }),
        expect.objectContaining({
          user_id: "user-1",
          metric_date: "2026-05-24",
          sessions_count: 2,
          duration_sec: 5400,
          distance_m: 30000.46,
          elevation_gain_m: 200.46,
          training_load: 76.23,
        }),
      ]),
      { onConflict: "user_id,metric_date" },
    )
  })

  it("does not upsert when there are no activities or existing metrics", async () => {
    await recomputeDailyMetricsForUser("user-1")

    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("throws when an activities query fails", async () => {
    activitiesError = new Error("activities failed")

    await expect(recomputeDailyMetricsForUser("user-1")).rejects.toThrow("activities failed")
  })
})
