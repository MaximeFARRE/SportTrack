"use client"

import { useState } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { FeedbackModal } from "./feedback-modal"
import { parseTags } from "./feedback-modal"

export type ActivityCardData = {
  id: string
  name: string | null
  sport_type: string
  start_date: string
  duration_sec: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  average_heartrate: number | null
  rpe: number | null
  feel_score: number | null
  motivation_score: number | null
  perceived_recovery: number | null
  post_session_notes: string | null
  body_feeling_tags: unknown
  context_tags: unknown
  session_quality_tags: unknown
}

const SPORT_LABELS: Record<string, string> = {
  Run: "Course",
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

function hasFeedback(a: ActivityCardData): boolean {
  return (
    a.rpe != null ||
    (a.feel_score != null && a.feel_score > 0) ||
    (a.motivation_score != null && a.motivation_score > 0) ||
    (a.perceived_recovery != null && a.perceived_recovery > 0) ||
    !!a.post_session_notes ||
    parseTags(a.body_feeling_tags).length > 0 ||
    parseTags(a.context_tags).length > 0 ||
    parseTags(a.session_quality_tags).length > 0
  )
}

function formatDuration(sec: number | null): string {
  if (!sec) return ""
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  return `${m}m`
}

function formatDistance(m: number | null): string {
  if (!m) return ""
  return `${(m / 1000).toFixed(1)} km`
}

function formatElevation(m: number | null): string {
  if (!m || m < 1) return ""
  return `D+ ${Math.round(m)} m`
}

export function ActivityCard({ activity }: { activity: ActivityCardData }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const filled = hasFeedback(activity)

  const distance = formatDistance(activity.distance_m)
  const duration = formatDuration(activity.duration_sec)
  const elevation = formatElevation(activity.elevation_gain_m)

  return (
    <div className="relative">
      <Link href={`/activities/${activity.id}`} className="block">
        <Card className="cursor-pointer transition-colors hover:bg-muted/50">
          <CardContent className="flex items-start justify-between gap-4 p-4 pr-12">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {activity.name ?? "Activité sans nom"}
                </span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {SPORT_LABELS[activity.sport_type] ?? activity.sport_type}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {distance && <span>{distance}</span>}
                {duration && <span>{duration}</span>}
                {elevation && <span>{elevation}</span>}
                {activity.average_heartrate != null && (
                  <span>{Math.round(activity.average_heartrate)} bpm</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              {new Date(activity.start_date).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          </CardContent>
        </Card>
      </Link>

      <button
        onClick={() => setFeedbackOpen(true)}
        title={filled ? "Modifier le ressenti" : "Ajouter le ressenti"}
        className="absolute right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-sm transition-colors hover:bg-muted"
      >
        {filled ? "📝" : "⚪"}
      </button>

      <FeedbackModal
        activity={activity}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />
    </div>
  )
}
