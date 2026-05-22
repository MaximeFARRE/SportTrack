"use server"

import { createClient } from "@/lib/supabase/server"

async function getAccessToken(): Promise<string> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("Non authentifié")
  return session.access_token
}

function apiUrl(): string {
  const url = process.env.FASTAPI_URL
  if (!url) throw new Error("FASTAPI_URL non configuré")
  return url
}

export async function fetchExportJson(weeks: number): Promise<string> {
  const token = await getAccessToken()
  const res = await fetch(`${apiUrl()}/export/ai-summary?weeks=${weeks}&format=json`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Export échoué : ${res.statusText}`)
  const data = await res.json()
  return JSON.stringify(data, null, 2)
}

export async function fetchExportMarkdown(weeks: number): Promise<string> {
  const token = await getAccessToken()
  const res = await fetch(`${apiUrl()}/export/ai-summary?weeks=${weeks}&format=markdown`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Export échoué : ${res.statusText}`)
  return res.text()
}
