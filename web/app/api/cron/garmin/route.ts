import { NextRequest, NextResponse } from "next/server"

import { getActiveGarminUserIds, syncGarminMetrics } from "@/lib/server/garmin/sync"

export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get("authorization") === `Bearer ${expected}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const errors: string[] = []
  const synced: Array<{ user_id: string; days: number }> = []
  const ids = await getActiveGarminUserIds()

  for (const userId of ids) {
    try {
      const days = await syncGarminMetrics(userId, 7)
      synced.push({ user_id: userId, days })
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed: ids.length,
    synced,
    errors,
  })
}
