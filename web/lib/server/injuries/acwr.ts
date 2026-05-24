import { createServiceClient } from "@/lib/supabase/service"

type LoadRow = {
  metric_date: string
  training_load: number | null
}

export type AcwrContext = {
  reference_date: string
  acwr: number
  acute_load_7d: number
  chronic_load_28d: number
  trend_14d: Array<{ date: string; load: number | null }>
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getAcwrContext(
  userId: string,
  referenceDate: Date = new Date(),
): Promise<AcwrContext> {
  const since = new Date(referenceDate.getTime() - 28 * 86_400_000)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("metric_date, training_load")
    .eq("user_id", userId)
    .gte("metric_date", dayString(since))
    .lte("metric_date", dayString(referenceDate))
    .order("metric_date")

  if (error) throw error

  const rows = (data ?? []) as LoadRow[]
  const loads = rows
    .map((row) => row.training_load)
    .filter((value): value is number => value != null)

  const chronic = avg(loads)
  const acute = avg(loads.slice(-7))
  const acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0

  return {
    reference_date: dayString(referenceDate),
    acwr,
    acute_load_7d: round1(acute),
    chronic_load_28d: round1(chronic),
    trend_14d: rows.slice(-14).map((row) => ({
      date: row.metric_date,
      load: row.training_load,
    })),
  }
}
