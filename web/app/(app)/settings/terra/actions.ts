"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export interface TerraConfigData {
  dev_id: string
  api_key: string
  webhook_secret: string
}

async function requireAdmin(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/dashboard")
}

export async function getTerraConfig(): Promise<TerraConfigData> {
  await requireAdmin()
  const service = createServiceClient()
  const { data } = await service
    .from("terra_config")
    .select("dev_id, api_key, webhook_secret")
    .eq("id", 1)
    .maybeSingle()

  return {
    dev_id: data?.dev_id || process.env.TERRA_DEV_ID || "",
    api_key: data?.api_key || process.env.TERRA_API_KEY || "",
    webhook_secret: data?.webhook_secret || process.env.TERRA_WEBHOOK_SECRET || "",
  }
}

export async function saveTerraConfig(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin()
  const dev_id = (formData.get("dev_id") as string | null)?.trim() ?? ""
  const api_key = (formData.get("api_key") as string | null)?.trim() ?? ""
  const webhook_secret = (formData.get("webhook_secret") as string | null)?.trim() ?? ""

  const service = createServiceClient()
  const { error } = await service
    .from("terra_config")
    .upsert({ id: 1, dev_id, api_key, webhook_secret }, { onConflict: "id" })

  if (error) return { error: error.message }
  return {}
}
