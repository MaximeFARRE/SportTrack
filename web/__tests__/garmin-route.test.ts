import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { runGarminScriptMock } = vi.hoisted(() => ({
  runGarminScriptMock: vi.fn(),
}))

vi.mock("@/lib/server/garmin/sync", () => ({
  runGarminScript: runGarminScriptMock,
}))

import { POST } from "@/app/api/garmin/route"

function request(headers?: HeadersInit) {
  return new Request("https://sporttrack.test/api/garmin", {
    method: "POST",
    headers,
    body: JSON.stringify({ command: "test", email: "runner@example.com", password: "secret" }),
  }) as Parameters<typeof POST>[0]
}

describe("POST /api/garmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GARMIN_BRIDGE_SECRET", "")
    vi.stubEnv("INTERNAL_SECRET", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("runs the Garmin script in local mode", async () => {
    runGarminScriptMock.mockResolvedValue({ ok: true, provider_user_id: "runner@example.com" })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, provider_user_id: "runner@example.com" })
    expect(runGarminScriptMock).toHaveBeenCalledWith({
      command: "test",
      email: "runner@example.com",
      password: "secret",
    })
  })

  it("rejects requests with the wrong local secret when configured", async () => {
    vi.stubEnv("GARMIN_BRIDGE_SECRET", "expected-secret")

    const response = await POST(request({ "x-garmin-bridge-secret": "wrong-secret" }))

    expect(response.status).toBe(401)
    expect(runGarminScriptMock).not.toHaveBeenCalled()
  })

  it("returns script errors as JSON", async () => {
    runGarminScriptMock.mockRejectedValue(new Error("Garmin login failed"))

    const response = await POST(request())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Garmin login failed" })
  })
})
