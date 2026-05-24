import { getInjurySuggestions } from "@/lib/server/injuries/suggest"
import { createServiceClient } from "@/lib/supabase/service"

type JsonRecord = Record<string, unknown>

function stripNulls(record: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value != null),
  )
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

function weeksAgoDateTime(weeks: number): string {
  return new Date(Date.now() - weeks * 7 * 86_400_000).toISOString()
}

function ageFromBirthDate(value: string | null): number | null {
  if (!value) return null
  const born = new Date(value)
  if (Number.isNaN(born.getTime())) return null
  return Math.floor((Date.now() - born.getTime()) / (365.25 * 86_400_000))
}

async function fetchAthlete(userId: string): Promise<JsonRecord> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("athlete_profiles")
    .select("primary_sport, hr_max, vma_kmh, ftp_watts, css_pace_per_100m, birth_date, weight_kg, weekly_target_hours")
    .eq("user_id", userId)
    .maybeSingle()

  return stripNulls({
    sport_principal: data?.primary_sport,
    hr_max: data?.hr_max,
    vma_kmh: data?.vma_kmh,
    ftp_watts: data?.ftp_watts,
    css_pace_per_100m: data?.css_pace_per_100m,
    objectif_heures_semaine: data?.weekly_target_hours,
    age: ageFromBirthDate(data?.birth_date ?? null),
    poids_kg: data?.weight_kg,
  })
}

async function fetchForme(userId: string): Promise<JsonRecord> {
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from("daily_metrics")
    .select("metric_date, training_load")
    .eq("user_id", userId)
    .gte("metric_date", daysAgo(28))
    .order("metric_date")

  const loads = (rows ?? [])
    .map((row) => row.training_load)
    .filter((value): value is number => value != null)
  const chronic = avg(loads) ?? 0
  const acute = avg(loads.slice(-7)) ?? 0
  const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0
  const tsb = Math.round((chronic - acute) * 10) / 10

  const previousWeek = (rows ?? [])
    .slice(-14, -7)
    .map((row) => row.training_load)
    .filter((value): value is number => value != null)
  const currentWeek = (rows ?? [])
    .slice(-7)
    .map((row) => row.training_load)
    .filter((value): value is number => value != null)
  const previousAvg = avg(previousWeek)
  const currentAvg = avg(currentWeek)
  const trend =
    previousAvg && currentAvg != null
      ? `${currentAvg >= previousAvg ? "+" : ""}${Math.round(((currentAvg - previousAvg) / previousAvg) * 100)}%`
      : null

  const { data: risk } = await supabase
    .from("risk_assessments")
    .select("score, level")
    .eq("user_id", userId)
    .eq("assessment_date", todayDate())
    .maybeSingle()

  return stripNulls({
    ctl: loads.length > 0 ? chronic : null,
    atl: loads.length > 0 ? acute : null,
    tsb: loads.length > 0 ? tsb : null,
    acwr: loads.length > 0 ? acwr : null,
    statut: loads.length === 0 ? null : acwr >= 1.5 ? "charge_critique" : acwr >= 1.3 ? "charge_elevee" : acwr <= 0.8 ? "decharge" : "equilibre",
    tendance_7j: trend,
    risque_score: risk?.score,
    risque_niveau: risk?.level,
  })
}

