import type { Metadata } from "next"
import { format, startOfWeek, addDays, parseISO } from "date-fns"

import { createClient } from "@/lib/supabase/server"
import { PlanningClient, type PlannedSession, type ActivitySummary } from "./planning-client"

export const metadata: Metadata = { title: "Planning · SportTrack" }

function parseWeekStart(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = parseISO(raw)
    // Normalize to Monday
    const monday = startOfWeek(date, { weekStartsOn: 1 })
    return format(monday, "yyyy-MM-dd")
  }
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  return format(monday, "yyyy-MM-dd")
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week: rawWeek } = await searchParams
  const weekStart = parseWeekStart(rawWeek)
  const weekEnd = format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [sessionsResult, activitiesResult] = await Promise.all([
    supabase
      .from("planned_sessions")
      .select(
        "id, planned_date, sport_type, session_type, planned_duration_min, description, status, actual_activity_id, completion_score",
      )
      .eq("user_id", user.id)
      .gte("planned_date", weekStart)
      .lt("planned_date", weekEnd)
      .order("planned_date")
      .order("created_at"),
    supabase
      .from("activities")
      .select("id, name, sport_type, start_date, duration_sec")
      .eq("user_id", user.id)
      .gte("start_date", `${weekStart}T00:00:00`)
      .lt("start_date", `${weekEnd}T00:00:00`),
  ])

  const sessions = (sessionsResult.data ?? []) as PlannedSession[]
  const activities = (activitiesResult.data ?? []) as ActivitySummary[]

  return (
    <PlanningClient
      weekStart={weekStart}
      sessions={sessions}
      activities={activities}
    />
  )
}
