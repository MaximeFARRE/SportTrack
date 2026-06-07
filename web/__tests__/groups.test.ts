import { beforeEach, describe, expect, it, vi } from "vitest"

import { getGroupMember, getGroupMembers } from "@/lib/server/groups"

type MemberRow = {
  group_id: string
  user_id: string
  role: "admin" | "coach" | "athlete"
  target_time_sec: number | null
  created_at: string
}

let memberRow: MemberRow | null = null
let memberRows: MemberRow[] = []
let memberError: Error | null = null
let profileRows: Array<{ id: string; display_name: string | null; avatar_url: string | null; email: string }> = []
let profileError: Error | null = null
let filters: Record<string, string> = {}
let inFilters: Record<string, string[]> = {}

const supabase = {
  from: (table: string) => {
    if (table === "group_members") {
      return {
        select: (columns: string) => ({
          eq: (column: string, value: string) => {
            filters[column] = value

            if (columns === "user_id") {
              return Promise.resolve({ data: memberRows.map((row) => ({ user_id: row.user_id })), error: memberError })
            }

            return {
              eq: (column: string, value: string) => {
                filters[column] = value
                return {
                  maybeSingle: async () => ({ data: memberRow, error: memberError }),
                }
              },
              then: (resolve: (value: { data: MemberRow[]; error: Error | null }) => unknown) =>
                Promise.resolve({ data: memberRows, error: memberError }).then(resolve),
            }
          },
        }),
      }
    }

    if (table === "profiles") {
      return {
        select: () => ({
          in: (column: string, values: string[]) => {
            inFilters[column] = values
            return Promise.resolve({ data: profileRows, error: profileError })
          },
        }),
      }
    }

    throw new Error(`Unexpected table ${table}`)
  },
}

describe("getGroupMember", () => {
  beforeEach(() => {
    memberRow = null
    memberRows = []
    memberError = null
    profileRows = []
    profileError = null
    filters = {}
    inFilters = {}
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

  it("loads group members and attaches profiles without a PostgREST relationship", async () => {
    memberRows = [
      {
        group_id: "group-1",
        user_id: "user-1",
        role: "admin",
        target_time_sec: null,
        created_at: "2026-06-05T12:00:00Z",
      },
      {
        group_id: "group-1",
        user_id: "user-2",
        role: "athlete",
        target_time_sec: 14_400,
        created_at: "2026-06-05T12:05:00Z",
      },
    ]
    profileRows = [
      { id: "user-1", display_name: "Admin", avatar_url: null, email: "admin@example.com" },
      { id: "user-2", display_name: "Athlete", avatar_url: null, email: "athlete@example.com" },
    ]

    await expect(getGroupMembers(supabase as any, "group-1")).resolves.toEqual([
      { ...memberRows[0], profiles: { display_name: "Admin", avatar_url: null, email: "admin@example.com" } },
      { ...memberRows[1], profiles: { display_name: "Athlete", avatar_url: null, email: "athlete@example.com" } },
    ])
    expect(filters.group_id).toBe("group-1")
    expect(inFilters.id).toEqual(["user-1", "user-2"])
  })
})
