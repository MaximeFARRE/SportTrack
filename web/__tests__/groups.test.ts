import { beforeEach, describe, expect, it, vi } from "vitest"

import { getGroupMember } from "@/lib/server/groups"

type MemberRow = {
  group_id: string
  user_id: string
  role: "admin" | "coach" | "athlete"
  target_time_sec: number | null
  created_at: string
}

let memberRow: MemberRow | null = null
let memberError: Error | null = null
let filters: Record<string, string> = {}

const supabase = {
  from: (table: string) => {
    if (table !== "group_members") throw new Error(`Unexpected table ${table}`)

    return {
      select: () => ({
        eq: (column: string, value: string) => {
          filters[column] = value
          return {
            eq: (column: string, value: string) => {
              filters[column] = value
              return {
                maybeSingle: async () => ({ data: memberRow, error: memberError }),
              }
            },
          }
        },
      }),
    }
  },
}

describe("getGroupMember", () => {
  beforeEach(() => {
    memberRow = null
    memberError = null
    filters = {}
    vi.restoreAllMocks()
  })

  it("loads the current member with group and user filters", async () => {
    memberRow = {
      group_id: "group-1",
      user_id: "user-1",
      role: "coach",
      target_time_sec: 12_600,
      created_at: "2026-06-05T12:00:00Z",
    }

    await expect(getGroupMember(supabase as any, "group-1", "user-1")).resolves.toEqual(memberRow)
    expect(filters).toEqual({ group_id: "group-1", user_id: "user-1" })
  })

  it("returns null when the membership query fails", async () => {
    memberError = new Error("members failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(getGroupMember(supabase as any, "group-1", "user-1")).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith("Error fetching group member:", memberError)
  })
})
