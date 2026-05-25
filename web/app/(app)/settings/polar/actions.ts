"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export interface PolarConfigData {
  client_id: string
  client_secret: string
}

async function requireAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/dashboard")
}

export async function getPolarConfig(): Promise<PolarConfigData> {
  await requireAdmin()
  const service = createServiceClient()
  const { data } = await service
    .from("polar_config")
    .select("client_id, client_secret")
    .eq("id", 1)
    .single()

  return {
    client_id: data?.client_id ?? "",
    client_secret: data?.client_secret ?? "",
  }
}

export async function savePolarConfig(
  formData: FormData,
): Promise<{ error?: string }> {
  await requireAdmin()
  const client_id = (formData.get("client_id") as string | null)?.trim() ?? ""
  const client_secret = (formData.get("client_secret") as string | null)?.trim() ?? ""

  const service = createServiceClient()
  const { error } = await service
    .from("polar_config")
    .upsert({ id: 1, client_id, client_secret }, { onConflict: "id" })

  if (error) return { error: error.message }
  return {}
}
