import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { FeedbackSection } from "@/components/activity/feedback-section"
import { ZoneBars } from "@/components/activity/zone-bars"
import type { ZoneEntry } from "@/components/activity/zone-bars"

export const metadata: Metadata = { title: "Détail activité · SportTrack" }

const SPORT_LABELS: Record<string, string> = {
  Run: "Course à pied",
  Ride: "Vélo",
  Swim: "Natation",
  Hike: "Randonnée",
  Walk: "Marche",
  VirtualRide: "Vélo virtuel",
  WeightTraining: "Musculation",
  AlpineSki: "Ski alpin",
  NordicSki: "Ski nordique",
  Workout: "Entraînement",
  Yoga: "Yoga",
}

function sportLabel(type: string): string {
  return SPORT_LABELS[type] ?? type
}

function formatDuration(sec: number | null): string {
  if (!sec) return "-"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

function formatDistance(m: number | null): string {
  if (!m) return "-"
  return `${(m / 1000).toFixed(2)} km`
}

function formatSpeed(mps: number | null): string {
  if (!mps) return "-"
  return `${(mps * 3.6).toFixed(1)} km/h`
}

function formatPace(mps: number | null): string {
  if (!mps || mps <= 0) return "-"
  const secPerKm = 1000 / mps
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, "0")} /km`
}

function formatElevation(m: number | null): string {
  if (m == null) return "-"
  return `${Math.round(m)} m`
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value || value === "-") return null
  return (
    <div className="flex justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle()

  if (!activity) notFound()

  const isRun = activity.sport_type === "Run" || activity.sport_type === "Hike" || activity.sport_type === "Walk"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/activities">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">
              {activity.name ?? "Activité sans nom"}
            </h1>
            <Badge variant="secondary">{sportLabel(activity.sport_type)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(activity.start_date).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {new Date(activity.start_date).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Performance</CardTitle>
        </CardHeader>
        <CardContent className="divide-y px-4 pb-2">
          <DetailRow label="Distance" value={formatDistance(activity.distance_m)} />
          <DetailRow label="Durée" value={formatDuration(activity.duration_sec)} />
          <DetailRow label="Temps en mouvement" value={formatDuration(activity.moving_time_sec)} />
          {isRun ? (
            <DetailRow label="Allure moyenne" value={formatPace(activity.average_speed)} />
          ) : (
            <DetailRow label="Vitesse moyenne" value={formatSpeed(activity.average_speed)} />
          )}
          <DetailRow label="Vitesse max" value={formatSpeed(activity.max_speed)} />
          <DetailRow label="Dénivelé +" value={formatElevation(activity.elevation_gain_m)} />
          <DetailRow label="Calories" value={activity.calories != null ? `${activity.calories} kcal` : null} />
        </CardContent>
      </Card>

      {(activity.average_heartrate != null ||
        activity.max_heartrate != null ||
        activity.average_cadence != null ||
        activity.average_power != null) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Physiologie</CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-4 pb-2">
            <DetailRow
              label="FC moyenne"
              value={activity.average_heartrate != null ? `${Math.round(activity.average_heartrate)} bpm` : null}
            />
            <DetailRow
              label="FC max"
              value={activity.max_heartrate != null ? `${Math.round(activity.max_heartrate)} bpm` : null}
            />
            <DetailRow
              label="Cadence moyenne"
              value={activity.average_cadence != null ? `${Math.round(activity.average_cadence)} rpm` : null}
            />
            <DetailRow
              label="Puissance moyenne"
              value={activity.average_power != null ? `${Math.round(activity.average_power)} W` : null}
            />
          </CardContent>
        </Card>
      )}

      {Array.isArray(activity.time_in_zones_json) && activity.time_in_zones_json.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Zones d&apos;intensité FC</CardTitle>
          </CardHeader>
          <CardContent>
            <ZoneBars
              zones={activity.time_in_zones_json as unknown as ZoneEntry[]}
              showPolarization
            />
          </CardContent>
        </Card>
      )}

      <FeedbackSection activity={activity} />

      {(activity.temperature_c != null || activity.weather_condition) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conditions</CardTitle>
          </CardHeader>
          <CardContent className="divide-y px-4 pb-2">
            <DetailRow
              label="Température"
              value={activity.temperature_c != null ? `${activity.temperature_c} °C` : null}
            />
            <DetailRow label="Météo" value={activity.weather_condition} />
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground">
        <Separator className="mb-3" />
        <div className="flex justify-between">
          <span>Source : {activity.provider}</span>
          <span>ID : {activity.provider_activity_id}</span>
        </div>
      </div>
    </div>
  )
}
