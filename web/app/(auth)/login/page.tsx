import Link from "next/link"
import { Suspense } from "react"

import { LoginForm } from "./login-form"
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

export const metadata = { title: "Connexion · SportTrack" }

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Accédez à votre tableau de bord d&apos;entraînement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
            ou
          </span>
        </div>
        <GoogleButton mode="login" />
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="ml-1 font-medium text-foreground hover:underline">
          Créer un compte
        </Link>
      </CardFooter>
    </Card>
  )
}
