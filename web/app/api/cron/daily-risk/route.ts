import { NextRequest, NextResponse } from "next/server"

import { recomputeDailyMetricsForUser } from "@/lib/server/metrics/daily"
import { computeRisk, getActiveUserIds, persistAssessment } from "@/lib/server/risk/compute"

export const maxDuration = 60

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  return !!expected && request.headers.get("authorization") === `Bearer ${expected}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const errors: string[] = []
  const ids = await getActiveUserIds()

  for (const userId of ids) {
    try {
      await recomputeDailyMetricsForUser(userId, { days: 120 })
      const result = await computeRisk(userId)
      await persistAssessment(result)
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed: ids.length,
    errors,
  })
}
