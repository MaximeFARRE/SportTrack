/**
 * Initiates the Terra widget flow for connecting Garmin/Polar/Fitbit.
 *
 * GET /connections/terra/connect
 *   1. Reads the authenticated user
 *   2. Calls Terra to generate a widget session URL
 *   3. Redirects the user to the Terra widget
 *   4. After the user authenticates, Terra sends a webhook to /api/terra/webhook
 */

import { NextResponse } from "next/server"

import { generateTerraWidgetSession } from "@/lib/server/terra/widget"
import { createClient } from "@/lib/supabase/server"

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", getBaseUrl()))
  }

  const baseUrl = getBaseUrl()
  const successRedirect = `${baseUrl}/connections?terra=connected`
  const failureRedirect = `${baseUrl}/connections?terra=error`

  let widgetUrl: string
  try {
    const session = await generateTerraWidgetSession({
      reference_id: user.id,
      success_redirect: successRedirect,
      failure_redirect: failureRedirect,
    })
    widgetUrl = session.url
  } catch (err) {
    console.error("Failed to generate Terra widget session:", err)
    return NextResponse.redirect(
      new URL("/settings?error=terra_config", baseUrl),
    )
  }

  return NextResponse.redirect(widgetUrl)
}
