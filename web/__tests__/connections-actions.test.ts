import { beforeEach, describe, expect, it, vi } from "vitest"

const { revalidatePathMock, syncRecentStravaMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  syncRecentStravaMock: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock("@/lib/server/strava/sync", () => ({
  importAllStravaHistory: vi.fn(),
  importStravaHistory: vi.fn(),
  syncRecentStrava: syncRecentStravaMock,
}))

vi.mock("@/lib/server/garmin/sync", () => ({
  syncGarminMetrics: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  }),
}))

import { syncStrava } from "@/app/(app)/connections/actions"

describe("connections actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    syncRecentStravaMock.mockResolvedValue({ imported: 1, skipped: 0 })
  })

  it("revalidates progression after a Strava sync", async () => {
    await expect(syncStrava()).resolves.toEqual({ synced: 1 })

    expect(revalidatePathMock).toHaveBeenCalledWith("/connections")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard")
    expect(revalidatePathMock).toHaveBeenCalledWith("/progression")
  })
})
