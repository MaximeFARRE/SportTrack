"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
  redirect: z.string().optional(),
})

export type LoginState = { error?: string } | undefined

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides" }
  }

  const supabase = await createClient()

  let authError: string | null = null
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })
    if (error) authError = error.message
  } catch {
    return { error: "Impossible de se connecter. Vérifiez votre connexion." }
  }

  if (authError) {
    return { error: "Email ou mot de passe incorrect" }
  }

  redirect(parsed.data.redirect || "/dashboard")
}

export async function loginWithGoogleAction(redirectTo?: string) {
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`,
    },
  })

  if (error || !data.url) {
    return { error: "Impossible de démarrer la connexion Google" }
  }

  redirect(data.url)
}
