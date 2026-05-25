"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { connectGarmin, syncGarminHistory } from "./actions"

interface Props {
  connected: boolean
  lastSyncAt?: string | null
  providerUserId?: string | null
}

export function GarminConfigForm({ connected, lastSyncAt, providerUserId }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [isPendingSync, startSync] = useTransition()

  const lastSyncLabel = lastSyncAt
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(lastSyncAt))
    : "Jamais"

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const result = await connectGarmin(new FormData(e.currentTarget))
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Garmin connecté · ${result.synced ?? 0} journée(s) importée(s)`)
      router.refresh()
    }
  }

  function handleSync() {
    startSync(async () => {
      const result = await syncGarminHistory(30)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`${result.synced ?? 0} journée(s) Garmin importée(s)`)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Garmin Connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {connected ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-950">
            <p className="font-medium">Compte Garmin connecté</p>
            <p className="mt-1 text-green-900">
              {providerUserId ?? "Compte Garmin"} · Dernière synchronisation : {lastSyncLabel}
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="garmin_email">Email Garmin Connect</Label>
            <Input id="garmin_email" name="email" type="email" autoComplete="username" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="garmin_password">Mot de passe Garmin Connect</Label>
            <Input
              id="garmin_password"
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="garmin_mfa_code">Code MFA</Label>
            <Input id="garmin_mfa_code" name="mfa_code" inputMode="numeric" autoComplete="one-time-code" />
            <p className="text-xs text-muted-foreground">
              À renseigner seulement si Garmin demande une validation en deux étapes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || isPendingSync}>
              {saving ? "Connexion…" : connected ? "Reconnecter Garmin" : "Connecter Garmin"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSync}
              disabled={!connected || saving || isPendingSync}
            >
              {isPendingSync ? "Synchronisation…" : "Importer 30 jours"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
