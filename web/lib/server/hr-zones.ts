import { computeZonesFromHrMax } from "@/lib/compute/hr-zones"
import { createServiceClient } from "@/lib/supabase/service"

export async function regenerateHrZonesForUser(
  userId: string,
  hrMax: number,
): Promise<void> {
  if (hrMax < 100 || hrMax > 230) {
    throw new Error("hr_max doit être entre 100 et 230")
  }

  const supabase = createServiceClient()
  const rows = computeZonesFromHrMax(hrMax).map((zone) => ({
    user_id: userId,
    ...zone,
  }))

  const { error } = await supabase
    .from("hr_zones")
    .upsert(rows, { onConflict: "user_id,zone_number" })

  if (error) throw error
}