async function fetchRecovery(userId: string): Promise<JsonRecord> {
  const supabase = createServiceClient()
  const [{ data: rows7 }, { data: rows28 }] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("hrv_rmssd, resting_hr, sleep_score, body_battery_morning, training_readiness")
      .eq("user_id", userId)
      .gte("metric_date", daysAgo(7)),
    supabase
      .from("daily_metrics")
      .select("hrv_rmssd")
      .eq("user_id", userId)
      .gte("metric_date", daysAgo(28)),
  ])

  const hrvAverage = avg((rows7 ?? []).map((row) => row.hrv_rmssd).filter((value): value is number => value != null))
  const hrvBaseline = avg((rows28 ?? []).map((row) => row.hrv_rmssd).filter((value): value is number => value != null))
  const hrvTrend =
    hrvAverage != null && hrvBaseline != null
      ? hrvAverage - hrvBaseline < -8
        ? "basse"
        : hrvAverage - hrvBaseline > 8
          ? "haute"
          : "normale"
      : null

  return stripNulls({
    hrv_moyen: hrvAverage,
    hrv_baseline_4sem: hrvBaseline,
    hrv_tendance: hrvTrend,
    fc_repos_moy: avg((rows7 ?? []).map((row) => row.resting_hr).filter((value): value is number => value != null)),
    sleep_score_moy: avg((rows7 ?? []).map((row) => row.sleep_score).filter((value): value is number => value != null)),
    body_battery_matin_moy: avg((rows7 ?? []).map((row) => row.body_battery_morning).filter((value): value is number => value != null)),
    training_readiness_moy: avg((rows7 ?? []).map((row) => row.training_readiness).filter((value): value is number => value != null)),
  })
}

async function fetchCurrentWeek(userId: string): Promise<JsonRecord> {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  const supabase = createServiceClient()
  const { data: activities } = await supabase
    .from("activities")
    .select("duration_sec, distance_m, elevation_gain_m, time_in_zones_json")
    .eq("user_id", userId)
    .gte("start_date", monday.toISOString())

  const rows = activities ?? []
  const durationSec = rows.reduce((sum, row) => sum + (row.duration_sec ?? 0), 0)
  const distanceKm = rows.reduce((sum, row) => sum + (row.distance_m ?? 0), 0) / 1000
  const elevation = rows.reduce((sum, row) => sum + (row.elevation_gain_m ?? 0), 0)

  const zoneTotals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let zoneTotalSec = 0
  for (const row of rows) {
    if (!Array.isArray(row.time_in_zones_json)) continue
    for (const zone of row.time_in_zones_json) {
      if (!zone || typeof zone !== "object" || Array.isArray(zone)) continue
      const entry = zone as { zone?: unknown; sec?: unknown }
      if (typeof entry.zone !== "number" || typeof entry.sec !== "number") continue
      if (!(entry.zone in zoneTotals)) continue
      zoneTotals[entry.zone] += entry.sec
      zoneTotalSec += entry.sec
    }
  }

  const zones =
    zoneTotalSec > 0
      ? Object.fromEntries(
          Object.entries(zoneTotals).map(([zone, seconds]) => [
            `Z${zone}`,
            `${Math.round((seconds / zoneTotalSec) * 100)}%`,
          ]),
        )
      : null

  return stripNulls({
    sessions: rows.length,
    volume_km: distanceKm > 0 ? Math.round(distanceKm * 10) / 10 : null,
    denivele_m: elevation > 0 ? Math.round(elevation) : null,
    charge_estimee: durationSec > 0 ? Math.round((durationSec / 3600) * 100) : null,
    zones,
  })
}

async function fetchRessenti(userId: string, weeks: number): Promise<JsonRecord[]> {
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from("activities")
    .select("start_date, rpe, feel_score, body_feeling_tags, context_tags, post_session_notes")
    .eq("user_id", userId)
    .gte("start_date", weeksAgoDateTime(weeks))
    .order("start_date", { ascending: false })
    .limit(20)

  return (rows ?? [])
    .filter((row) => row.rpe != null)
    .map((row) => {
      const tags = [
        ...(Array.isArray(row.body_feeling_tags) ? row.body_feeling_tags : []),
        ...(Array.isArray(row.context_tags) ? row.context_tags : []),
      ].filter((tag): tag is string => typeof tag === "string")

      return stripNulls({
        date: row.start_date.slice(0, 10),
        rpe: row.rpe,
        feel_score: row.feel_score,
        tags: tags.length > 0 ? tags : null,
        notes: row.post_session_notes,
      })
    })
}

