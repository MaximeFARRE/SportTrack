import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"

function getStateSecret() {
  return process.env.POLAR_STATE_SECRET ?? process.env.INTERNAL_SECRET ?? process.env.STRAVA_STATE_SECRET
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
    console.error("Polar OAuth callback params missing or error", { error, code, state })
    return NextResponse.redirect(`${baseUrl}/connections?polar=error`)
  }

  let user_id: string
  try {
    ;({ user_id } = verifyState(state))
  } catch (err) {
    console.error("Polar state verification failed", err)
    return NextResponse.redirect(`${baseUrl}/connections?polar=error`)
  }

  const supabase = createServiceClient()

  try {
    // 1. Get credentials
    const { data: cfg } = await supabase
      .from("polar_config")
      .select("client_id, client_secret")
      .eq("id", 1)
      .single()

    if (!cfg?.client_id || !cfg?.client_secret) {
      throw new Error("Polar app config missing")
    }

    const { client_id, client_secret } = cfg

    // 2. Exchange authorization code
    const authHeader = Buffer.from(`${client_id}:${client_secret}`).toString("base64")
    const tokenResponse = await fetch("https://polarremote.com/v2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl}/api/polar/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      throw new Error(`Polar token exchange failed: ${tokenResponse.status} ${errText}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const polarUserId = String(tokenData.x_user_id)

    if (!accessToken || !polarUserId) {
      throw new Error("Invalid token exchange response")
    }

    // 3. Register user with Polar AccessLink
    const regResponse = await fetch("https://www.polaraccesslink.com/v3/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        "member-id": user_id,
      }),
    })

    if (!regResponse.ok && regResponse.status !== 409) {
      const errText = await regResponse.text()
      throw new Error(`Polar user registration failed: ${regResponse.status} ${errText}`)
    }

    // 4. Save connection in Supabase
    const { error: upsertError } = await supabase.from("provider_connections").upsert(
      {
        user_id,
        provider: "polar",
        provider_user_id: polarUserId,
        access_token: accessToken,
        is_active: true,
        scopes: ["accesslink.read_all"],
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    )

    if (upsertError) throw upsertError

    // 5. Trigger initial sync
    const { syncPolarMetrics } = await import("@/lib/server/polar/sync")
    syncPolarMetrics(user_id, 30).catch((syncErr) => {
      console.error("Initial Polar metrics sync failed", syncErr)
    })

  } catch (e) {
    console.error("Polar callback error", e)
    return NextResponse.redirect(`${baseUrl}/connections?polar=error`)
  }

  return NextResponse.redirect(`${baseUrl}/connections?polar=connected`)
}
