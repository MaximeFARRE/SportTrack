import type { Metadata } from "next"
import Link from "next/link"

import { StravaConfigForm } from "./strava/strava-config-form"
import { getStravaConfig } from "./strava/actions"
import { TerraConfigForm } from "./terra/terra-config-form"
import { getTerraConfig } from "./terra/actions"

export const metadata: Metadata = { title: "Paramètres · SportTrack" }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const [stravaConfig, terraConfig] = await Promise.all([
    getStravaConfig(),
    getTerraConfig(),
  ])
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les intégrations utilisées par SportTrack.
        </p>
      </div>

      {error === "missing_config" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Enregistrez le Client ID et le Client Secret avant de lancer la connexion Strava.
        </div>
      ) : null}

      {error === "missing_state_secret" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          La variable STRAVA_STATE_SECRET ou INTERNAL_SECRET doit être configurée côté serveur
          avant de lancer la connexion Strava.
        </div>
      ) : null}

      {error === "terra_config" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Enregistrez le Dev ID et l'API Key Terra avant de connecter une montre.
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="rounded-lg border bg-card p-5 text-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="font-semibold text-base">Connexion Strava</h2>
              <p className="text-muted-foreground">
                Lance le flux OAuth Strava pour connecter votre compte utilisateur. Cette action ne
                recrée ni webhook ni identifiants d'application.
              </p>
            </div>
            <Link
              href="/connections/strava/connect"
              className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              Connecter Strava
            </Link>
          </div>
        </div>

        <StravaConfigForm initialConfig={stravaConfig} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Montres connectées</h2>
          <p className="text-sm text-muted-foreground">
            Terra permet de connecter Garmin, Polar, Fitbit, Coros, Suunto, Wahoo, Withings et
            Oura via un widget d'authentification.
          </p>
        </div>

        <TerraConfigForm
          callbackUrl={`${baseUrl}/api/terra/webhook`}
          initialConfig={terraConfig}
        />
      </section>
    </div>
  )
}
