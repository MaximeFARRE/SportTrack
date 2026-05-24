import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

function getStateSecret() {
  return process.env.STRAVA_STATE_SECRET ?? process.env.INTERNAL_SECRET
}

function getBaseUrl(origin: string) {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? origin).replace(/\/$/, "")
}

function verifyState(state: string): { user_id: string } {
  const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"))
  const { payload, sig } = decoded as { payload: string; sig: string }

  const stateSecret = getStateSecret()
  if (!stateSecret) throw new Error("state secret manquant")
  const expected = createHmac("sha256", stateSecret).update(payload).digest("hex")

  let valid = false
  try {
    valid = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
  } catch {
    valid = false
  }

  if (!valid) throw new Error("state invalide")

  return JSON.parse(payload) as { user_id: string }
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request.nextUrl.origin)
  const { searchParams } = request.nextUrl

  const error = searchParams.get("error")
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
  }

  let user_id: string
  try {
    ;({ user_id } = verifyState(state))
  } catch {
    return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
  }

  try {
    const { exchangeCodeForToken, upsertStravaConnection } = await import(
      "@/lib/server/strava/tokens"
    )
    const { syncRecentStrava } = await import("@/lib/server/strava/sync")
    const token = await exchangeCodeForToken(code)
    await upsertStravaConnection(user_id, token)
    await syncRecentStrava(user_id, { perPage: 30, maxPages: 2 }).catch((syncError) => {
      console.error("initial strava sync failed", syncError)
    })
  } catch (e) {
    console.error("strava callback failed", e)
    return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
  }

  return NextResponse.redirect(`${baseUrl}/connections?strava=connected`)
}
