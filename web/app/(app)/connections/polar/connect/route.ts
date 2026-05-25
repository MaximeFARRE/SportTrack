import { createHmac, randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"

function getStateSecret() {
  return process.env.POLAR_STATE_SECRET ?? process.env.INTERNAL_SECRET ?? process.env.STRAVA_STATE_SECRET
}

function getBaseUrl(origin: string) {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? origin).replace(/\/$/, "")
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const baseUrl = getBaseUrl(request.nextUrl.origin)

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  const service = createServiceClient()
  const { data: cfg } = await service.from("polar_config").select("client_id").eq("id", 1).single()
  const clientId = cfg?.client_id || ""

  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings?error=missing_polar_config`)
  }

  const nonce = randomUUID()
  const payload = JSON.stringify({ user_id: user.id, nonce })
  const stateSecret = getStateSecret()
  if (!stateSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?error=missing_state_secret`)
  }
  const sig = createHmac("sha256", stateSecret).update(payload).digest("hex")
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url")

  const polarUrl = new URL("https://flow.polar.com/oauth2/authorization")
  polarUrl.searchParams.set("client_id", clientId)
  polarUrl.searchParams.set("redirect_uri", `${baseUrl}/api/polar/callback`)
  polarUrl.searchParams.set("response_type", "code")
  polarUrl.searchParams.set("scope", "accesslink.read_all")
  polarUrl.searchParams.set("state", state)

  return NextResponse.redirect(polarUrl)
}
