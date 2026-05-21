"use server"

import { createServiceClient } from "@/lib/supabase/service"

export interface StravaConfigData {
  client_id: string
  client_secret: string
  webhook_verify_token: string
}

export async function getStravaConfig(): Promise<StravaConfigData> {
  const service = createServiceClient()
  const { data } = await service
    .from("strava_config")
    .select("client_id, client_secret, webhook_verify_token")
    .eq("id", 1)
    .single()

  return {
    client_id: data?.client_id ?? "",
    client_secret: data?.client_secret ?? "",
    webhook_verify_token: data?.webhook_verify_token ?? "",
  }
}

export async function saveStravaConfig(
  formData: FormData,
): Promise<{ error?: string }> {
  const client_id = (formData.get("client_id") as string | null)?.trim() ?? ""
  const client_secret = (formData.get("client_secret") as string | null)?.trim() ?? ""
  const webhook_verify_token = (formData.get("webhook_verify_token") as string | null)?.trim() ?? ""

  const service = createServiceClient()
  const { error } = await service
    .from("strava_config")
    .update({ client_id, client_secret, webhook_verify_token })
    .eq("id", 1)

  if (error) return { error: error.message }
  return {}
}
