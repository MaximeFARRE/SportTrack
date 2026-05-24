/**
 * Terra webhook endpoint.
 *
 * Terra sends POST requests here for: auth, daily, sleep, activity, body events.
 * We verify the signature then process auth, daily, and sleep events in Next.js.
 *
 * To register the webhook with Terra, set the webhook URL in the Terra dashboard:
 *   https://dashboard.tryterra.co → Webhooks → Add endpoint
 *   URL: https://your-domain.com/api/terra/webhook
 */

import { NextRequest, NextResponse } from "next/server"

import { processTerraWebhook } from "@/lib/server/terra/webhook"

export async function POST(request: NextRequest) {
  const signature = request.headers.get("terra-signature") ?? ""
  const rawBody = await request.arrayBuffer()
  const rawBytes = Buffer.from(rawBody)

  // Verify Terra signature before processing
  if (signature && !verifySignature(rawBytes, signature)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const body = JSON.parse(rawBytes.toString("utf-8"))

  await processTerraWebhook(body).catch((error) => {
    console.error("terra webhook processing failed", error)
  })

  return NextResponse.json({ received: true })
}

function verifySignature(rawBody: Buffer, header: string): boolean {
  const secret = process.env.TERRA_WEBHOOK_SECRET
  if (!secret) return true // skip verification if not configured

  const parts: Record<string, string> = {}
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2)
    if (k && v) parts[k.trim()] = v.trim()
  }

  const timestamp = parts["t"] ?? ""
  const receivedSig = parts["v1"] ?? ""
  if (!timestamp || !receivedSig) return false

  const { createHmac } = require("crypto") as typeof import("crypto")
  const message = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody])
  const expected = createHmac("sha256", secret).update(message).digest("hex")

  return expected === receivedSig
}
