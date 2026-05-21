"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BODY_FEELING_TAGS,
  CONTEXT_TAGS,
  SESSION_QUALITY_TAGS,
} from "@/lib/constants/feedback-tags"
import { updateActivityFeedback } from "@/app/(app)/activities/actions"
import type { FeedbackData } from "@/app/(app)/activities/actions"

export type FeedbackActivity = {
  id: string
  name: string | null
  rpe: number | null
  feel_score: number | null
  motivation_score: number | null
  perceived_recovery: number | null
  post_session_notes: string | null
  body_feeling_tags: unknown
  context_tags: unknown
  session_quality_tags: unknown
}

export function parseTags(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string")
  return []
}

function StarRating({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(value === i ? 0 : i)}
            className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                i <= value
                  ? "fill-yellow-400 stroke-yellow-400"
                  : "stroke-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function TagGroup({
  title,
  tags,
  selected,
  onToggle,
}: {
  title: string
  tags: Record<string, string>
  selected: string[]
  onToggle: (key: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(tags).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              selected.includes(key)
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FeedbackModal({
  activity,
  open,
  onOpenChange,
}: {
  activity: FeedbackActivity
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const draftKey = `feedback-draft-${activity.id}`
  const [isPending, startTransition] = useTransition()

  const [rpe, setRpe] = useState(activity.rpe ?? 5)
  const [feelScore, setFeelScore] = useState(activity.feel_score ?? 0)
  const [motivationScore, setMotivationScore] = useState(activity.motivation_score ?? 0)
  const [perceivedRecovery, setPerceivedRecovery] = useState(activity.perceived_recovery ?? 0)
  const [notes, setNotes] = useState(activity.post_session_notes ?? "")
  const [bodyTags, setBodyTags] = useState<string[]>(parseTags(activity.body_feeling_tags))
  const [contextTags, setContextTags] = useState<string[]>(parseTags(activity.context_tags))
  const [qualityTags, setQualityTags] = useState<string[]>(parseTags(activity.session_quality_tags))

  // Load draft on open, re-sync from activity when re-opened after a save
  useEffect(() => {
    if (!open) return
    setRpe(activity.rpe ?? 5)
    setFeelScore(activity.feel_score ?? 0)
    setMotivationScore(activity.motivation_score ?? 0)
    setPerceivedRecovery(activity.perceived_recovery ?? 0)
    setNotes(activity.post_session_notes ?? "")
    setBodyTags(parseTags(activity.body_feeling_tags))
    setContextTags(parseTags(activity.context_tags))
    setQualityTags(parseTags(activity.session_quality_tags))
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw) as Partial<FeedbackData>
      if (d.rpe != null) setRpe(d.rpe)
      if (d.feel_score != null) setFeelScore(d.feel_score)
      if (d.motivation_score != null) setMotivationScore(d.motivation_score)
      if (d.perceived_recovery != null) setPerceivedRecovery(d.perceived_recovery)
      if (d.post_session_notes != null) setNotes(d.post_session_notes)
      if (d.body_feeling_tags) setBodyTags(d.body_feeling_tags)
      if (d.context_tags) setContextTags(d.context_tags)
      if (d.session_quality_tags) setQualityTags(d.session_quality_tags)
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Auto-save draft every 5s while open
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          rpe,
          feel_score: feelScore,
          motivation_score: motivationScore,
          perceived_recovery: perceivedRecovery,
          post_session_notes: notes,
          body_feeling_tags: bodyTags,
          context_tags: contextTags,
          session_quality_tags: qualityTags,
        }),
      )
    }, 5000)
    return () => clearInterval(timer)
  }, [open, draftKey, rpe, feelScore, motivationScore, perceivedRecovery, notes, bodyTags, contextTags, qualityTags])

  function toggleTag(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    key: string,
  ) {
    setter((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    )
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await updateActivityFeedback(activity.id, {
        rpe,
        feel_score: feelScore || null,
        motivation_score: motivationScore || null,
        perceived_recovery: perceivedRecovery || null,
        post_session_notes: notes,
        body_feeling_tags: bodyTags,
        context_tags: contextTags,
        session_quality_tags: qualityTags,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        localStorage.removeItem(draftKey)
        onOpenChange(false)
        toast.success("Ressenti enregistré")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ressenti — {activity.name ?? "Activité"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Effort perçu (RPE)</p>
              <span className="tabular-nums text-sm font-semibold">{rpe} / 10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Très facile</span>
              <span>Maximum</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StarRating label="Sensations" value={feelScore} onChange={setFeelScore} />
            <StarRating label="Motivation" value={motivationScore} onChange={setMotivationScore} />
            <StarRating label="Récup. avant" value={perceivedRecovery} onChange={setPerceivedRecovery} />
          </div>

          <TagGroup
            title="Corps"
            tags={BODY_FEELING_TAGS}
            selected={bodyTags}
            onToggle={(key) => toggleTag(setBodyTags, key)}
          />
          <TagGroup
            title="Contexte"
            tags={CONTEXT_TAGS}
            selected={contextTags}
            onToggle={(key) => toggleTag(setContextTags, key)}
          />
          <TagGroup
            title="Qualité de séance"
            tags={SESSION_QUALITY_TAGS}
            selected={qualityTags}
            onToggle={(key) => toggleTag(setQualityTags, key)}
          />

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Notes libres</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jambes lourdes, douleur au genou droit..."
              rows={3}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
