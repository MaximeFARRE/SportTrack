"use client"

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"

import { loginWithGoogleAction } from "./login/actions"
import { Button } from "@/components/ui/button"

export function GoogleButton({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams()
  const redirectTo = params.get("redirect") ?? undefined
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await loginWithGoogleAction(redirectTo)
            if (result?.error) setError(result.error)
          })
        }}
      >
        <svg aria-hidden className="mr-2 size-4" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.08 1.08-2.77 2.27-5.71 2.27-4.55 0-8.18-3.74-8.18-8.34s3.63-8.34 8.18-8.34c2.46 0 4.27.97 5.6 2.21l2.31-2.31C18.86 2.45 16.3 1 12.48 1 5.65 1 0 6.54 0 13.4s5.65 12.4 12.48 12.4c3.69 0 6.47-1.21 8.64-3.47 2.23-2.23 2.93-5.36 2.93-7.92 0-.79-.06-1.5-.18-2.16h-11.39z"
          />
        </svg>
        {isPending ? "Redirection..." : mode === "login" ? "Continuer avec Google" : "S'inscrire avec Google"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
