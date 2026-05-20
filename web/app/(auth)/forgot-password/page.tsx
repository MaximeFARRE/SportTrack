"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { forgotPasswordAction, type ForgotState } from "./actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Envoi..." : "Envoyer le lien"}
    </Button>
  )
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState<ForgotState, FormData>(forgotPasswordAction, undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>
          Saisissez votre email, nous vous enverrons un lien de réinitialisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state?.success ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
            Si un compte existe pour cette adresse, un email vient d&apos;être envoyé.
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {state?.error ? (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            ) : null}
            <SubmitButton />
          </form>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          ← Retour à la connexion
        </Link>
      </CardFooter>
    </Card>
  )
}
