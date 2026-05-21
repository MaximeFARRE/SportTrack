"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  password: z.string().min(8, "8 caractères minimum"),
})

export type ResetState = { error?: string } | undefined

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({ password: formData.get("password") })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { error: "Lien expiré ou invalide. Refaites une demande." }
  }

  redirect("/dashboard")
}
