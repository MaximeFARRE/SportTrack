"use client"

import { useActionState, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { upsertProfileAction, type ProfileState } from "./actions"

// ── Types ─────────────────────────────────────────────────────────────────────

type AthleteProfile = {
  first_name?: string | null
  last_name?: string | null
  birth_date?: string | null
  gender?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  hr_max?: number | null
  hr_rest?: number | null
  vma_kmh?: number | null
  ftp_watts?: number | null
  css_pace_per_100m?: string | null
  primary_sport?: string | null
  practiced_sports?: string[] | null
  training_years?: number | null
  weekly_target_hours?: number | null
}

type HrZone = {
  zone_number: number
  zone_name: string
  hr_min: number
  hr_max: number | null
  pct_min: number
  pct_max: number | null
  is_custom: boolean
  color_hex: string
}

const SPORTS = [
  { value: "running", label: "Course à pied" },
  { value: "cycling", label: "Vélo" },
  { value: "swimming", label: "Natation" },
  { value: "triathlon", label: "Triathlon" },
  { value: "trail", label: "Trail" },
  { value: "other", label: "Autre" },
] as const

const GENDERS = [
  { value: "male", label: "Homme" },
  { value: "female", label: "Femme" },
  { value: "other", label: "Autre" },
  { value: "prefer_not_to_say", label: "Préfère ne pas préciser" },
]

// ── Zone row ──────────────────────────────────────────────────────────────────

function ZoneRow({ zone }: { zone: HrZone }) {
  const rangeLabel =
    zone.hr_max != null
      ? `${zone.hr_min} – ${zone.hr_max} bpm`
      : `> ${zone.hr_min} bpm`

  return (
    <div className="flex items-center gap-3 rounded-md py-1.5">
      <span
        className="h-4 w-1.5 flex-none rounded-full"
        style={{ backgroundColor: zone.color_hex }}
      />
      <span className="w-32 text-sm font-medium">{zone.zone_name}</span>
      <span className="flex-1 text-sm text-muted-foreground">{rangeLabel}</span>
      {zone.is_custom && (
        <Badge variant="secondary" className="text-xs">
          custom
        </Badge>
      )}
    </div>
  )
}

// ── Sport checkbox ────────────────────────────────────────────────────────────

function SportCheckbox({
  value,
  label,
  checked,
  onChange,
}: {
  value: string
  label: string
  checked: boolean
  onChange: (v: string, c: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="practiced_sports"
        value={value}
        checked={checked}
        onChange={(e) => onChange(value, e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileForm({
  profile,
  zones,
}: {
  profile: AthleteProfile | null
  zones: HrZone[]
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    upsertProfileAction,
    undefined,
  )

  const [practicedSports, setPracticedSports] = useState<string[]>(
    profile?.practiced_sports ?? [],
  )

  useEffect(() => {
    if (state?.error) toast.error(state.error)
    if (state?.success) toast.success("Profil enregistré")
  }, [state])

  function toggleSport(value: string, checked: boolean) {
    setPracticedSports((prev) =>
      checked ? [...prev, value] : prev.filter((s) => s !== value),
    )
  }

  return (
    <form action={action} className="space-y-6">
      {/* Hidden checkboxes state is managed via controlled inputs above */}

      {/* ── Informations personnelles ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">Prénom</Label>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={profile?.first_name ?? ""}
              placeholder="Maxime"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="last_name">Nom</Label>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={profile?.last_name ?? ""}
              placeholder="Farré"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="birth_date">Date de naissance</Label>
            <Input
              id="birth_date"
              name="birth_date"
              type="date"
              defaultValue={profile?.birth_date ?? ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gender">Genre</Label>
            <Select name="gender" defaultValue={profile?.gender ?? ""}>
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="height_cm">Taille (cm)</Label>
            <Input
              id="height_cm"
              name="height_cm"
              type="number"
              min={100}
              max={250}
              step={0.1}
              defaultValue={profile?.height_cm ?? ""}
              placeholder="175"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="weight_kg">Poids (kg)</Label>
            <Input
              id="weight_kg"
              name="weight_kg"
              type="number"
              min={30}
              max={200}
              step={0.1}
              defaultValue={profile?.weight_kg ?? ""}
              placeholder="70"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Données physiologiques ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Données physiologiques</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr_max">FC max (bpm)</Label>
            <Input
              id="hr_max"
              name="hr_max"
              type="number"
              min={100}
              max={230}
              defaultValue={profile?.hr_max ?? ""}
              placeholder="187"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hr_rest">FC repos (bpm)</Label>
            <Input
              id="hr_rest"
              name="hr_rest"
              type="number"
              min={30}
              max={100}
              defaultValue={profile?.hr_rest ?? ""}
              placeholder="52"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vma_kmh">VMA (km/h)</Label>
            <Input
              id="vma_kmh"
              name="vma_kmh"
              type="number"
              min={5}
              max={25}
              step={0.1}
              defaultValue={profile?.vma_kmh ?? ""}
              placeholder="16.5"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ftp_watts">FTP (watts)</Label>
            <Input
              id="ftp_watts"
              name="ftp_watts"
              type="number"
              min={50}
              max={600}
              defaultValue={profile?.ftp_watts ?? ""}
              placeholder="285"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="css_pace_per_100m">CSS (allure /100m)</Label>
            <Input
              id="css_pace_per_100m"
              name="css_pace_per_100m"
              defaultValue={profile?.css_pace_per_100m ?? ""}
              placeholder="1:45"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Pratique sportive ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pratique sportive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="primary_sport">Sport principal</Label>
              <Select name="primary_sport" defaultValue={profile?.primary_sport ?? ""}>
                <SelectTrigger id="primary_sport" className="w-full">
                  <SelectValue placeholder="Choisir…" />
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

            <div className="space-y-1.5">
              <Label htmlFor="training_years">Années d&apos;expérience</Label>
              <Input
                id="training_years"
                name="training_years"
                type="number"
                min={0}
                max={80}
                defaultValue={profile?.training_years ?? ""}
                placeholder="5"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weekly_target_hours">Volume cible / semaine (h)</Label>
              <Input
                id="weekly_target_hours"
                name="weekly_target_hours"
                type="number"
                min={0}
                max={50}
                step={0.5}
                defaultValue={profile?.weekly_target_hours ?? ""}
                placeholder="6"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Autres sports pratiqués</Label>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {SPORTS.map((s) => (
                <SportCheckbox
                  key={s.value}
                  value={s.value}
                  label={s.label}
                  checked={practicedSports.includes(s.value)}
                  onChange={toggleSport}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Zones FC ─────────────────────────────────────────────────────── */}
      {zones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Zones FC
              {profile?.hr_max && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  calculées depuis FC max : {profile.hr_max} bpm
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {zones.map((zone) => (
              <ZoneRow key={zone.zone_number} zone={zone} />
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Les zones sont recalculées automatiquement à chaque mise à jour de la FC max.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