async function fetchAlertes(userId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data: risk } = await supabase
    .from("risk_assessments")
    .select("level, reasons")
    .eq("user_id", userId)
    .eq("assessment_date", todayDate())
    .maybeSingle()

  const alerts: string[] = []
  if (risk && ["high", "critical"].includes(risk.level)) {
    alerts.push(...(risk.reasons ?? []).slice(0, 3))
  }

  const suggestions = await getInjurySuggestions(userId).catch(() => [])
  alerts.push(...suggestions.map((suggestion) => suggestion.message))

  return alerts
}

async function fetchInjuries(userId: string): Promise<JsonRecord[]> {
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from("injuries")
    .select("body_zone, injury_type, severity, start_date, description")
    .eq("user_id", userId)
    .or(`end_date.is.null,end_date.gte.${todayDate()}`)
    .order("start_date", { ascending: false })

  return (rows ?? []).map((row) =>
    stripNulls({
      zone: row.body_zone.replace(/_/g, " "),
      type: row.injury_type,
      severite: row.severity,
      depuis: row.start_date,
      description: row.description,
    }),
  )
}

async function fetchPlan(userId: string): Promise<JsonRecord[]> {
  const today = new Date()
  const nextMonday = new Date(today)
  nextMonday.setDate(today.getDate() + (7 - ((today.getDay() + 6) % 7)))
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextMonday.getDate() + 6)

  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from("planned_sessions")
    .select("planned_date, sport_type, session_type, planned_duration_min, planned_distance_km, description")
    .eq("user_id", userId)
    .gte("planned_date", nextMonday.toISOString().slice(0, 10))
    .lte("planned_date", nextSunday.toISOString().slice(0, 10))
    .order("planned_date")

  const daysFr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
  return (rows ?? []).map((row) =>
    stripNulls({
      jour: daysFr[(new Date(row.planned_date).getDay() + 6) % 7],
      sport: row.sport_type,
      type: row.session_type,
      duree_min: row.planned_duration_min,
      distance_km: row.planned_distance_km,
      description: row.description,
    }),
  )
}

export async function buildAiSummary(userId: string, weeks: number = 8): Promise<JsonRecord> {
  const [athlete, forme, recovery, currentWeek, ressenti, alertes, injuries, plan] =
    await Promise.all([
      fetchAthlete(userId),
      fetchForme(userId),
      fetchRecovery(userId),
      fetchCurrentWeek(userId),
      fetchRessenti(userId, weeks),
      fetchAlertes(userId),
      fetchInjuries(userId),
      fetchPlan(userId),
    ])

  return stripNulls({
    athlete,
    forme_actuelle: Object.keys(forme).length > 0 ? forme : null,
    recuperation_7j: Object.keys(recovery).length > 0 ? recovery : null,
    semaine_en_cours: Object.keys(currentWeek).length > 0 ? currentWeek : null,
    ressenti_recent: ressenti.length > 0 ? ressenti : null,
    alertes_actives: alertes.length > 0 ? alertes : null,
    blessures_actives: injuries,
    plan_semaine_prochaine: plan.length > 0 ? plan : null,
    generated_at: new Date().toISOString(),
  })
}

export function aiSummaryToMarkdown(data: JsonRecord): string {
  const lines: string[] = ["# Bilan d'entraînement SportTrack", ""]
  const athlete = data.athlete as JsonRecord | undefined
  if (athlete) {
    lines.push("## Profil athlète", "")
    if (athlete.sport_principal) lines.push(`- Sport principal : **${athlete.sport_principal}**`)
    if (athlete.age) lines.push(`- Âge : ${athlete.age} ans`)
    if (athlete.poids_kg) lines.push(`- Poids : ${athlete.poids_kg} kg`)
    if (athlete.hr_max) lines.push(`- FC max : ${athlete.hr_max} bpm`)
    if (athlete.vma_kmh) lines.push(`- VMA : ${athlete.vma_kmh} km/h`)
    if (athlete.ftp_watts) lines.push(`- FTP : ${athlete.ftp_watts} W`)
    lines.push("")
  }

  lines.push("## Données structurées", "", "```json", JSON.stringify(data, null, 2), "```")
  return lines.join("\n")
}
