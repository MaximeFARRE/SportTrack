"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type FeedbackData = {
  rpe: number | null
  feel_score: number | null
  motivation_score: number | null
  perceived_recovery: number | null
  post_session_notes: string
  body_feeling_tags: string[]
  context_tags: string[]
  session_quality_tags: string[]
}

export async function updateActivityFeedback(
  activityId: string,
  data: FeedbackData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Non authentifié" }

  const { error } = await supabase
    .from("activities")
    .update({
      rpe: data.rpe,
      feel_score: data.feel_score,
      motivation_score: data.motivation_score,
      perceived_recovery: data.perceived_recovery,
      post_session_notes: data.post_session_notes || null,
      body_feeling_tags: data.body_feeling_tags,
      context_tags: data.context_tags,
      session_quality_tags: data.session_quality_tags,
    })
    .eq("id", activityId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/activities")
  revalidatePath(`/activities/${activityId}`)
  return {}
}
