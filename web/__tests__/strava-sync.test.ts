import { beforeEach, describe, expect, it, vi } from "vitest"

const updateMock = vi.fn()
const upsertMock = vi.fn()
const maybeSingleMock = vi.fn()

vi.mock("@/lib/server/strava/tokens", () => ({
  ensureValidStravaToken: vi.fn(async () => "strava-token"),
}))

vi.mock("@/lib/server/strava/intensity", () => ({
  computeIntensityForActivity: vi.fn(async () => null),
}))

vi.mock("@/lib/server/metrics/daily", () => ({
  recomputeDailyMetricsForUser: vi.fn(async () => undefined),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "activities") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          upsert: upsertMock,
          delete: vi.fn(),
        }
      }

      if (table === "provider_connections") {
        return {
          update: updateMock,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { mapActivity, syncRecentStrava } from "@/lib/server/strava/sync"

function eqChain() {
  const chain = {
    eq: vi.fn(() => chain),
  }
  return chain
}

describe("syncRecentStrava", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    maybeSingleMock
      .mockResolvedValueOnce({ data: { id: "activity-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "activity-2" }, error: null })

    upsertMock.mockReturnValue({
      select: () => ({
        maybeSingle: maybeSingleMock,
      }),
    })

    updateMock.mockReturnValue(eqChain())

    global.fetch = vi.fn(async () =>
      Response.json([
        {
          id: 111,
          name: "Morning Run",
          sport_type: "Run",
          start_date: "2026-05-24T07:00:00Z",
          elapsed_time: 3600,
          moving_time: 3500,
          distance: 10000,
          total_elevation_gain: 120,
          average_heartrate: 143.6,
          max_heartrate: 174.2,
          average_cadence: 82.7,
          average_watts: 211.4,
        },
        {
          id: 222,
          name: "Evening Ride",
          sport_type: "Ride",
          start_date: "2026-05-24T18:00:00Z",
          elapsed_time: 5400,
          moving_time: 5200,
          distance: 30000,
          total_elevation_gain: 300,
        },
      ]),
    ) as typeof fetch
  })

  it("imports Strava activities and updates last_sync_at", async () => {
    const result = await syncRecentStrava("user-1", { perPage: 30, maxPages: 1 })

    expect(result).toEqual({ imported: 2, skipped: 0 })
    expect(upsertMock).toHaveBeenCalledTimes(2)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        average_heartrate: 144,
        max_heartrate: 174,
        average_cadence: 83,
        average_power: 211,
      }),
      expect.any(Object),
    )
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ last_sync_at: expect.any(String) }))
  })

  it("surfaces import errors when every activity fails", async () => {
    upsertMock.mockReturnValue({
      select: () => ({
        maybeSingle: async () => ({ data: null, error: new Error("bad integer") }),
      }),
    })

    await expect(syncRecentStrava("user-1", { perPage: 30, maxPages: 1 })).rejects.toThrow(
      "Aucune activité Strava",
    )
  })
})

describe("mapActivity", () => {
  it("maps Strava metrics to the activity row shape", () => {
    expect(
      mapActivity("user-1", {
        id: 123,
        name: "Lunch Run",
        sport_type: "Run",
        start_date: "2026-05-25T11:00:00Z",
        timezone: "Europe/Paris",
        elapsed_time: 3610,
        moving_time: 3500,
        distance: 10_250.5,
        total_elevation_gain: 150.2,
        average_heartrate: 144.4,
        max_heartrate: 178.6,
        average_cadence: 82.2,
        average_watts: 215.8,
        calories: 712.6,
      }),
    ).toMatchObject({
      user_id: "user-1",
      provider: "strava",
      provider_activity_id: "123",
      name: "Lunch Run",
      sport_type: "Run",
      start_date: "2026-05-25T11:00:00Z",
      timezone: "Europe/Paris",
      duration_sec: 3610,
      moving_time_sec: 3500,
      distance_m: 10250.5,
      elevation_gain_m: 150.2,
      average_heartrate: 144,
      max_heartrate: 179,
      average_cadence: 82,
      average_power: 216,
      calories: 713,
      source: "strava",
    })
  })

  it("falls back to type, default name, and kilojoules when optional fields are missing", () => {
    expect(
      mapActivity("user-1", {
        id: 123,
        type: "Ride",
        start_date: "2026-05-25T11:00:00Z",
        kilojoules: 456.2,
      }),
    ).toMatchObject({
      name: "Activité Strava",
      sport_type: "Ride",
      duration_sec: 0,
      moving_time_sec: 0,
      distance_m: 0,
      elevation_gain_m: 0,
      calories: 456,
    })
  })

  it("skips activities without an id or start date", () => {
    expect(mapActivity("user-1", { id: 123 })).toBeNull()
    expect(
      mapActivity("user-1", {
        start_date: "2026-05-25T11:00:00Z",
      } as Parameters<typeof mapActivity>[1]),
    ).toBeNull()
  })
})
