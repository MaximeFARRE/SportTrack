import { describe, expect, it } from "vitest"
import { calculateGroupReadiness, estimateRaceTime, getBenchmarks } from "../lib/compute/performance"

describe("Performance & Readiness calculations", () => {
  const baseDate = new Date("2026-05-25T12:00:00Z")

  it("should return correct benchmarks for target distances", () => {
    expect(getBenchmarks(5)).toEqual({ targetWeeklyVolume: 15, targetLongRun: 6 })
    expect(getBenchmarks(10)).toEqual({ targetWeeklyVolume: 25, targetLongRun: 10 })
    expect(getBenchmarks(21.1)).toEqual({ targetWeeklyVolume: 40, targetLongRun: 16 })
    expect(getBenchmarks(42.2)).toEqual({ targetWeeklyVolume: 55, targetLongRun: 28 })
  })

  it("should calculate 0 readiness and null estimation when no activities exist", () => {
    expect(calculateGroupReadiness([], 42.2, baseDate)).toBe(0)
    expect(estimateRaceTime([], 42.2, baseDate)).toBeNull()
  })

  it("should calculate correct readiness for a partially trained 10k runner", () => {
    // 10k target. Benchmark: volume=25km, long run=10km
    // Activities: 1 run of 10km (10000m) per week for 4 weeks (total 40km, weekly avg 10km)
    // max run = 10km
    const activities = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-17T08:00:00Z",
        sport_type: "run",
        duration_sec: 3600,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-10T08:00:00Z",
        sport_type: "running",
        duration_sec: 3600,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-03T08:00:00Z",
        sport_type: "TrailRun",
        duration_sec: 3600,
        distance_m: 10000,
      },
    ]

    // weeklyAvg = 10km, targetWeeklyVolume = 25km. Ratio = 10/25 = 0.4
    // maxRun = 10km, targetLongRun = 10km. Ratio = 10/10 = 1.0
    // Expected readiness = (0.4 * 0.5 + 1.0 * 0.5) * 100 = 70
    expect(calculateGroupReadiness(activities, 10, baseDate)).toBe(70)
  })

  it("should estimate race time using Riegel and readiness penalty", () => {
    // 10k runner who runs 10km in 3000s (50 mins)
    const activities = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3000, // 5:00/km
        distance_m: 10000,
      },
      {
        start_date: "2026-05-17T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3000,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-10T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3000,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-03T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3000,
        distance_m: 10000,
      },
    ]

    // Readiness is 70% (see previous test).
    // Penalty is 1 + ((100 - 70)/100) * 0.4 = 1.12
    // Riegel: T2 = T1 * (D2 / D1)^1.06
    // Since D2 = 10km, D1 = 10km, T2 = T1 = 3000s
    // Final estimate: 3000 * 1.12 = 3360s (56 mins)
    const estimatedTime = estimateRaceTime(activities, 10, baseDate)
    expect(estimatedTime).toBe(3360)
  })

  it("should ignore non-running, future, and stale activities", () => {
    const activities = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 10000,
      },
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Ride",
        duration_sec: 3600,
        distance_m: 50000,
      },
      {
        start_date: "2026-04-01T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 50000,
      },
      {
        start_date: "2026-05-26T08:00:00Z",
        sport_type: "Run",
        duration_sec: 3600,
        distance_m: 50000,
      },
    ]

    expect(calculateGroupReadiness(activities, 10, baseDate)).toBe(55)
  })

  it("should cap readiness at 100 for runners above benchmarks", () => {
    const activities = Array.from({ length: 4 }, (_, index) => ({
      start_date: `2026-05-${String(24 - index * 7).padStart(2, "0")}T08:00:00Z`,
      sport_type: "Run",
      duration_sec: 7200,
      distance_m: 30000,
    }))

    expect(calculateGroupReadiness(activities, 10, baseDate)).toBe(100)
  })

  it("should clamp unrealistic race estimates to physiological bounds", () => {
    const tooFastActivities = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 60,
        distance_m: 10000,
      },
    ]
    const tooSlowActivities = [
      {
        start_date: "2026-05-24T08:00:00Z",
        sport_type: "Run",
        duration_sec: 100000,
        distance_m: 10000,
      },
    ]

    expect(estimateRaceTime(tooFastActivities, 10, baseDate)).toBe(1800)
    expect(estimateRaceTime(tooSlowActivities, 10, baseDate)).toBe(6000)
  })
})
