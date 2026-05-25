import { beforeEach, describe, expect, it, vi } from "vitest"

const upsertMock = vi.fn()

let resolvedConnection: { user_id: string } | null = null

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "provider_connections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: resolvedConnection, error: null }),
                }),
              }),
            }),
          }),
          upsert: upsertMock,
        }
      }

      if (table === "daily_metrics") {
        return {
          upsert: upsertMock,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeTerraDaily,
  normalizeTerraSleep,
  processTerraWebhook,
} from "@/lib/server/terra/webhook"

describe("Terra payload normalization", () => {
  it("normalizes daily health metrics and rounds integer fields", () => {
    expect(
      normalizeTerraDaily({
        metadata: { start_time: "2026-05-25T06:00:00Z" },
        heart_rate_data: { summary: { resting_hr_bpm: 48.6 } },
        hrv_data: { summary: { avg_rmssd_ms: 72.5 } },
        stress_data: { avg_stress_level: 31.4 },
        oxygen_data: { avg_saturation_percentage: 97.2 },
        respiration_data: { breaths_data: { avg_breaths_per_min: 13.8 } },
        vo2max_data: { vo2max_ml_per_min_per_kg: 51.3 },
      }),
    ).toEqual({
      metric_date: "2026-05-25",
      resting_hr: 49,
      hrv_rmssd: 72.5,
      stress_score_avg: 31,
      spo2_avg: 97.2,
      respiration_avg: 13.8,
      vo2max_estimated: 51.3,
    })
  })

  it("normalizes sleep duration parts and fractional readiness scores", () => {
    expect(
      normalizeTerraSleep({
        metadata: { start_time: "2026-05-24T22:30:00Z" },
        readiness_data: { readiness_score_percentage: 0.86 },
        sleep_durations_data: {
          awake: { duration_awake_state_seconds: 900 },
          light_sleep: { duration_light_sleep_state_seconds: 14_400 },
          deep_sleep: { duration_deep_sleep_state_seconds: 5_400 },
          rem_sleep: { duration_REM_sleep_state_seconds: 6_300 },
        },
      }),
    ).toEqual({
      metric_date: "2026-05-24",
      sleep_score: 86,
      sleep_duration_min: 450,
      sleep_awake_min: 15,
      sleep_light_min: 240,
      sleep_deep_min: 90,
      sleep_rem_min: 105,
    })
  })
})

describe("processTerraWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolvedConnection = { user_id: "user-1" }
    upsertMock.mockResolvedValue({ error: null })
  })

  it("connects Terra auth events to provider_connections", async () => {
    await expect(
      processTerraWebhook({
        type: "auth",
        reference_id: "user-1",
        user: { user_id: "terra-user-1", provider: "GARMIN" },
      }),
    ).resolves.toEqual({ connected: true })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        provider: "terra",
        provider_user_id: "terra-user-1",
        is_active: true,
      },
      { onConflict: "user_id,provider" },
    )
  })

  it("upserts daily metric payloads for resolved Terra users", async () => {
    await expect(
      processTerraWebhook({
        type: "daily",
        user: { user_id: "terra-user-1" },
        data: [
          {
            metadata: { start_time: "2026-05-25T06:00:00Z" },
            heart_rate_data: { summary: { resting_hr_bpm: 50 } },
          },
        ],
      }),
    ).resolves.toEqual({ upserted: 1 })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        metric_date: "2026-05-25",
        resting_hr: 50,
      },
      { onConflict: "user_id,metric_date" },
    )
  })

  it("skips unsupported payloads and unresolved provider users", async () => {
    await expect(processTerraWebhook({ type: "body", user: { user_id: "terra-user-1" } })).resolves.toEqual({
      skipped: true,
    })

    resolvedConnection = null
    await expect(
      processTerraWebhook({
        type: "sleep",
        user: { user_id: "missing-terra-user" },
        data: [{ metadata: { start_time: "2026-05-25T06:00:00Z" } }],
      }),
    ).resolves.toEqual({ upserted: 0 })
  })
})
