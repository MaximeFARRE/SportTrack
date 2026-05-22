import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { CalendarClient, type DayData } from "./calendar-client"

export const metadata: Metadata = { title: "Calendrier · SportTrack" }

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number)
    if (m >= 1 && m <= 12) return { year: y, month: m }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: rawMonth } = await searchParams
  const { year, month } = parseMonth(rawMonth)

  const monthStr = `${year}-${String(month).padStart(2, "0")}`
  const firstDay = `${monthStr}-01`
  // Last day: first day of next month minus 1 day — use string comparison works for ISO dates
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`
  const lastDay = `${nextMonth}-01`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const today = new Date().toISOString().slice(0, 10)

  const [activitiesResult, metricsResult, plannedResult] = await Promise.all([
    supabase
      .from("activities")
      .select("id, name, sport_type, start_date, duration_sec, distance_m")
      .eq("user_id", user.id)
      .gte("start_date", firstDay)
      .lt("start_date", lastDay)
      .order("start_date"),
    supabase
      .from("daily_metrics")
      .select(
        "metric_date, training_load, hrv_rmssd, sleep_score, sleep_duration_min, training_readiness",
      )
      .eq("user_id", user.id)
      .gte("metric_date", firstDay)
      .lt("metric_date", lastDay),
    supabase
      .from("planned_sessions")
      .select("planned_date, status")
      .eq("user_id", user.id)
      .gte("planned_date", firstDay)
      .lt("planned_date", lastDay),
  ])

  const activities = activitiesResult.data ?? []
  const metrics = metricsResult.data ?? []
  // Days with a planned session that was never completed (past only)
  const missedDays = (plannedResult.data ?? [])
    .filter((p) => p.status === "planned" && p.planned_date < today)
    .map((p) => p.planned_date)

  // Build dayData map
  const dayData: Record<string, DayData> = {}

  for (const activity of activities) {
    const key = activity.start_date.slice(0, 10)
    if (!dayData[key]) dayData[key] = { activities: [], metrics: null }
    dayData[key].activities.push({
      id: activity.id,
      name: activity.name,
      sport_type: activity.sport_type,
      duration_sec: activity.duration_sec,
      distance_m: activity.distance_m,
    })
  }

  for (const metric of metrics) {
    const key = metric.metric_date
    if (!dayData[key]) dayData[key] = { activities: [], metrics: null }
    dayData[key].metrics = {
      training_load: metric.training_load,
      hrv_rmssd: metric.hrv_rmssd,
      sleep_score: metric.sleep_score,
      sleep_duration_min: metric.sleep_duration_min,
      training_readiness: metric.training_readiness,
    }
  }

  const allSports = [...new Set(activities.map((a) => a.sport_type))].sort()

  return (
    <CalendarClient
      year={year}
      month={month}
      dayData={dayData}
      allSports={allSports}
      missedDays={missedDays}
    />
  )
}
