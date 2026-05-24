import { createServiceClient } from "@/lib/supabase/service"

export async function getTerraCredentials(): Promise<{
  devId: string
  apiKey: string
  webhookSecret: string
}> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("terra_config")
    .select("dev_id, api_key, webhook_secret")
    .eq("id", 1)
    .maybeSingle()

  return {
    devId: data?.dev_id || process.env.TERRA_DEV_ID || "",
    apiKey: data?.api_key || process.env.TERRA_API_KEY || "",
    webhookSecret: data?.webhook_secret || process.env.TERRA_WEBHOOK_SECRET || "",
  }
}
