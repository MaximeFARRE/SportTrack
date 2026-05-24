import { createServiceClient } from "@/lib/supabase/service"
import type { Json } from "@/lib/types/database"

const PAIN_TAG_ZONES: Record<string, string> = {
  douleur_genou_droit: "genou_droit",
  douleur_genou_gauche: "genou_gauche",
  douleur_dos: "dos",
  douleur_cheville: "cheville",
  douleur_hanche: "hanche",
  douleur_epaule: "epaule",
}

type ActivityRow = {
  id: string
  name: string | null
  start_date: string
  body_feeling_tags: Json
}

export type InjurySuggestion = {
  body_zone: string
  activity_count: number
  first_date: string
  last_date: string
  message: string
}

export async function getInjurySuggestions(userId: string): Promise<InjurySuggestion[]> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("activities")
    .select("id, name, start_date, body_feeling_tags")
    .eq("user_id", userId)
    .gte("start_date", since)
    .order("start_date")

  if (error) throw error

  const zoneHits = new Map<string, ActivityRow[]>()

  for (const activity of (data ?? []) as ActivityRow[]) {
    const tags = Array.isArray(activity.body_feeling_tags) ? activity.body_feeling_tags : []
    for (const tag of tags) {
      if (typeof tag !== "string") continue
      const zone = PAIN_TAG_ZONES[tag]
      if (!zone) continue
      zoneHits.set(zone, [...(zoneHits.get(zone) ?? []), activity])
    }
  }

  const suggestions: InjurySuggestion[] = []
  for (const [zone, activities] of zoneHits.entries()) {
    if (activities.length < 3) continue
    suggestions.push({
      body_zone: zone,
      activity_count: activities.length,
      first_date: activities[0].start_date.slice(0, 10),
      last_date: activities.at(-1)!.start_date.slice(0, 10),
      message: `Voulez-vous déclarer une blessure ? ${activities.length} activités signalent une douleur : ${zone.replace(/_/g, " ")}`,
    })
  }

  return suggestions
}

export async function getActiveUserIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("activities")
    .select("user_id")
    .gte("start_date", since)

  if (error) throw error

  const ids = new Set<string>()
  for (const row of data ?? []) {
    ids.add(row.user_id)
  }
  return Array.from(ids)
}
