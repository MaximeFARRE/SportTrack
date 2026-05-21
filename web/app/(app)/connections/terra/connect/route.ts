/**
 * Initiates the Terra widget flow for connecting Garmin/Polar/Fitbit.
 *
 * GET /connections/terra/connect
 *   1. Reads the authenticated user
 *   2. Calls FastAPI to generate a Terra widget session URL
 *   3. Redirects the user to the Terra widget
 *   4. After the user authenticates, Terra sends a webhook to /api/terra/webhook
 */

import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL!))
  }

  const fastapiUrl = process.env.FASTAPI_URL
  if (!fastapiUrl) {
    return NextResponse.redirect(
      new URL("/connections?error=config", process.env.NEXT_PUBLIC_BASE_URL!),
    )
  }

  const successRedirect = `${process.env.NEXT_PUBLIC_BASE_URL}/connections?provider=terra&status=connected`

  // Get the user's JWT to authenticate with FastAPI
  const {
    data: { session },
  } = await supabase.auth.getSession()

  let widgetUrl: string
  try {
    const resp = await fetch(
      `${fastapiUrl}/terra/widget-session?redirect_url=${encodeURIComponent(successRedirect)}`,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      },
    )
    if (!resp.ok) {
      const err = await resp.text()
      console.error("Terra widget session error:", err)
      return NextResponse.redirect(
        new URL("/connections?error=terra", process.env.NEXT_PUBLIC_BASE_URL!),
      )
    }
    const data = (await resp.json()) as { widget_url?: string }
    if (!data.widget_url) throw new Error("No widget_url in response")
    widgetUrl = data.widget_url
  } catch (err) {
    console.error("Failed to generate Terra widget session:", err)
    return NextResponse.redirect(
      new URL("/connections?error=terra", process.env.NEXT_PUBLIC_BASE_URL!),
    )
  }

  return NextResponse.redirect(widgetUrl)
}
