import { describe, expect, it } from "vitest"

import { classifyHr, computeZonesFromHrMax, estimateHrMaxFromBirthDate } from "@/lib/compute/hr-zones"

describe("computeZonesFromHrMax", () => {
  it("returns 5 zones with correct boundaries for hr_max=200", () => {
    const zones = computeZonesFromHrMax(200)

    expect(zones).toHaveLength(5)
    expect(zones[0]).toMatchObject({ zone_number: 1, hr_min: 0, hr_max: 136 })
    expect(zones[1]).toMatchObject({ zone_number: 2, hr_min: 136, hr_max: 166 })
    expect(zones[4]).toMatchObject({ zone_number: 5, hr_min: 194, hr_max: 200 })
  })

  it("does not generate a zone boundary above the provided max heart rate", () => {
    const zones = computeZonesFromHrMax(200)

    expect(zones.every((zone) => zone.hr_min <= 200)).toBe(true)
    expect(zones.every((zone) => zone.hr_max == null || zone.hr_max <= 200)).toBe(true)
  })

  it("marks generated zones as non-custom", () => {
    const zones = computeZonesFromHrMax(180)

    expect(zones.every((zone) => zone.is_custom === false)).toBe(true)
  })
})

describe("classifyHr", () => {
  it.each([
    [80, 200, 1],
    [140, 200, 2],
    [170, 200, 3],
    [190, 200, 4],
    [195, 200, 5],
    [215, 200, 5],
  ])("classifies bpm=%i with hrMax=%i as zone %i", (bpm, hrMax, expected) => {
    expect(classifyHr(bpm, hrMax)).toBe(expected)
  })

  it.each([
    [136, 200, 2],
    [166, 200, 3],
    [188, 200, 4],
    [194, 200, 5],
    [200, 200, 5],
  ])("classifies exact upper boundary bpm=%i as the next zone", (bpm, hrMax, expected) => {
    expect(classifyHr(bpm, hrMax)).toBe(expected)
  })

  it("returns zone 5 for impossible or above-max percentages", () => {
    expect(classifyHr(0, 0)).toBe(5)
    expect(classifyHr(230, 200)).toBe(5)
  })
})

describe("estimateHrMaxFromBirthDate", () => {
  it("estimates max heart rate from age using 220 minus age", () => {
    expect(estimateHrMaxFromBirthDate("1990-06-10", new Date("2026-05-25T12:00:00Z"))).toBe(185)
    expect(estimateHrMaxFromBirthDate("1990-05-25", new Date("2026-05-25T12:00:00Z"))).toBe(184)
  })

  it("returns null for missing, future, invalid, or out-of-range birth dates", () => {
    expect(estimateHrMaxFromBirthDate(null)).toBeNull()
    expect(estimateHrMaxFromBirthDate("bad-date")).toBeNull()
    expect(estimateHrMaxFromBirthDate("2030-01-01", new Date("2026-05-25T12:00:00Z"))).toBeNull()
    expect(estimateHrMaxFromBirthDate("1890-01-01", new Date("2026-05-25T12:00:00Z"))).toBeNull()
  })
})
