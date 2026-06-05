import { describe, expect, it } from "vitest"

import { bestStreamEfforts, estimateVma, paceFromKmh, type VmaActivity, type VmaZone } from "@/lib/compute/vma-estimate"

const zones: VmaZone[] = [
  { zone_number: 1, hr_min: 90, hr_max: 120 },
  { zone_number: 2, hr_min: 120, hr_max: 145 },
  { zone_number: 3, hr_min: 145, hr_max: 165 },
  { zone_number: 4, hr_min: 165, hr_max: 180 },
  { zone_number: 5, hr_min: 180, hr_max: null },
]

function activity(overrides: Partial<VmaActivity>): VmaActivity {
  return {
    sport_type: "Run",
    start_date: "2026-05-20T08:00:00.000Z",
    duration_sec: 1440,
    moving_time_sec: 1440,
    distance_m: 6000,
    elevation_gain_m: 20,
    average_heartrate: 170,
    max_heartrate: 184,
    ...overrides,
  }
}

describe("estimateVma", () => {
  it("estimates VMA from classic road runs", () => {
    const result = estimateVma(
      [
        activity({ duration_sec: 1440, moving_time_sec: 1440, distance_m: 6000 }),
        activity({ start_date: "2026-05-10T08:00:00.000Z", duration_sec: 1200, moving_time_sec: 1200, distance_m: 5000 }),
        activity({ start_date: "2026-04-20T08:00:00.000Z", duration_sec: 720, moving_time_sec: 720, distance_m: 3000 }),
      ],
      zones,
      new Date("2026-06-01T00:00:00.000Z"),
    )

    expect(result.valueKmh).toBeGreaterThan(16)
    expect(result.valueKmh).toBeLessThan(18)
    expect(result.confidence).toBe("medium")
  })

  it("ignores trail and highly hilly runs", () => {
    const result = estimateVma(
      [
        activity({ sport_type: "TrailRun", duration_sec: 1200, moving_time_sec: 1200, distance_m: 6000 }),
        activity({ elevation_gain_m: 300, duration_sec: 1200, moving_time_sec: 1200, distance_m: 6000 }),
      ],
      zones,
      new Date("2026-06-01T00:00:00.000Z"),
    )

    expect(result.valueKmh).toBeNull()
    expect(result.candidateCount).toBe(0)
  })

  it("returns low confidence with a single usable candidate", () => {
    const result = estimateVma([activity({ duration_sec: 360, moving_time_sec: 360, distance_m: 1600 })], zones, new Date("2026-06-01T00:00:00.000Z"))

    expect(result.valueKmh).not.toBeNull()
    expect(result.confidence).toBe("low")
  })

  it("weights short stream efforts into the estimate", () => {
    const efforts = bestStreamEfforts(
      {
        date: "2026-05-20T08:00:00.000Z",
        time: Array.from({ length: 601 }, (_, i) => i),
        distance: Array.from({ length: 601 }, (_, i) => i * 4.5),
        heartrate: Array.from({ length: 601 }, () => 182),
        altitude: Array.from({ length: 601 }, () => 20),
      },
      [300, 360],
    )
    const result = estimateVma([], zones, new Date("2026-06-01T00:00:00.000Z"), efforts)

    expect(efforts).toHaveLength(2)
    expect(result.valueKmh).toBeGreaterThan(15)
    expect(result.confidence).toBe("medium")
  })
})

describe("paceFromKmh", () => {
  it("formats pace from speed", () => {
    expect(paceFromKmh(15)).toBe("4:00/km")
    expect(paceFromKmh(null)).toBe("—")
  })
})
