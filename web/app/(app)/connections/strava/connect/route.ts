import { createHmac, randomUUID } from "crypto"
import { NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  const service = createServiceClient()
  const { data: cfg } = await service.from("strava_config").select("client_id").eq("id", 1).single()
  const clientId = cfg?.client_id || ""

  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/strava?error=missing_config`)
  }

  const nonce = randomUUID()
  const payload = JSON.stringify({ user_id: user.id, nonce })
  const stateSecret = process.env.STRAVA_STATE_SECRET
  if (!stateSecret) {
    return NextResponse.redirect(`${baseUrl}/settings/strava?error=missing_state_secret`)
  }
  const sig = createHmac("sha256", stateSecret).update(payload).digest("hex")
  const state = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url")

  const stravaUrl = new URL("https://www.strava.com/oauth/authorize")
  stravaUrl.searchParams.set("client_id", clientId)
  stravaUrl.searchParams.set("redirect_uri", `${baseUrl}/api/strava/callback`)
  stravaUrl.searchParams.set("response_type", "code")
  stravaUrl.searchParams.set("scope", "read,activity:read_all")
  stravaUrl.searchParams.set("approval_prompt", "auto")
  stravaUrl.searchParams.set("state", state)

  return NextResponse.redirect(stravaUrl)
}
