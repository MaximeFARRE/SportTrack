import { describe, expect, it } from "vitest"

import { classifyHr, computeZonesFromHrMax } from "@/lib/compute/hr-zones"

describe("computeZonesFromHrMax", () => {
  it("returns 5 zones with correct boundaries for hr_max=200", () => {
    const zones = computeZonesFromHrMax(200)

    expect(zones).toHaveLength(5)
    expect(zones[0]).toMatchObject({ zone_number: 1, hr_min: 0, hr_max: 136 })
    expect(zones[1]).toMatchObject({ zone_number: 2, hr_min: 136, hr_max: 166 })
    expect(zones[4]).toMatchObject({ zone_number: 5, hr_max: null })
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
    [215, 200, 5],
  ])("classifies bpm=%i with hrMax=%i as zone %i", (bpm, hrMax, expected) => {
    expect(classifyHr(bpm, hrMax)).toBe(expected)
  })
})
