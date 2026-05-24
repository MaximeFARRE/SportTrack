import Link from "next/link"
import {
  Activity,
  HeartPulse,
  LineChart,
  ShieldAlert,
  Sparkles,
  Watch,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const FEATURES = [
  {
    icon: Watch,
    title: "Multi-source automatique",
    body: "Strava, Garmin, Polar, Fitbit, Apple Health — vos données se synchronisent toutes seules.",
  },
  {
    icon: ShieldAlert,
    title: "Prévention du surentraînement",
    body: "Détection multivariée intégrant HRV, sommeil, FC repos, ACWR et ressenti.",
  },
  {
    icon: Sparkles,
    title: "Coach IA intégré",
    body: "Analyses personnalisées basées sur vos données réelles, jamais inventées.",
  },
  {
    icon: LineChart,
    title: "CTL / ATL / TSB",
    body: "Modèle de performance utilisé par les coachs pros, calculé en continu.",
  },
  {
    icon: HeartPulse,
    title: "Zones FC personnelles",
    body: "Calculées automatiquement depuis votre FC max, modifiables manuellement.",
  },
  {
    icon: Activity,
    title: "Tous les sports",
    body: "Course, vélo, natation, musculation, yoga, sports collectifs — saisie manuelle incluse.",
  },
]

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            <span>SportTrack</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
              Connexion
            </Link>
            <Link href="/signup" className={buttonVariants()}>
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-16 text-center md:py-24">
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Le coach qui lit toutes vos données sportives.
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            Suivez vos performances, vos volumes et votre récupération en un seul endroit.
            SportTrack détecte le surentraînement avant qu&apos;il ne devienne une blessure et
            vous aide à planifier vos semaines avec une IA spécialisée.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Commencer gratuitement
            </Link>
            <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
              J&apos;ai déjà un compte
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-semibold md:text-3xl">
          Tout ce dont un sportif sérieux a besoin
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="flex flex-col gap-3 p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} SportTrack</span>
          <span>Construit avec Next.js et Supabase</span>
        </div>
      </footer>
    </div>
  )
}
