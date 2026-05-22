"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Activity, ChevronRight, Plug, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { completeOnboarding } from "./actions"

const SPORTS = [
  { value: "running", label: "Course à pied" },
  { value: "cycling", label: "Vélo" },
  { value: "swimming", label: "Natation" },
  { value: "triathlon", label: "Triathlon" },
  { value: "trail", label: "Trail" },
  { value: "other", label: "Autre" },
]

const STEPS = [
  { label: "Profil", icon: Activity },
  { label: "Fréquence cardiaque", icon: Zap },
  { label: "Connexions", icon: Plug },
]

export function OnboardingWizard() {
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [sport, setSport] = useState("")
  const [hrMax, setHrMax] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleFinish() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("first_name", firstName)
      formData.set("last_name", lastName)
      formData.set("primary_sport", sport)
      if (hrMax) formData.set("hr_max", hrMax)
      await completeOnboarding(formData)
    })
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 py-8">
      {/* Header */}
      <div className="text-center">
        <div className="mb-3 flex justify-center">
          <Activity className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold">Bienvenue sur SportTrack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurez votre profil en 3 étapes pour commencer.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              {i + 1}
            </div>
            <span className={`hidden text-xs sm:inline ${i === step ? "font-medium" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Votre profil</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="primary_sport">Sport principal</Label>
              <Select value={sport} onValueChange={(v) => setSport(v ?? "")}>
                <SelectTrigger id="primary_sport">
                  <SelectValue placeholder="Choisissez un sport" />
                </SelectTrigger>
                <SelectContent>
                  {SPORTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Fréquence cardiaque maximale</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Utilisée pour calculer vos zones d&apos;entraînement (Z1 à Z5). Vous pouvez la
                saisir maintenant ou la renseigner plus tard dans votre profil.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr_max">FC max (bpm)</Label>
              <Input
                id="hr_max"
                type="number"
                min={100}
                max={230}
                value={hrMax}
                onChange={(e) => setHrMax(e.target.value)}
                placeholder="ex. 185"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Si vous ne la connaissez pas, laissez vide. Estimation fréquente : 220 − âge.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Connectez vos appareils</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Importez vos activités et données physiologiques automatiquement.
              </p>
            </div>
            <div className="space-y-3">
              <Link
                href="/connections"
                className="flex items-center justify-between rounded-md border p-4 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="font-medium">Strava</p>
                  <p className="text-xs text-muted-foreground">
                    Importe vos activités et segments
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link>
              <Link
                href="/connections"
                className="flex items-center justify-between rounded-md border p-4 transition-colors hover:bg-muted"
              >
                <div>
                  <p className="font-medium">Garmin / Terra</p>
                  <p className="text-xs text-muted-foreground">
                    Importe HRV, sommeil et récupération
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isPending}>
            Précédent
          </Button>
        ) : (
          <span />
        )}

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Suivant
          </Button>
        ) : (
          <Button onClick={handleFinish} disabled={isPending}>
            {isPending ? "Enregistrement…" : "Commencer"}
          </Button>
        )}
      </div>

      {step === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Vous pourrez compléter votre profil à tout moment depuis la page{" "}
          <Link href="/profile" className="underline underline-offset-2">
            Profil
          </Link>
          .
        </p>
      )}
    </div>
  )
}
