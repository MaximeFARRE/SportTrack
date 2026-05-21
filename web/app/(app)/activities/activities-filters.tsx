"use client"

import { useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SPORT_OPTIONS = [
  { value: "tous", label: "Tous les sports" },
  { value: "Run", label: "Course à pied" },
  { value: "Ride", label: "Vélo" },
  { value: "Swim", label: "Natation" },
  { value: "Hike", label: "Randonnée" },
  { value: "Walk", label: "Marche" },
  { value: "VirtualRide", label: "Vélo virtuel" },
  { value: "WeightTraining", label: "Musculation" },
  { value: "AlpineSki", label: "Ski alpin" },
  { value: "NordicSki", label: "Ski nordique" },
  { value: "Workout", label: "Entraînement" },
  { value: "Yoga", label: "Yoga" },
]

const PERIOD_OPTIONS = [
  { value: "tout", label: "Toute la période" },
  { value: "7j", label: "7 derniers jours" },
  { value: "30j", label: "30 derniers jours" },
  { value: "3m", label: "3 derniers mois" },
  { value: "6m", label: "6 derniers mois" },
  { value: "1a", label: "Cette année" },
]

export function ActivitiesFilters({
  activeSport,
  activePeriod,
}: {
  activeSport?: string
  activePeriod?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "tous" || value === "tout") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    const qs = params.toString()
    router.push(qs ? `/activities?${qs}` : "/activities")
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={activeSport ?? "tous"}
        onValueChange={(v) => updateFilter("sport", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Tous les sports" />
        </SelectTrigger>
        <SelectContent>
          {SPORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activePeriod ?? "tout"}
        onValueChange={(v) => updateFilter("period", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Toute la période" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
