"use client"

import { useState } from "react"
import { PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BODY_FEELING_TAGS,
  CONTEXT_TAGS,
  SESSION_QUALITY_TAGS,
} from "@/lib/constants/feedback-tags"
import { FeedbackModal, parseTags } from "./feedback-modal"
import type { FeedbackActivity } from "./feedback-modal"

function tagLabels(keys: string[], dict: Record<string, string>): string {
  return keys.map((k) => dict[k] ?? k).join(", ")
}

function Stars({ value }: { value: number }) {
  return (
    <span>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </span>
  )
}

export function FeedbackSection({ activity }: { activity: FeedbackActivity }) {
  const [open, setOpen] = useState(false)

  const bodyTags = parseTags(activity.body_feeling_tags)
  const contextTags = parseTags(activity.context_tags)
  const qualityTags = parseTags(activity.session_quality_tags)

  const hasAny =
    activity.rpe != null ||
    (activity.feel_score != null && activity.feel_score > 0) ||
    (activity.motivation_score != null && activity.motivation_score > 0) ||
    (activity.perceived_recovery != null && activity.perceived_recovery > 0) ||
    !!activity.post_session_notes ||
    bodyTags.length > 0 ||
    contextTags.length > 0 ||
    qualityTags.length > 0

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Ressenti</CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            title={hasAny ? "Modifier le ressenti" : "Ajouter le ressenti"}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!hasAny ? (
            <button
              onClick={() => setOpen(true)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Ajouter le ressenti pour cette séance →
            </button>
          ) : (
            <div className="divide-y text-sm">
              {activity.rpe != null && (
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">RPE</span>
                  <span className="font-medium">{activity.rpe} / 10</span>
                </div>
              )}
              {activity.feel_score != null && activity.feel_score > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Sensations</span>
                  <span className="font-medium">
                    <Stars value={activity.feel_score} />
                  </span>
                </div>
              )}
              {activity.motivation_score != null && activity.motivation_score > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Motivation</span>
                  <span className="font-medium">
                    <Stars value={activity.motivation_score} />
                  </span>
                </div>
              )}
              {activity.perceived_recovery != null && activity.perceived_recovery > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Récup. avant</span>
                  <span className="font-medium">
                    <Stars value={activity.perceived_recovery} />
                  </span>
                </div>
              )}
              {bodyTags.length > 0 && (
                <div className="flex justify-between gap-4 py-2">
                  <span className="shrink-0 text-muted-foreground">Corps</span>
                  <span className="text-right font-medium">
                    {tagLabels(bodyTags, BODY_FEELING_TAGS)}
                  </span>
                </div>
              )}
              {contextTags.length > 0 && (
                <div className="flex justify-between gap-4 py-2">
                  <span className="shrink-0 text-muted-foreground">Contexte</span>
                  <span className="text-right font-medium">
                    {tagLabels(contextTags, CONTEXT_TAGS)}
                  </span>
                </div>
              )}
              {qualityTags.length > 0 && (
                <div className="flex justify-between gap-4 py-2">
                  <span className="shrink-0 text-muted-foreground">Qualité</span>
                  <span className="text-right font-medium">
                    {tagLabels(qualityTags, SESSION_QUALITY_TAGS)}
                  </span>
                </div>
              )}
              {activity.post_session_notes && (
                <div className="py-3">
                  <p className="mb-1 text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{activity.post_session_notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <FeedbackModal activity={activity} open={open} onOpenChange={setOpen} />
    </>
  )
}
