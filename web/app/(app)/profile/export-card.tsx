"use client"

import { useState, useTransition } from "react"
import { Copy, Download, FileText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchExportJson, fetchExportMarkdown } from "./export-actions"

const PERIOD_OPTIONS = [
  { value: 4,  label: "4 semaines" },
  { value: 8,  label: "8 semaines" },
  { value: 12, label: "12 semaines" },
]

export function ExportCard() {
  const [weeks, setWeeks] = useState(8)
  const [isPending, startTransition] = useTransition()

  function handleCopyJson() {
    startTransition(async () => {
      try {
        const text = await fetchExportJson(weeks)
        await navigator.clipboard.writeText(text)
        toast.success("JSON copié dans le presse-papier")
      } catch {
        toast.error("Erreur lors de la copie")
      }
    })
  }

  function handleCopyMarkdown() {
    startTransition(async () => {
      try {
        const text = await fetchExportMarkdown(weeks)
        await navigator.clipboard.writeText(text)
        toast.success("Markdown copié dans le presse-papier")
      } catch {
        toast.error("Erreur lors de la copie")
      }
    })
  }

  function handleDownloadMarkdown() {
    startTransition(async () => {
      try {
        const text = await fetchExportMarkdown(weeks)
        const blob = new Blob([text], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `sporttrack-bilan-${new Date().toISOString().slice(0, 10)}.md`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Fichier téléchargé")
      } catch {
        toast.error("Erreur lors du téléchargement")
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Export pour Coach IA externe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Génère un résumé structuré de ton entraînement — prêt à coller dans ChatGPT, Claude ou
          tout autre LLM pour obtenir une analyse personnalisée.
        </p>

        {/* Period selector */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Période analysée</p>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWeeks(opt.value)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  weeks === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleCopyJson}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copier JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleCopyMarkdown}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copier Markdown
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={isPending}
            onClick={handleDownloadMarkdown}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? "Chargement…" : "Télécharger .md"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Le fichier inclut : profil, forme actuelle (CTL/ATL/TSB/ACWR), récupération, zones
          d&apos;intensité, ressenti récent, alertes, blessures et plan de la semaine.
        </p>
      </CardContent>
    </Card>
  )
}
