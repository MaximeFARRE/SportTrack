"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  email: z.string().email("Email invalide"),
})

export type ForgotState = { error?: string; success?: boolean } | undefined

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email invalide" }
  }

  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    // Do not leak account existence. Always show success.
    return { success: true }
  }

  return { success: true }
}
