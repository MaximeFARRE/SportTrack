import Link from "next/link"
import { Suspense } from "react"

import { SignupForm } from "./signup-form"
import { GoogleButton } from "../google-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export const metadata = { title: "Créer un compte · SportTrack" }

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>Commencez à suivre vos entraînements.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupForm />
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
            ou
          </span>
        </div>
        <Suspense>
          <GoogleButton mode="signup" />
        </Suspense>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="ml-1 font-medium text-foreground hover:underline">
          Se connecter
        </Link>
      </CardFooter>
    </Card>
  )
}
