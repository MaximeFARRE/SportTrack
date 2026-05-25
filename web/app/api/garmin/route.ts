import { NextResponse, type NextRequest } from "next/server"

import { runGarminScript } from "@/lib/server/garmin/sync"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const secret = process.env.GARMIN_BRIDGE_SECRET ?? process.env.INTERNAL_SECRET ?? ""

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Garmin bridge secret missing" }, { status: 500 })
    }

    if (request.headers.get("x-garmin-bridge-secret") !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
  } else if (secret && request.headers.get("x-garmin-bridge-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>
    const result = await runGarminScript(payload)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Garmin bridge failed" },
      { status: 500 },
    )
  }
}
