import { beforeEach, describe, expect, it, vi } from "vitest"

const updateMock = vi.fn()

let activityRow: unknown = null
let zoneRows: unknown[] = []
let tokenError: Error | null = null

vi.mock("@/lib/server/strava/tokens", () => ({
  ensureValidStravaToken: vi.fn(async () => {
    if (tokenError) throw tokenError
    return "strava-token"
  }),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "activities") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: activityRow, error: null }),
              }),
            }),
          }),
          update: updateMock,
        }
      }

      if (table === "hr_zones") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: zoneRows, error: null }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { computeIntensityForActivity } from "@/lib/server/strava/intensity"

function eqChain() {
  const chain = {
    eq: vi.fn(() => chain),
  }
  return chain
}

describe("computeIntensityForActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activityRow = {
      provider: "strava",
      provider_activity_id: "activity-123",
    }
    zoneRows = [
      { zone_number: 1, zone_name: "Z1", hr_min: 0, hr_max: 120, color_hex: "#111111" },
      { zone_number: 2, zone_name: "Z2", hr_min: 120, hr_max: 150, color_hex: "#222222" },
      { zone_number: 3, zone_name: "Z3", hr_min: 150, hr_max: null, color_hex: "#333333" },
    ]
    tokenError = null
    updateMock.mockReturnValue(eqChain())
    global.fetch = vi.fn(async () =>
      Response.json({ heartrate: { data: [90, 119, 120, 149, 150, 160, 80] } }),
    ) as typeof fetch
  })

  it("classifies Strava heart-rate stream seconds into configured zones", async () => {
    const result = await computeIntensityForActivity("user-1", "activity-1")

    expect(result).toEqual([
      { zone: 1, name: "Z1", color: "#111111", sec: 3 },
      { zone: 2, name: "Z2", color: "#222222", sec: 2 },
      { zone: 3, name: "Z3", color: "#333333", sec: 2 },
    ])
    expect(fetch).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/activities/activity-123/streams?keys=heartrate&key_by_type=true",
      { headers: { Authorization: "Bearer strava-token" } },
    )
    expect(updateMock).toHaveBeenCalledWith({ time_in_zones_json: result })
  })

  it("returns null for non-Strava activities", async () => {
    activityRow = { provider: "manual", provider_activity_id: null }

    await expect(computeIntensityForActivity("user-1", "activity-1")).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("returns null when token refresh fails", async () => {
    tokenError = new Error("expired")

    await expect(computeIntensityForActivity("user-1", "activity-1")).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns null when Strava does not return a heart-rate stream", async () => {
    global.fetch = vi.fn(async () => Response.json({ heartrate: { data: [] } })) as typeof fetch

    await expect(computeIntensityForActivity("user-1", "activity-1")).resolves.toBeNull()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
