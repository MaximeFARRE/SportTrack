import type { Metadata } from "next"
import Link from "next/link"

import { StravaConfigForm } from "./strava-config-form"
import { getStravaConfig } from "./actions"

export const metadata: Metadata = { title: "Configuration Strava · SportTrack" }

export default async function StravaSettingsPage() {
  const config = await getStravaConfig()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Configuration Strava</h1>
        <p className="text-sm text-muted-foreground">
          Renseignez les identifiants de l'application Strava utilisée par SportTrack.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5 text-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="font-semibold text-base">Connecter un compte Strava</h2>
            <p className="text-muted-foreground">
              Une fois la configuration globale enregistrée, chaque utilisateur connecte son
              propre compte depuis la page Connexions. Cette action ne recrée ni webhook ni
              identifiants d'application.
            </p>
          </div>
          <Link
            href="/connections"
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Aller aux connexions
          </Link>
        </div>
      </div>

      {/* Tutorial */}
      <div className="rounded-lg border bg-muted/40 p-5 space-y-4 text-sm">
        <h2 className="font-semibold text-base">Comment obtenir ces valeurs ?</h2>

        <div className="space-y-1">
          <p className="font-medium">1. Créer une application Strava</p>
          <p className="text-muted-foreground">
            Rendez-vous sur{" "}
            <span className="font-mono bg-background px-1 rounded text-foreground">
              strava.com/settings/api
            </span>{" "}
            (connexion Strava requise). Cliquez sur <strong>« Create App »</strong> si vous
            n&apos;en avez pas encore.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Client ID</p>
          <p className="text-muted-foreground">
            Visible sur la page de votre application sous le champ{" "}
            <strong>« Client ID »</strong> — c&apos;est un nombre (ex. <span className="font-mono bg-background px-1 rounded text-foreground">185192</span>).
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Client Secret</p>
          <p className="text-muted-foreground">
            Sur la même page, champ <strong>« Client Secret »</strong> — cliquez sur{" "}
            <strong>« show »</strong> pour l&apos;afficher. Traitez cette valeur comme un mot de
            passe.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Callback URL à renseigner dans Strava</p>
          <p className="text-muted-foreground">
            Dans le champ <strong>« Authorization Callback Domain »</strong> de votre app Strava,
            entrez votre domaine (ex.{" "}
            <span className="font-mono bg-background px-1 rounded text-foreground">
              app.sporttrack.fr
            </span>
            ).
          </p>
        </div>
      </div>

      <StravaConfigForm initialConfig={config} />
    </div>
  )
}
