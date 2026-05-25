import { beforeEach, describe, expect, it, vi } from "vitest"

let activityRows: unknown[] = []
let activityError: Error | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== "activities") throw new Error(`Unexpected table ${table}`)

      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: async () => ({ data: activityRows, error: activityError }),
            }),
          }),
        }),
      }
    },
  }),
}))

import { getInjurySuggestions } from "@/lib/server/injuries/suggest"

describe("getInjurySuggestions", () => {
  beforeEach(() => {
    activityRows = []
    activityError = null
  })

  it("suggests a body zone after three pain-tagged activities", async () => {
    activityRows = [
      {
        id: "a1",
        name: "Run 1",
        start_date: "2026-05-01T08:00:00Z",
        body_feeling_tags: ["douleur_genou_droit"],
      },
      {
        id: "a2",
        name: "Run 2",
        start_date: "2026-05-10T08:00:00Z",
        body_feeling_tags: ["douleur_genou_droit", "fatigue"],
      },
      {
        id: "a3",
        name: "Run 3",
        start_date: "2026-05-20T08:00:00Z",
        body_feeling_tags: ["douleur_genou_droit"],
      },
    ]

    await expect(getInjurySuggestions("user-1")).resolves.toEqual([
      {
        body_zone: "genou_droit",
        activity_count: 3,
        first_date: "2026-05-01",
        last_date: "2026-05-20",
        message: "Voulez-vous déclarer une blessure ? 3 activités signalent une douleur : genou droit",
      },
    ])
  })

  it("ignores unknown tags, non-array payloads, and zones below threshold", async () => {
    activityRows = [
      {
        id: "a1",
        name: "Run 1",
        start_date: "2026-05-01T08:00:00Z",
        body_feeling_tags: ["douleur_dos", "unknown"],
      },
      {
        id: "a2",
        name: "Run 2",
        start_date: "2026-05-02T08:00:00Z",
        body_feeling_tags: "douleur_dos",
      },
      {
        id: "a3",
        name: "Run 3",
        start_date: "2026-05-03T08:00:00Z",
        body_feeling_tags: ["douleur_dos"],
      },
    ]

    await expect(getInjurySuggestions("user-1")).resolves.toEqual([])
  })

  it("throws database errors", async () => {
    activityError = new Error("activities failed")

    await expect(getInjurySuggestions("user-1")).rejects.toThrow("activities failed")
  })
})
