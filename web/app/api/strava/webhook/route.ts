/**
 * Strava webhook endpoint.
 *
 * GET  — Strava challenge verification during subscription setup.
 * POST — Receives activity create/update/delete events from Strava.
 *
 * To register the subscription (run once):
 *   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
 *     -F client_id=<STRAVA_CLIENT_ID> \
 *     -F client_secret=<STRAVA_CLIENT_SECRET> \
 *     -F callback_url=https://your-domain.com/api/strava/webhook \
 *     -F verify_token=<STRAVA_WEBHOOK_VERIFY_TOKEN>
 */

import { NextRequest, NextResponse } from "next/server"

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? ""

/** Strava calls GET to verify ownership before activating the subscription. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return NextResponse.json({ "hub.challenge": challenge })
  }

  return new NextResponse("Forbidden", { status: 403 })
}

/** Strava calls POST when an activity is created, updated, or deleted. */
export async function POST(request: NextRequest) {
  // Respond immediately so Strava doesn't time out waiting
  const body = await request.json().catch(() => null)

  if (body && body.object_type === "activity" && body.aspect_type === "create") {
    void processActivityEvent(body).catch(console.error)
  }

  return NextResponse.json({ received: true })
}

interface StravaEvent {
  object_type: string
  aspect_type: string
  object_id: number   // activity ID
  owner_id: number    // Strava athlete ID
}

async function processActivityEvent(event: StravaEvent) {
  const fastapiUrl = process.env.FASTAPI_URL!

  // Resolve user_id from the Strava athlete id via FastAPI
  // FastAPI looks up provider_connections where provider_user_id = owner_id
  await fetch(`${fastapiUrl}/internal/strava/webhook-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      activity_id: event.object_id,
      strava_athlete_id: String(event.owner_id),
    }),
  })
}
