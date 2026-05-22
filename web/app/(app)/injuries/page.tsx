import type { Metadata } from "next"
import { format, parseISO } from "date-fns"
import { fr } from "date-fns/locale"
import { AlertTriangle, CheckCircle2, HeartPulse, ShieldCheck } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

import { InjuryActions } from "./injury-actions"
import { InjuryFormToggle } from "./injury-form-toggle"

export const metadata: Metadata = { title: "Blessures · SportTrack" }

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
  1: { label: "Légère", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  2: { label: "Modérée", className: "bg-orange-100 text-orange-800 border-orange-200" },
  3: { label: "Sévère", className: "bg-red-100 text-red-800 border-red-200" },
}

const INJURY_TYPE_LABELS: Record<string, string> = {
  muscular: "Musculaire",
  tendinous: "Tendineux",
  bone: "Osseux",
  ligament: "Ligamentaire",
  other: "Autre",
}

function formatZone(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function InjuryCard({ injury }: { injury: Injury }) {
  const isActive = !injury.end_date
  const sev = injury.severity ? SEVERITY_CONFIG[injury.severity] : null
  const startFmt = format(parseISO(injury.start_date), "d MMM yyyy", { locale: fr })
  const endFmt = injury.end_date
    ? format(parseISO(injury.end_date), "d MMM yyyy", { locale: fr })
    : null

  return (
    <Card className={isActive ? "border-orange-300" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isActive ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <div>
              <p className="font-medium">{formatZone(injury.body_zone)}</p>
              <p className="text-xs text-muted-foreground">
                {startFmt}
                {endFmt ? ` → ${endFmt}` : " → en cours"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sev && (
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${sev.className}`}>
                {sev.label}
              </span>
            )}
            {injury.injury_type && (
              <Badge variant="secondary" className="text-xs">
                {INJURY_TYPE_LABELS[injury.injury_type] ?? injury.injury_type}
              </Badge>
            )}
            <InjuryActions injury={injury} />
          </div>
        </div>

        {injury.description && (
          <p className="mt-2 text-sm text-muted-foreground">{injury.description}</p>
        )}
        {injury.treatment && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium">Traitement :</span> {injury.treatment}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function InjuriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().slice(0, 10)

  const { data: injuries } = await supabase
    .from("injuries")
    .select("id, body_zone, injury_type, severity, start_date, end_date, description, treatment")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false })

  const active = (injuries ?? []).filter((i) => !i.end_date || i.end_date >= today)
  const historical = (injuries ?? []).filter((i) => i.end_date && i.end_date < today)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Blessures</h1>
        </div>
        <InjuryFormToggle />
      </div>

      {active.length === 0 && historical.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Aucune blessure enregistrée"
          description="Tout va bien ! Signalez une blessure dès qu'elle survient pour en suivre l'évolution."
        />
      ) : (
        <>
          {/* Blessures actives */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              En cours ({active.length})
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune blessure active.</p>
            ) : (
              active.map((i) => <InjuryCard key={i.id} injury={i} />)
            )}
          </section>

          {/* Historique */}
          {historical.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Historique ({historical.length})
              </h2>
              {historical.map((i) => <InjuryCard key={i.id} injury={i} />)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
