"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z
  .object({
    email: z.string().email("Email invalide"),
    password: z.string().min(8, "8 caractères minimum"),
    displayName: z.string().min(1, "Nom requis").max(60),
  })

export type SignupState = { error?: string; success?: boolean } | undefined

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" }
  }

  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
