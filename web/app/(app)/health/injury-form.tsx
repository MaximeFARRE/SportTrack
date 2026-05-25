"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createInjury } from "./actions"

const INJURY_TYPES = [
  { key: "muscular", label: "Musculaire" },
  { key: "tendinous", label: "Tendineux" },
  { key: "bone", label: "Osseux" },
  { key: "ligament", label: "Ligamentaire" },
  { key: "other", label: "Autre" },
]

const BODY_ZONES = [
  "Genou droit",
  "Genou gauche",
  "Dos",
  "Cheville",
  "Hanche",
  "Épaule",
  "Mollet",
  "Cuisse",
  "Pied",
  "Coude",
  "Poignet",
  "Autre",
]

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

interface InjuryFormProps {
  onDone: () => void
}

export function InjuryForm({ onDone }: InjuryFormProps) {
  const [isPending, startTransition] = useTransition()
  const [customZone, setCustomZone] = useState("")
  const [selectedZone, setSelectedZone] = useState("")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const zone = selectedZone === "Autre" ? customZone.trim() : selectedZone
    if (!zone) {
      toast.error("Sélectionnez une zone corporelle")
      return
    }
    formData.set("body_zone", zone.toLowerCase().replace(/ /g, "_"))
    startTransition(async () => {
      const result = await createInjury(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Blessure enregistrée")
        onDone()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Zone corporelle */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Zone corporelle</p>
        <div className="flex flex-wrap gap-2">
          {BODY_ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => setSelectedZone(zone)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedZone === zone
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {zone}
            </button>
          ))}
        </div>
        {selectedZone === "Autre" && (
          <input
            type="text"
            placeholder="Préciser la zone…"
            value={customZone}
            onChange={(e) => setCustomZone(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          {/* Type + sévérité */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="injury_type">
                Type
              </label>
              <select
                id="injury_type"
                name="injury_type"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— non précisé</option>
                {INJURY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="severity">
                Sévérité
              </label>
              <select
                id="severity"
                name="severity"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— non précisée</option>
                <option value="1">1 — Légère</option>
                <option value="2">2 — Modérée</option>
                <option value="3">3 — Sévère</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="start_date">
                Début <span className="text-destructive">*</span>
              </label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                required
                defaultValue={todayDate()}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="end_date">
                Fin <span className="text-muted-foreground font-normal">(si guéri)</span>
              </label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="description">
              Description <span className="text-muted-foreground font-normal">(optionnel)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              placeholder="Contexte, circonstances…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Traitement */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="treatment">
              Traitement <span className="text-muted-foreground font-normal">(optionnel)</span>
            </label>
            <textarea
              id="treatment"
              name="treatment"
              rows={2}
              placeholder="Kiné, repos, médicaments…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={isPending || !selectedZone} className="flex-1">
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
