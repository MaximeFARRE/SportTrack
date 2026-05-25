import { beforeEach, describe, expect, it, vi } from "vitest"

let connectionRows: Array<{ user_id: string }> = []
let connectionError: Error | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "provider_connections") throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: connectionRows, error: connectionError }),
          }),
        }),
      }
    },
  }),
}))

import { getActiveGarminUserIds } from "@/lib/server/garmin/sync"

describe("getActiveGarminUserIds", () => {
  beforeEach(() => {
    connectionRows = []
    connectionError = null
  })

  it("deduplicates active Garmin user ids", async () => {
    connectionRows = [{ user_id: "user-1" }, { user_id: "user-2" }, { user_id: "user-1" }]

    await expect(getActiveGarminUserIds()).resolves.toEqual(["user-1", "user-2"])
  })

  it("throws connection query errors", async () => {
    connectionError = new Error("connections failed")

    await expect(getActiveGarminUserIds()).rejects.toThrow("connections failed")
  })
})
