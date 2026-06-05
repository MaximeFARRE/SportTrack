import { Loader2 } from "lucide-react"

export default function GroupLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du groupe...
      </div>
    </div>
  )
}
