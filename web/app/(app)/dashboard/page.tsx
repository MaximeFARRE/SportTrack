import type { Metadata } from "next"
import Link from "next/link"
import { format, startOfWeek, subDays } from "date-fns"
import { fr } from "date-fns/locale"
import { Activity, Moon, TrendingUp, Zap } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CtlAtlChart } from "@/components/dashboard/ctl-atl-chart"

export const metadata: Metadata = { title: "Tableau de bord · SportTrack" }

function formatDuration(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`
  return `${m}m`
}

function getFormScore(readiness: number | null): number {
  if (readiness == null) return 0
  return Math.round(readiness / 10)
}

function getRiskLabel(score: number): { label: string; advice: string } {
  if (score >= 8) return { label: "Excellente forme", advice: "Séance intensive possible" }
  if (score >= 6) return { label: "Bonne forme", advice: "Séance normale recommandée" }
  if (score >= 4) return { label: "Forme modérée", advice: "Séance légère conseillée" }
  return { label: "Récupération nécessaire", advice: "Repos ou récup active" }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const ninetyDaysAgo = subDays(now, 90)

  const [profileResult, athleteResult, weekActivitiesResult, recentMetricsResult] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("athlete_profiles").select("primary_sport, weekly_target_hours").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("activities")
        .select("id, name, sport_type, start_date, duration_sec, distance_m")
        .eq("user_id", user.id)
        .gte("start_date", weekStart.toISOString())
        .order("start_date", { ascending: false }),
      supabase
        .from("daily_metrics")
        .select("metric_date, training_load, training_readiness, hrv_rmssd, hrv_status, sleep_score, sleep_duration_min")
        .eq("user_id", user.id)
        .gte("metric_date", ninetyDaysAgo.toISOString().slice(0, 10))
        .order("metric_date"),
    ])

  const displayName = profileResult.data?.display_name
  const firstName = displayName?.split(" ")[0] ?? "Sportif"
  const weekActivities = weekActivitiesResult.data ?? []
  const recentMetrics = recentMetricsResult.data ?? []
  const latestMetric = recentMetrics.at(-1)

  const formScore = getFormScore(latestMetric?.training_readiness ?? null)
  const { label: formLabel, advice: formAdvice } = getRiskLabel(formScore)

  const weekDuration = weekActivities.reduce((sum, a) => sum + (a.duration_sec ?? 0), 0)
  const weekLoad = recentMetrics
    .filter((m) => m.metric_date >= weekStart.toISOString().slice(0, 10))
    .reduce((sum, m) => sum + (m.training_load ?? 0), 0)

  const chartData = recentMetrics.map((m) => ({
    metric_date: m.metric_date,
    training_load: m.training_load,
  }))

  const formattedDate = format(now, "EEE d MMMM yyyy", { locale: fr })
  const formattedDateCapitalized =
    formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bonjour {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground">{formattedDateCapitalized}</p>
        </div>
      </div>

      {/* Top cards — forme + semaine */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Forme du jour */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Zap className="h-4 w-4 text-yellow-500" />
              Forme du jour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestMetric ? (
              <>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{formScore}</span>
                  <span className="mb-1 text-muted-foreground">/10</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${formScore * 10}%` }}
                  />
                </div>
                <p className="text-sm font-medium">{formLabel}</p>
                <p className="text-xs text-muted-foreground">💡 {formAdvice}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune donnée de récupération disponible.{" "}
                <Link href="/connections" className="underline">
                  Connectez Garmin
                </Link>{" "}
                pour voir votre forme.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Semaine en cours */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Cette semaine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold">{weekActivities.length}</span>
              <span className="mb-1 text-muted-foreground">séance{weekActivities.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{formatDuration(weekDuration)} au total</span>
              {weekLoad > 0 && <span>{Math.round(weekLoad)} pts de charge</span>}
            </div>
            {weekActivities.length === 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                Aucune activité cette semaine.{" "}
                <Link href="/activities/new" className="underline">
                  Ajouter une séance
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Charge 30j
            </div>
            <div className="mt-1 text-2xl font-bold">
              {recentMetrics.length > 0
                ? Math.round(
                    recentMetrics
                      .slice(-30)
                      .reduce((s, m) => s + (m.training_load ?? 0), 0),
                  )
                : "–"}
            </div>
            <p className="text-xs text-muted-foreground">points</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-pink-500" />
              HRV
            </div>
            <div className="mt-1 text-2xl font-bold">
              {latestMetric?.hrv_rmssd != null
                ? Math.round(latestMetric.hrv_rmssd)
                : "–"}
            </div>
            <p className="text-xs text-muted-foreground">
              {latestMetric?.hrv_status === "balanced"
                ? "Équilibrée"
                : latestMetric?.hrv_status === "low"
                  ? "Basse"
                  : latestMetric?.hrv_status === "poor"
                    ? "Mauvaise"
                    : "–"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Moon className="h-4 w-4 text-indigo-400" />
              Sommeil
            </div>
            <div className="mt-1 text-2xl font-bold">
              {latestMetric?.sleep_score != null ? latestMetric.sleep_score : "–"}
            </div>
            <p className="text-xs text-muted-foreground">
              {latestMetric?.sleep_duration_min != null
                ? `${Math.floor(latestMetric.sleep_duration_min / 60)}h${(latestMetric.sleep_duration_min % 60).toString().padStart(2, "0")}`
                : "–"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 text-green-500" />
              Readiness
            </div>
            <div className="mt-1 text-2xl font-bold">
              {latestMetric?.training_readiness != null
                ? Math.round(latestMetric.training_readiness)
                : "–"}
            </div>
            <p className="text-xs text-muted-foreground">/100</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique charge 90 jours */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            📊 Évolution charge (90 jours)
          </CardTitle>
        </CardHeader>
        <CardContent className="pr-2">
          <CtlAtlChart data={chartData} />
        </CardContent>
      </Card>

      {/* Activités récentes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base font-medium">
              <span>🏃 Activités récentes</span>
              <Link
                href="/activities"
                className="text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                Voir tout →
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {weekActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune activité cette semaine</p>
            ) : (
              weekActivities.slice(0, 4).map((activity) => (
                <Link
                  key={activity.id}
                  href={`/activities/${activity.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="font-medium truncate max-w-[60%]">
                    {activity.name ?? activity.sport_type}
                  </span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    {format(new Date(activity.start_date), "d MMM", { locale: fr })} ·{" "}
                    {formatDuration(activity.duration_sec)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Placeholder distribution zones */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              📈 Distribution zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Connectez Strava ou Garmin pour voir la répartition de vos zones d&apos;effort.
            </p>
            <Link
              href="/connections"
              className="mt-2 inline-block text-sm underline text-primary"
            >
              Configurer les connexions
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
