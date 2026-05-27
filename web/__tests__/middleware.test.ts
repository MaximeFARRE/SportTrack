import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: getUserMock,
    },
  }),
}))

import { updateSession } from "@/lib/supabase/middleware"

function request(path: string) {
  return new NextRequest(`https://sporttrack.test${path}`)
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: null } })
  })

  it.each(["/api/cron/garmin", "/api/cron/polar"])(
    "allows unauthenticated cron route %s to reach its handler",
    async (path) => {
      const response = await updateSession(request(path))

      expect(response.status).toBe(200)
      expect(response.headers.get("location")).toBeNull()
    },
  )

  it("redirects unauthenticated app routes to login", async () => {
    const response = await updateSession(request("/dashboard"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://sporttrack.test/login?redirect=%2Fdashboard")
  })
})
