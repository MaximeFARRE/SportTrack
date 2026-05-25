"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { savePolarConfig, type PolarConfigData } from "./actions"

interface Props {
  initialConfig: PolarConfigData
}

export function PolarConfigForm({ initialConfig }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const result = await savePolarConfig(new FormData(e.currentTarget))
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Configuration Polar enregistrée")
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identifiants de l'application Polar Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="polar_client_id">Client ID</Label>
              <Input
                id="polar_client_id"
                name="client_id"
                placeholder="Ex: 5c8bde34-8c88-466d-8888-888888888888"
                defaultValue={initialConfig.client_id}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="polar_client_secret">Client Secret</Label>
              <Input
                id="polar_client_secret"
                name="client_secret"
                type="password"
                placeholder="••••••••••••••••"
                defaultValue={initialConfig.client_secret}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Stocké de manière sécurisée côté serveur.
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
