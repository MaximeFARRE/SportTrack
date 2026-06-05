import { describe, expect, it } from "vitest"

import {
  computeEffortProgression,
  formatPace,
  type EffortProgressionActivity,
  type EffortProgressionZone,
} from "@/lib/compute/effort-progression"

const zones: EffortProgressionZone[] = [
  { zone_number: 1, zone_name: "Z1", hr_min: 90, hr_max: 120 },
  { zone_number: 2, zone_name: "Z2", hr_min: 120, hr_max: 150 },
  { zone_number: 3, zone_name: "Z3", hr_min: 150, hr_max: 170 },
  { zone_number: 4, zone_name: "Z4", hr_min: 170, hr_max: 185 },
  { zone_number: 5, zone_name: "Z5", hr_min: 185, hr_max: null },
]

function activity(overrides: Partial<EffortProgressionActivity>): EffortProgressionActivity {
  return {
    sport_type: "Run",
    start_date: "2026-05-01T08:00:00.000Z",
    duration_sec: 3000,
    moving_time_sec: 3000,
    distance_m: 10000,
    average_heartrate: 135,
    ...overrides,
  }
}

describe("computeEffortProgression", () => {
  it("keeps only classic runs with usable heart-rate and pace data", () => {
    const result = computeEffortProgression(
      [
        activity({ sport_type: "Run", average_heartrate: 135 }),
        activity({ sport_type: "TrailRun", average_heartrate: 135 }),
        activity({ sport_type: "Ride", average_heartrate: 135 }),
        activity({ sport_type: "Run", average_heartrate: null }),
        activity({ sport_type: "Run", distance_m: 1000 }),
      ],
      zones,
      new Date("2026-06-01T00:00:00.000Z"),
    )

    expect(result.usableRunCount).toBe(1)
    expect(result.zone2Summary?.currentSampleCount).toBe(1)
  })

  it("uses the dominant heart-rate zone when zone distribution is available", () => {
    const result = computeEffortProgression(
      [
        activity({
          average_heartrate: 155,
          time_in_zones_json: [
            { zone: 2, sec: 2200 },
            { zone: 3, sec: 600 },
          ],
        }),
        activity({
          average_heartrate: 135,
          start_date: "2026-05-08T08:00:00.000Z",
          time_in_zones_json: [
            { zone: 1, sec: 900 },
            { zone: 2, sec: 1000 },
            { zone: 3, sec: 1100 },
          ],
        }),
      ],
      zones,
      new Date("2026-06-01T00:00:00.000Z"),
    )

    expect(result.usableRunCount).toBe(1)
    expect(result.zone2Summary?.currentSampleCount).toBe(1)
  })

  it("compares recent zone 2 pace with the older baseline window", () => {
    const result = computeEffortProgression(
      [
        activity({ start_date: "2026-01-10T08:00:00.000Z", moving_time_sec: 3600, duration_sec: 3600 }),
        activity({ start_date: "2026-01-20T08:00:00.000Z", moving_time_sec: 3500, duration_sec: 3500 }),
        activity({ start_date: "2026-05-10T08:00:00.000Z", moving_time_sec: 3200, duration_sec: 3200 }),
        activity({ start_date: "2026-05-20T08:00:00.000Z", moving_time_sec: 3000, duration_sec: 3000 }),
      ],
      zones,
      new Date("2026-06-01T00:00:00.000Z"),
    )

    expect(result.zone2Summary?.baselinePaceSecPerKm).toBe(355)
    expect(result.zone2Summary?.currentPaceSecPerKm).toBe(310)
    expect(result.zone2Summary?.deltaPct).toBeCloseTo(12.68, 2)
  })

  it("builds monthly zone 2 buckets", () => {
    const result = computeEffortProgression(
      [
        activity({ start_date: "2026-05-04T08:00:00.000Z", moving_time_sec: 3000, duration_sec: 3000 }),
        activity({ start_date: "2026-05-06T08:00:00.000Z", moving_time_sec: 3200, duration_sec: 3200 }),
        activity({ start_date: "2026-06-01T08:00:00.000Z", moving_time_sec: 2900, duration_sec: 2900 }),
      ],
      zones,
      new Date("2026-06-15T00:00:00.000Z"),
    )

    expect(result.monthlyZone2).toHaveLength(2)
    expect(result.monthlyZone2[0].medianPaceSecPerKm).toBe(310)
  })
})

describe("formatPace", () => {
  it("formats seconds per kilometer", () => {
    expect(formatPace(335)).toBe("5:35/km")
    expect(formatPace(null)).toBe("—")
  })
})
