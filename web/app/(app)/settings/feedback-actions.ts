"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function submitAppFeedback(
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Non authentifié" }

  const feedbackType = formData.get("feedback_type") as string
  const message = (formData.get("message") as string)?.trim() ?? ""

  if (!feedbackType || !["bug", "feature", "other"].includes(feedbackType)) {
    return { error: "Type de retour invalide." }
  }

  if (!message) {
    return { error: "Le message ne peut pas être vide." }
  }

  if (message.length > 5000) {
    return { error: "Le message est trop long (maximum 5000 caractères)." }
  }

  const { error } = await supabase.from("app_feedback").insert({
    user_id: user.id,
    feedback_type: feedbackType as "bug" | "feature" | "other",
    message,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}
