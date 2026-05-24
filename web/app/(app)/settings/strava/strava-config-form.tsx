"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { CheckCircle, Loader2, Webhook } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { registerStravaWebhook, saveStravaConfig, type StravaConfigData } from "./actions"

interface Props {
  initialConfig: StravaConfigData
}

export function StravaConfigForm({ initialConfig }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [isPendingWebhook, startWebhook] = useTransition()
  const [webhookOk, setWebhookOk] = useState(false)
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

  function handleRegisterWebhook() {
    startWebhook(async () => {
      const result = await registerStravaWebhook()
      if (result.error) {
        toast.error(`Webhook : ${result.error}`)
      } else {
        setWebhookOk(true)
        toast.success(
          result.subscription_id
            ? `Webhook enregistré (ID ${result.subscription_id})`
            : "Webhook enregistré avec succès",
        )
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Credentials form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identifiants de l'application Strava</CardTitle>
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

      {/* Webhook registration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Webhook Strava</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Active le webhook global de l'application SportTrack auprès de Strava. À faire{" "}
            <strong>une seule fois</strong>, indépendamment des connexions utilisateur.
          </p>
          <p className="text-xs text-muted-foreground">
            Callback URL enregistrée :{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
              {process.env.NEXT_PUBLIC_BASE_URL ?? "…"}/api/strava/webhook
            </code>
          </p>
          <Button
            variant="outline"
            onClick={handleRegisterWebhook}
            disabled={isPendingWebhook || webhookOk}
          >
            {isPendingWebhook ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : webhookOk ? (
              <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
            ) : (
              <Webhook className="mr-2 h-4 w-4" />
            )}
            {webhookOk ? "Webhook actif" : "Activer le webhook global"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
