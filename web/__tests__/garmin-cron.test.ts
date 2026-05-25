import { beforeEach, describe, expect, it, vi } from "vitest"

const { getActiveGarminUserIdsMock, syncGarminMetricsMock } = vi.hoisted(() => ({
  getActiveGarminUserIdsMock: vi.fn(),
  syncGarminMetricsMock: vi.fn(),
}))

vi.mock("@/lib/server/garmin/sync", () => ({
  getActiveGarminUserIds: getActiveGarminUserIdsMock,
  syncGarminMetrics: syncGarminMetricsMock,
}))

import { GET } from "@/app/api/cron/garmin/route"

function request(secret?: string) {
  return new Request("https://sporttrack.test/api/cron/garmin", {
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  }) as Parameters<typeof GET>[0]
}

describe("GET /api/cron/garmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("CRON_SECRET", "cron-secret")
  })

  it("rejects unauthorized requests", async () => {
    const response = await GET(request("wrong-secret"))

    expect(response.status).toBe(401)
    expect(getActiveGarminUserIdsMock).not.toHaveBeenCalled()
  })

  it("syncs every active Garmin user over the last week", async () => {
    getActiveGarminUserIdsMock.mockResolvedValue(["user-1", "user-2"])
    syncGarminMetricsMock.mockResolvedValueOnce(7).mockResolvedValueOnce(5)

    const response = await GET(request("cron-secret"))

    expect(response.status).toBe(200)
    expect(syncGarminMetricsMock).toHaveBeenCalledWith("user-1", 7)
    expect(syncGarminMetricsMock).toHaveBeenCalledWith("user-2", 7)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: 2,
      synced: [
        { user_id: "user-1", days: 7 },
        { user_id: "user-2", days: 5 },
      ],
      errors: [],
    })
  })

  it("continues syncing other users when one Garmin sync fails", async () => {
    getActiveGarminUserIdsMock.mockResolvedValue(["user-1", "user-2"])
    syncGarminMetricsMock.mockRejectedValueOnce(new Error("Garmin unavailable")).mockResolvedValueOnce(3)

    const response = await GET(request("cron-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      processed: 2,
      synced: [{ user_id: "user-2", days: 3 }],
      errors: ["user-1: Garmin unavailable"],
    })
  })
})
