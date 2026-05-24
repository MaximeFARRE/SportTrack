"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { saveTerraConfig, type TerraConfigData } from "./actions"

interface Props {
  callbackUrl: string
  initialConfig: TerraConfigData
}

export function TerraConfigForm({ callbackUrl, initialConfig }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const result = await saveTerraConfig(new FormData(e.currentTarget))
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Configuration Terra enregistrée")
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Terra API</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="terra_dev_id">Dev ID</Label>
            <Input
              id="terra_dev_id"
              name="dev_id"
              defaultValue={initialConfig.dev_id}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terra_api_key">API Key</Label>
            <Input
              id="terra_api_key"
              name="api_key"
              type="password"
              defaultValue={initialConfig.api_key}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terra_webhook_secret">Webhook signing secret</Label>
            <Input
              id="terra_webhook_secret"
              name="webhook_secret"
              type="password"
              defaultValue={initialConfig.webhook_secret}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Secret fourni par Terra pour vérifier la signature des webhooks entrants.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer Terra"}
            </Button>
            <Button variant="outline" render={<Link href="/connections/terra/connect" />}>
              Connecter une montre
            </Button>
          </div>
        </form>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Webhook Terra</p>
          <p className="mt-1">
            Destination à configurer dans Terra :{" "}
            <code className="rounded bg-background px-1 py-0.5 text-foreground">{callbackUrl}</code>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
