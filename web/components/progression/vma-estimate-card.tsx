import { Info } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { VmaEstimate } from "@/lib/compute/vma-estimate"

type VmaEstimateCardProps = {
  estimate: VmaEstimate
}

function confidenceLabel(confidence: VmaEstimate["confidence"]): string {
  if (confidence === "good") return "confiance bonne"
  if (confidence === "medium") return "confiance moyenne"
  return "confiance faible"
}

export function VmaEstimateCard({ estimate }: VmaEstimateCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">VMA estimée</CardTitle>
          <div className="group relative inline-flex items-center">
            <Info className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
            <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground opacity-0 shadow-md transition-all duration-150 group-hover:opacity-100">
              <div className="absolute top-full right-1 h-2 w-2 -translate-y-1 rotate-45 border-b border-r bg-popover" />
              {estimate.tooltip}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-semibold tabular-nums">
            {estimate.valueKmh == null ? "—" : estimate.valueKmh.toFixed(1)}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">km/h</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{confidenceLabel(estimate.confidence)}</p>
      </CardContent>
    </Card>
  )
}
