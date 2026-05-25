"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { saveStravaConfig, type StravaConfigData } from "./actions"

interface Props {
  initialConfig: StravaConfigData
}

export function StravaConfigForm({ initialConfig }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const result = await saveStravaConfig(new FormData(e.currentTarget))
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Configuration Strava enregistrée")
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Credentials form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identifiants de l'application Strava</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                name="client_id"
                placeholder="185192"
                defaultValue={initialConfig.client_id}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                name="client_secret"
                type="password"
                placeholder="••••••••••••••••"
                defaultValue={initialConfig.client_secret}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Stocké côté serveur. Le secret de vérification du webhook est généré
                automatiquement.
              </p>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer la configuration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
