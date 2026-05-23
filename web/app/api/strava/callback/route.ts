import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

function verifyState(state: string): { user_id: string } {
  const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"))
  const { payload, sig } = decoded as { payload: string; sig: string }

  const stateSecret = process.env.STRAVA_STATE_SECRET ?? process.env.INTERNAL_SECRET
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!
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

  const fastapiUrl = process.env.FASTAPI_URL!
  let res: Response
  try {
    res = await fetch(`${fastapiUrl}/internal/strava/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SECRET!,
      },
      body: JSON.stringify({ code, user_id }),
    })
  } catch {
    return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
  }

  if (!res.ok) {
    return NextResponse.redirect(`${baseUrl}/connections?strava=error`)
  }

  return NextResponse.redirect(`${baseUrl}/connections?strava=connected`)
}
