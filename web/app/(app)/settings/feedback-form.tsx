"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Bug, Lightbulb, MessageSquare, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

import { submitAppFeedback } from "./feedback-actions"

export function FeedbackForm() {
  const [feedbackType, setFeedbackType] = useState<"bug" | "feature" | "other">("bug")
  const [message, setMessage] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!message.trim()) {
      toast.error("Veuillez saisir un message.")
      return
    }

    const formData = new FormData()
    formData.set("feedback_type", feedbackType)
    formData.set("message", message)

    startTransition(async () => {
      const result = await submitAppFeedback(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Merci ! Votre retour a bien été transmis.")
        setMessage("")
      }
    })
  }

  const types = [
    {
      key: "bug",
      label: "Bug / Problème",
      icon: Bug,
      color: "text-red-500",
      bgColor: "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30",
    },
    {
      key: "feature",
      label: "Idée / Amélioration",
      icon: Lightbulb,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30",
    },
    {
      key: "other",
      label: "Autre remarque",
      icon: MessageSquare,
      color: "text-blue-500",
      bgColor: "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/30",
    },
  ]

  return (
    <Card className="border border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Donner votre avis / Signaler un bug
        </CardTitle>
        <CardDescription>
          Partagez vos impressions sur SportTrack, suggérez une nouvelle fonctionnalité ou signalez un bug.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type de retour</label>
            <div className="grid grid-cols-3 gap-3">
              {types.map((t) => {
                const isSelected = feedbackType === t.key
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setFeedbackType(t.key as any)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition-all cursor-pointer ${
                      isSelected
                        ? `${t.bgColor} border-primary ring-1 ring-primary/30 font-medium`
                        : "border-border bg-card/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-5 w-5 mb-1.5 ${t.color}`} />
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Message content */}
          <div className="space-y-2">
            <label htmlFor="feedback_message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Votre message
            </label>
            <div className="relative">
              <textarea
                id="feedback_message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder={
                  feedbackType === "bug"
                    ? "Décrivez le problème rencontré et, si possible, les étapes pour le reproduire..."
                    : feedbackType === "feature"
                    ? "Quelle amélioration ou fonctionnalité aimeriez-vous voir sur l'application ?..."
                    : "Dites-nous ce que vous pensez de l'application ou posez-nous vos questions..."
                }
                className="w-full rounded-lg border bg-background px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border-border placeholder:text-muted-foreground/70"
              />
              <span className="absolute bottom-2.5 right-3 text-[10px] text-muted-foreground/60">
                {message.length}/5000
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={isPending || !message.trim()} className="w-full sm:w-auto cursor-pointer">
              <Send className="mr-1.5 h-4 w-4" />
              {isPending ? "Envoi en cours..." : "Envoyer le retour"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
