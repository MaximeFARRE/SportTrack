import type { Metadata } from "next"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  ShieldCheck,
  Moon,
  Activity,
  Heart,
  Zap,
  Gauge,
  Wind,
  Droplet,
  TrendingUp,
  Info,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { getAcwrContext } from "@/lib/server/injuries/acwr"

import { InjuryActions } from "./injury-actions"
import { InjuryFormToggle } from "./injury-form-toggle"
import { HealthChart } from "./health-chart"

export const metadata: Metadata = { title: "Santé · SportTrack" }

type Injury = {
  id: string
  body_zone: string
  injury_type: string | null
  severity: number | null
  start_date: string
  end_date: string | null
  description: string | null
  treatment: string | null
}

const SEVERITY_CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: "Légère", className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900/50" },
  2: { label: "Modérée", className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50" },
  3: { label: "Sévère", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50" },
}

const INJURY_TYPE_LABELS: Record<string, string> = {
  muscular: "Musculaire",
  tendinous: "Tendineux",
  bone: "Osseux",
  ligament: "Ligamentaire",
  other: "Autre",
}

const HRV_STATUS_MAP: Record<string, { label: string; className: string }> = {
  balanced: { label: "Équilibrée", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50" },
  low: { label: "Basse", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50" },
  unbalanced: { label: "Déséquilibrée", className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800/50" },
  poor: { label: "Mauvaise", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/50" },
  no_status: { label: "Pas de statut", className: "bg-muted text-muted-foreground border-border" },
}

function formatZone(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSleepDuration(minutes: number | null): string {
  if (minutes == null) return "–"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`
  return `${m}m`
}

function getLatestValue<T>(metrics: any[] | null, key: string): T | null {
  if (!metrics) return null
  for (let i = metrics.length - 1; i >= 0; i--) {
    if (metrics[i][key] != null) {
      return metrics[i][key] as T
    }
  }
  return null
}

function HelpTooltip({ content }: { content: string }) {
  return (
    <div className="group relative inline-flex items-center ml-1 cursor-help">
      <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground transition-colors" />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md opacity-0 scale-95 origin-bottom transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:scale-100 dark:bg-zinc-900 dark:border-zinc-800">
        <div className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-r border-b bg-popover dark:bg-zinc-900 dark:border-zinc-800" />
        <p className="font-normal leading-relaxed">{content}</p>
      </div>
    </div>
  )
}

function InjuryCard({ injury }: { injury: Injury }) {
  const isActive = !injury.end_date
  const sev = injury.severity ? SEVERITY_CONFIG[injury.severity] : null
  const startFmt = format(parseISO(injury.start_date), "d MMM yyyy", { locale: fr })
  const endFmt = injury.end_date
    ? format(parseISO(injury.end_date), "d MMM yyyy", { locale: fr })
    : null

  return (
    <Card className={isActive ? "border-orange-300 dark:border-orange-950/60" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isActive ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500 animate-pulse" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <div>
              <p className="font-medium text-foreground">{formatZone(injury.body_zone)}</p>
              <p className="text-xs text-muted-foreground">
                {startFmt}
                {endFmt ? ` → ${endFmt}` : " → en cours"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sev && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sev.className}`}>
                {sev.label}
              </span>
            )}
            {injury.injury_type && (
              <Badge variant="secondary" className="text-[10px]">
                {INJURY_TYPE_LABELS[injury.injury_type] ?? injury.injury_type}
              </Badge>
            )}
            <InjuryActions injury={injury} />
          </div>
        </div>

        {injury.description && (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{injury.description}</p>
        )}
        {injury.treatment && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Traitement :</span> {injury.treatment}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function HealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

  // Promise.all to fetch metrics, injuries and ACWR in parallel
  const [dailyMetricsResult, injuriesResult, acwr] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("metric_date, resting_hr, hrv_rmssd, hrv_status, sleep_score, sleep_duration_min, sleep_deep_min, sleep_rem_min, sleep_light_min, sleep_awake_min, body_battery_morning, body_battery_evening, training_readiness, stress_score_avg, spo2_avg, respiration_avg, vo2max_estimated")
      .eq("user_id", user.id)
      .gte("metric_date", thirtyDaysAgoStr)
      .order("metric_date", { ascending: true }),
    supabase
      .from("injuries")
      .select("id, body_zone, injury_type, severity, start_date, end_date, description, treatment")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false }),
    getAcwrContext(user.id),
  ])

  const dailyMetrics = dailyMetricsResult.data ?? []
  const injuries = injuriesResult.data ?? []

  // Extract active vs historical injuries
  const active = injuries.filter((i) => !i.end_date || i.end_date >= today)
  const historical = injuries.filter((i) => i.end_date && i.end_date < today)

  // Get the latest values for key recovery metrics
  const sleepScore = getLatestValue<number>(dailyMetrics, "sleep_score")
  const sleepDuration = getLatestValue<number>(dailyMetrics, "sleep_duration_min")
  const hrv = getLatestValue<number>(dailyMetrics, "hrv_rmssd")
  const hrvStatus = getLatestValue<string>(dailyMetrics, "hrv_status")
  const restingHr = getLatestValue<number>(dailyMetrics, "resting_hr")
  const bodyBattery = getLatestValue<number>(dailyMetrics, "body_battery_morning")
  const stressScore = getLatestValue<number>(dailyMetrics, "stress_score_avg")
  const spo2 = getLatestValue<number>(dailyMetrics, "spo2_avg")
  const respiration = getLatestValue<number>(dailyMetrics, "respiration_avg")
  const vo2max = getLatestValue<number>(dailyMetrics, "vo2max_estimated")

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-rose-500 animate-pulse" style={{ animationDuration: '3s' }} />
          <h1 className="text-xl font-semibold">Santé & Récupération</h1>
        </div>
        <InjuryFormToggle />
      </div>

      {/* Main recovery metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Sommeil */}
        <Card className="relative overflow-visible border border-border bg-card/50 backdrop-blur-sm transition-all hover:z-20 hover:bg-card">
          <CardContent className="pt-4 flex flex-col justify-between h-full min-h-[110px]">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Moon className="h-4 w-4 text-indigo-400" />
                Sommeil
              </span>
              <HelpTooltip content="Indicateur global (0-100) combinant la durée, la structure des phases (sommeil profond pour la récupération musculaire, paradoxal pour le système nerveux) et les interruptions." />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">
                {sleepScore !== null ? `${sleepScore}` : "–"}
              </span>
              {sleepScore !== null && <span className="text-xs text-muted-foreground">/100</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Durée : {formatSleepDuration(sleepDuration)}
            </p>
          </CardContent>
        </Card>

        {/* HRV */}
        <Card className="relative overflow-visible border border-border bg-card/50 backdrop-blur-sm transition-all hover:z-20 hover:bg-card">
          <CardContent className="pt-4 flex flex-col justify-between h-full min-h-[110px]">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Activity className="h-4 w-4 text-purple-400" />
                VFC / HRV
              </span>
              <HelpTooltip content="Variabilité de la fréquence cardiaque (RMSSD en ms). Reflète l'activité de votre système nerveux autonome. Une valeur élevée ou 'équilibrée' est synonyme de bonne forme." />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">
                {hrv !== null ? `${Math.round(hrv)}` : "–"}
              </span>
              {hrv !== null && <span className="text-xs text-muted-foreground">ms</span>}
            </div>
            <div className="mt-1">
              {hrvStatus ? (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${HRV_STATUS_MAP[hrvStatus]?.className || ""}`}>
                  {HRV_STATUS_MAP[hrvStatus]?.label || hrvStatus}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">–</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* FC de repos */}
        <Card className="relative overflow-visible border border-border bg-card/50 backdrop-blur-sm transition-all hover:z-20 hover:bg-card">
          <CardContent className="pt-4 flex flex-col justify-between h-full min-h-[110px]">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Heart className="h-4 w-4 text-rose-500" />
                FC repos
              </span>
              <HelpTooltip content="Pulsations cardiaques par minute (bpm) mesurées au repos complet (généralement pendant le sommeil). Plus le niveau est bas, plus le muscle cardiaque est fort et économe." />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">
                {restingHr !== null ? `${Math.round(restingHr)}` : "–"}
              </span>
              {restingHr !== null && <span className="text-xs text-muted-foreground">bpm</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Reflète la récupération globale
            </p>
          </CardContent>
        </Card>

        {/* Body Battery & Stress */}
        <Card className="relative overflow-visible border border-border bg-card/50 backdrop-blur-sm transition-all hover:z-20 hover:bg-card">
          <CardContent className="pt-4 flex flex-col justify-between h-full min-h-[110px]">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Zap className="h-4 w-4 text-yellow-400" />
                Energie / Stress
              </span>
              <HelpTooltip content="Le niveau de batterie corporelle estime vos ressources (0-100) en combinant VFC, sommeil et activité. Le score de stress évalue les tensions physiologiques au cours du jour." />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">
                {bodyBattery !== null ? `${Math.round(bodyBattery)}` : "–"}
              </span>
              {bodyBattery !== null && <span className="text-xs text-muted-foreground">/100 (Battery)</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Stress moyen : {stressScore !== null ? `${Math.round(stressScore)}/100` : "–"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary metrics summary */}
      <Card className="relative overflow-visible border border-border bg-card/30 backdrop-blur-sm">
        <CardHeader className="py-2.5 px-4 border-b border-border/40">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Autres indicateurs physiologiques
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 grid grid-cols-3 gap-4 text-center sm:text-left">
          <div className="flex flex-col gap-1 border-r border-border/50 pr-4 last:border-r-0">
            <div className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
              <Droplet className="h-3.5 w-3.5 text-cyan-400" />
              SpO2 moyen
              <HelpTooltip content="Saturation pulsée en oxygène dans le sang (%). Les valeurs entre 95% et 100% sont normales. Une baisse peut indiquer de la fatigue ou l'altitude." />
            </div>
            <p className="text-lg font-bold mt-0.5">
              {spo2 !== null ? `${spo2.toFixed(1)}%` : "–"}
            </p>
          </div>
          <div className="flex flex-col gap-1 border-r border-border/50 pr-4 last:border-r-0">
            <div className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
              <Wind className="h-3.5 w-3.5 text-blue-300" />
              Respiration
              <HelpTooltip content="Fréquence respiratoire moyenne nocturne ou quotidienne (respirations par minute). Une hausse notable traduit un stress ou une défense immunitaire." />
            </div>
            <p className="text-lg font-bold mt-0.5">
              {respiration !== null ? `${respiration.toFixed(1)} cpm` : "–"}
            </p>
          </div>
          <div className="flex flex-col gap-1 last:border-r-0">
            <div className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1">
              <Gauge className="h-3.5 w-3.5 text-emerald-400" />
              VO2 Max
              <HelpTooltip content="Débit maximal d'oxygène consommé lors d'un effort intense. Un score élevé reflète de bonnes capacités d'endurance aérobie." />
            </div>
            <p className="text-lg font-bold mt-0.5">
              {vo2max !== null ? `${vo2max.toFixed(0)}` : "–"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Middle Grid - Trend Chart and Training Load Context */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Trend Graph (2/3 width on desktop) */}
        <div className="lg:col-span-2">
          <HealthChart data={dailyMetrics} />
        </div>

        {/* Load Context Card (1/3 width on desktop) */}
        <div>
          <Card className="relative h-full overflow-visible">
            <CardHeader className="pb-2 border-b border-border/40">
              <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Contexte charge
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  ACWR
                  <HelpTooltip content="Acute Chronic Workload Ratio. Ratio entre votre fatigue récente (charge 7j) et votre historique de travail (charge 28j). Idéalement situé entre 0.8 et 1.3. Au-delà de 1.5, le risque de blessure augmente fortement." />
                </span>
                <span className="font-semibold text-base">{acwr.acwr.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Charge aiguë (7j)</span>
                <span className="font-semibold">{acwr.acute_load_7d}</span>
              </div>
              <div className="flex items-center justify-between pb-1">
                <span className="text-muted-foreground">Charge chronique (28j)</span>
                <span className="font-semibold">{acwr.chronic_load_28d}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Injuries Registry Section */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Registre des blessures
        </h2>
        {active.length === 0 && historical.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Aucune blessure enregistrée"
            description="Tout va bien ! Déclarez une blessure dès qu'elle survient pour suivre son évolution et adapter vos charges."
          />
        ) : (
          <div className="space-y-6">
            {/* Active Injuries */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                En cours ({active.length})
              </h3>
              {active.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-card/25 rounded-lg border border-border p-4 text-center">Aucune blessure active signalée.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {active.map((i) => <InjuryCard key={i.id} injury={i} />)}
                </div>
              )}
            </section>

            {/* Historical Injuries */}
            {historical.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Historique ({historical.length})
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {historical.map((i) => <InjuryCard key={i.id} injury={i} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
