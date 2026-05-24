import { NextRequest, NextResponse } from "next/server"

import { getActiveUserIds, getInjurySuggestions } from "@/lib/server/injuries/suggest"

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
  const hits: Array<{ user_id: string; suggestions_count: number }> = []
  const ids = await getActiveUserIds()

  for (const userId of ids) {
    try {
      const suggestions = await getInjurySuggestions(userId)
      if (suggestions.length > 0) {
        console.warn("[INJURY SUGGESTIONS]", { user_id: userId, suggestions })
        hits.push({ user_id: userId, suggestions_count: suggestions.length })
      }
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed: ids.length,
    hits,
    errors,
  })
}
