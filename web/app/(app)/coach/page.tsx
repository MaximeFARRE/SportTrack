import type { Metadata } from "next"
import { Sparkles } from "lucide-react"

export const metadata: Metadata = { title: "Coach IA · SportTrack" }

export default function CoachPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold">Coach IA</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette fonctionnalité est en cours de construction et sera bientôt disponible.
      </p>
    </div>
  )
}
