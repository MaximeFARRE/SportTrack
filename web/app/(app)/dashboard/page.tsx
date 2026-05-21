import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Tableau de bord · SportTrack" }

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Bienvenue 👋</h2>
        <p className="text-sm text-muted-foreground">
          Votre tableau de bord est encore vide. Connectez Strava ou Garmin pour commencer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Compléter votre profil</CardTitle>
            <CardDescription>FC max, VMA, sport principal — base des calculs.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">À configurer.</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Connecter Strava</CardTitle>
            <CardDescription>Pour importer automatiquement vos activités.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">À connecter.</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Connecter Garmin (via Terra)</CardTitle>
            <CardDescription>
              HRV, sommeil, FC repos, Body Battery, Training Readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">À connecter.</CardContent>
        </Card>
      </div>
    </div>
  )
}
