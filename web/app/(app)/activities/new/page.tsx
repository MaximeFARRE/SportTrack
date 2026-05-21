"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MANUAL_SPORTS } from "@/lib/constants/sports"
import { createActivity } from "./actions"

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentTime() {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
}

export default function NewActivityPage() {
  const [sport, setSport] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!sport) {
      setError("Veuillez sélectionner un sport")
      return
    }
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("sport_type", sport)
    startTransition(async () => {
      const result = await createActivity(formData)
      if (result?.error) {
        toast.error(result.error)
        setError(result.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/activities">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Nouvelle activité</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sport */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Sport</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {MANUAL_SPORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSport(s.key)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors",
                  sport === s.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="text-lg">{s.icon}</span>
                <span className="text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-4">
            {/* Nom */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="name">
                Nom <span className="text-muted-foreground font-normal">(optionnel)</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Ma séance du matin"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Date + heure */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="date">Date</label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={todayDate()}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="time">Heure</label>
                <input
                  id="time"
                  name="time"
                  type="time"
                  defaultValue={currentTime()}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Durée */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Durée</p>
              <div className="flex items-center gap-2">
                <input
                  name="hours"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={0}
                  className="w-20 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">h</span>
                <input
                  name="minutes"
                  type="number"
                  min={0}
                  max={59}
                  defaultValue={0}
                  className="w-20 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>

            {/* Distance */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="distance_km">
                Distance <span className="text-muted-foreground font-normal">(km, optionnel)</span>
              </label>
              <input
                id="distance_km"
                name="distance_km"
                type="number"
                min={0}
                step={0.1}
                placeholder="0"
                className="w-32 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Link href="/activities" className="flex-1">
            <Button variant="outline" type="button" className="w-full">
              Annuler
            </Button>
          </Link>
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "Enregistrement…" : "Créer l'activité"}
          </Button>
        </div>
      </form>
    </div>
  )
}
