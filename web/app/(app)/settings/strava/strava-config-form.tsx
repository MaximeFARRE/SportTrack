"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
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
  const formRef = useRef<HTMLFormElement>(null)

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Identifiants Strava</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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
              Stocké côté serveur — jamais exposé au navigateur.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook_verify_token">Webhook Verify Token</Label>
            <Input
              id="webhook_verify_token"
              name="webhook_verify_token"
              placeholder="mon-token-secret-webhook"
              defaultValue={initialConfig.webhook_verify_token}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Valeur libre que vous avez choisie lors de l&apos;enregistrement du webhook Strava.
            </p>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
