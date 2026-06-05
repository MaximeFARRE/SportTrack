"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Database, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { refreshProgressionHistory } from "./actions"

export function HistoryRefreshButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    const result = await refreshProgressionHistory()
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(`Historique Strava importé (${result.synced ?? 0} activité${result.synced === 1 ? "" : "s"})`)
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
      {loading ? "Import en cours..." : "Recalculer l'historique"}
    </Button>
  )
}
