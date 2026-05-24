"use server"

import { aiSummaryToMarkdown, buildAiSummary } from "@/lib/server/export/ai-summary"
import { createClient } from "@/lib/supabase/server"

async function getUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non authentifié")
  return user.id
}

export async function fetchExportJson(weeks: number): Promise<string> {
  const userId = await getUserId()
  const data = await buildAiSummary(userId, weeks)
  return JSON.stringify(data, null, 2)
}

export async function fetchExportMarkdown(weeks: number): Promise<string> {
  const userId = await getUserId()
  const data = await buildAiSummary(userId, weeks)
  return aiSummaryToMarkdown(data)
}
