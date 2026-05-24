import { createServiceClient } from "@/lib/supabase/service"

export type RiskLevel = "none" | "low" | "moderate" | "high" | "critical"

export type RiskAssessment = {
  user_id: string
  assessment_date: string
  score: number
  level: RiskLevel
  reasons: string[]
}

type MetricRow = {
  training_load: number | null
  hrv_rmssd: number | null
  resting_hr: number | null
  sleep_score: number | null
  body_battery_morning: number | null
}

function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function scoreToLevel(score: number): RiskLevel {
  if (score === 0) return "none"
  if (score <= 2) return "low"
  if (score <= 4) return "moderate"
  if (score <= 7) return "high"
  return "critical"
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function computeRisk(
  userId: string,
  targetDate?: Date,
): Promise<RiskAssessment> {
  const day = targetDate ?? new Date()
  const since = new Date(day.getTime() - 28 * 86_400_000)
  const supabase = createServiceClient()

  const { data: rows, error } = await supabase
    .from("daily_metrics")
    .select("training_load, hrv_rmssd, resting_hr, sleep_score, body_battery_morning")
    .eq("user_id", userId)
    .gte("metric_date", dayString(since))
    .lte("metric_date", dayString(day))
    .order("metric_date")

  if (error) throw error

  if (!rows || rows.length === 0) {
    return {
      user_id: userId,
      assessment_date: dayString(day),
      score: 0,
      level: "none",
      reasons: [],
    }
  }

  const metrics = rows as MetricRow[]
  const loads = metrics.map((row) => row.training_load)
  const baselineHrv = avg(metrics.map((row) => row.hrv_rmssd))
  const baselineHr = avg(metrics.map((row) => row.resting_hr))
  const latest = metrics.at(-1)!

  const chronic = avg(loads) ?? 0
  const acute = avg(loads.slice(-7)) ?? 0
  const acwr = chronic > 0 ? acute / chronic : 0
  const tsb = chronic - acute

  let rawScore = 0
  const reasons: string[] = []

  if (acwr > 1.5) {
    rawScore += 3
    reasons.push(`ACWR à ${acwr.toFixed(2)} — charge aiguë trop élevée (seuil critique : 1.5)`)
  }

  if (tsb < -20) {
    rawScore += 2
    reasons.push(`Balance charge à ${tsb.toFixed(1)} — fatigue accumulée importante`)
  }

  if (latest.hrv_rmssd != null && baselineHrv != null && baselineHrv > 0) {
    if (latest.hrv_rmssd < baselineHrv - 10) {
      rawScore += 3
      reasons.push(
        `HRV (${Math.round(latest.hrv_rmssd)} ms) bien en dessous de la baseline 28j (${Math.round(baselineHrv)} ms) — SNA perturbé`,
      )
    }
  }

  if (latest.resting_hr != null && baselineHr != null) {
    if (latest.resting_hr > baselineHr + 5) {
      rawScore += 2
      reasons.push(
        `FC repos (${Math.round(latest.resting_hr)} bpm) au-dessus de la baseline 28j (${Math.round(baselineHr)} bpm)`,
      )
    }
  }

  if (latest.sleep_score != null && latest.sleep_score < 50) {
    rawScore += 2
    reasons.push(
      `Score sommeil faible (${Math.round(latest.sleep_score)}/100) — récupération nocturne insuffisante`,
    )
  }

  if (latest.body_battery_morning != null && latest.body_battery_morning < 40) {
    rawScore += 1
    reasons.push(`Body Battery à ${Math.round(latest.body_battery_morning)} — réserves énergétiques basses`)
  }

  const score = Math.max(0, Math.min(10, Math.round((rawScore * 10) / 13)))
  return {
    user_id: userId,
    assessment_date: dayString(day),
    score,
    level: scoreToLevel(score),
    reasons,
  }
}

export async function persistAssessment(assessment: RiskAssessment): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from("risk_assessments").upsert(
    {
      user_id: assessment.user_id,
      assessment_date: assessment.assessment_date,
      score: assessment.score,
      level: assessment.level,
      reasons: assessment.reasons,
    },
    { onConflict: "user_id,assessment_date" },
  )

  if (error) throw error
}

export async function getActiveUserIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("activities")
    .select("user_id")
    .gte("start_date", since)

  if (error) throw error

  const ids = new Set<string>()
  for (const row of data ?? []) {
    ids.add(row.user_id)
  }
  return Array.from(ids)
}
