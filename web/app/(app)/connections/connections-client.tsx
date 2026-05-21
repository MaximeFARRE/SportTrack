"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { disconnectStrava, syncStrava, syncStravaHistory } from "./actions"

interface StravaCardProps {
  connected: boolean
  providerUserId?: string | null
  lastSyncAt?: string | null
  activitiesCount: number
}

export function StravaCard({
  connected,
  providerUserId,
  lastSyncAt,
  activitiesCount,
}: StravaCardProps) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const lastSyncLabel = lastSyncAt
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(lastSyncAt))
    : "Jamais"

  async function handleSync() {
    setSyncing(true)
    const result = await syncStrava()
    setSyncing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.synced ?? 0} activité(s) importée(s)`)
      router.refresh()
    }
  }

  async function handleImportHistory() {
    setImporting(true)
    const result = await syncStravaHistory(90)
    setImporting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Import terminé — ${result.synced ?? 0} activité(s)`)
      router.refresh()
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    const result = await disconnectStrava()
    setDisconnecting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Strava déconnecté")
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          {/* Strava orange logo placeholder */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm">
            S
          </div>
          <div>
            <CardTitle className="text-lg">Strava</CardTitle>
            <CardDescription>Course, vélo, natation et plus</CardDescription>
          </div>
        </div>
        <Badge variant={connected ? "default" : "secondary"}>
          {connected ? "Connecté" : "Non connecté"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Compte Strava</p>
                <p className="font-medium">#{providerUserId}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dernière synchro</p>
                <p className="font-medium">{lastSyncLabel}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Activités importées</p>
                <p className="font-medium">{activitiesCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={handleSync} disabled={syncing || importing || disconnecting}>
                {syncing ? "Synchronisation…" : "Synchroniser"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleImportHistory}
                disabled={syncing || importing || disconnecting}
              >
                {importing ? "Import en cours…" : "Importer 90 jours"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDisconnect}
                disabled={syncing || importing || disconnecting}
              >
                {disconnecting ? "Déconnexion…" : "Déconnecter"}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connectez votre compte Strava pour importer automatiquement vos activités.
            </p>
            <Button asChild size="sm">
              <a href="/connections/strava/connect">Connecter Strava</a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
