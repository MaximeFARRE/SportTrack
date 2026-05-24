const WIDGET_URL = "https://api.tryterra.co/v2/auth/generateWidgetSession"

export async function generateTerraWidgetSession(opts: {
  reference_id: string
  success_redirect: string
  failure_redirect: string
}): Promise<{ url: string; session_id?: string }> {
  const devId = process.env.TERRA_DEV_ID
  const apiKey = process.env.TERRA_API_KEY

  if (!devId || !apiKey) {
    throw new Error("Terra credentials manquantes")
  }

  const res = await fetch(WIDGET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "dev-id": devId,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      reference_id: opts.reference_id,
      providers: "GARMIN,POLAR,FITBIT,COROS,SUUNTO,WAHOO,WITHINGS,OURA",
      auth_success_redirect_url: opts.success_redirect,
      auth_failure_redirect_url: opts.failure_redirect,
      language: "fr",
    }),
  })

  if (!res.ok) throw new Error(`Terra widget failed: ${res.status}`)

  const data = (await res.json()) as { url?: string; widget_url?: string; session_id?: string }
  const url = data.url ?? data.widget_url
  if (!url) throw new Error("Terra widget URL absente")

  return { url, session_id: data.session_id }
}
