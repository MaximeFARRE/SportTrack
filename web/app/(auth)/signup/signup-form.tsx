"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { signupAction, type SignupState } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Création..." : "Créer mon compte"}
    </Button>
  )
}

export function SignupForm() {
  const [state, formAction] = useActionState<SignupState, FormData>(signupAction, undefined)

  if (state?.success) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">Email envoyé.</p>
        <p className="mt-1 text-muted-foreground">
          Vérifiez votre boîte mail pour confirmer votre adresse, puis revenez vous connecter.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Prénom ou pseudo</Label>
        <Input id="displayName" name="displayName" required autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
