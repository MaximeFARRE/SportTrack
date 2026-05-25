type ActivityForPerformance = {
  start_date: string
  sport_type: string
  duration_sec: number | null
  distance_m: number | null
}

function normalizeSportType(sportType: string): string {
  return sportType.toLowerCase().replace(/[\s_-]/g, "")
}

function isRunning(sportType: string): boolean {
  const norm = normalizeSportType(sportType)
  return norm === "run" || norm === "running" || norm === "trailrun" || norm === "trail"
}

export function getBenchmarks(targetDistanceKm: number) {
  if (targetDistanceKm <= 6) {
    return { targetWeeklyVolume: 15, targetLongRun: 6 }
  } else if (targetDistanceKm <= 12) {
    return { targetWeeklyVolume: 25, targetLongRun: 10 }
  } else if (targetDistanceKm <= 25) {
    return { targetWeeklyVolume: 40, targetLongRun: 16 }
  } else {
    // Marathon and ultra
    return { targetWeeklyVolume: 55, targetLongRun: 28 }
  }
}

/**
 * Calcule un score de préparation sur 100 basé sur les 28 derniers jours.
 */
export function calculateGroupReadiness(
  activities: ActivityForPerformance[],
  targetDistanceKm: number,
  now: Date = new Date()
): number {
  const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)

  // Filtrer les activités de course dans les 28 derniers jours
  const runs = activities.filter((act) => {
    const actDate = new Date(act.start_date)
    return isRunning(act.sport_type) && actDate >= cutoff && actDate <= now
  })

  if (runs.length === 0) return 0

  // Volume hebdomadaire moyen de course en km
  const totalDistanceM = runs.reduce((sum, act) => sum + (act.distance_m ?? 0), 0)
  const totalDistanceKm = totalDistanceM / 1000
  const weeklyVolumeKm = totalDistanceKm / 4

  // Plus longue sortie course en km
  const maxRunDistanceM = runs.reduce((max, act) => Math.max(max, act.distance_m ?? 0), 0)
  const maxRunDistanceKm = maxRunDistanceM / 1000

  const { targetWeeklyVolume, targetLongRun } = getBenchmarks(targetDistanceKm)

  const volumeRatio = Math.min(1, weeklyVolumeKm / targetWeeklyVolume)
  const longRunRatio = Math.min(1, maxRunDistanceKm / targetLongRun)

  // 50% volume global, 50% sortie longue
  const readiness = (volumeRatio * 0.5 + longRunRatio * 0.5) * 100

  return Math.round(readiness)
}

/**
 * Estime le chrono de course cible en secondes via la formule de Riegel combinée au readiness score.
 */
export function estimateRaceTime(
  activities: ActivityForPerformance[],
  targetDistanceKm: number,
  now: Date = new Date()
): number | null {
  const cutoff = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)

  // Filtrer les activités de course
  const runs = activities.filter((act) => {
    const actDate = new Date(act.start_date)
    return (
      isRunning(act.sport_type) &&
      actDate >= cutoff &&
      actDate <= now &&
      (act.distance_m ?? 0) > 100 &&
      (act.duration_sec ?? 0) > 30
    )
  })

  if (runs.length === 0) return null

  // Allure moyenne de référence
  const totalDistanceM = runs.reduce((sum, act) => sum + (act.distance_m ?? 0), 0)
  const totalDurationSec = runs.reduce((sum, act) => sum + (act.duration_sec ?? 0), 0)

  if (totalDistanceM === 0) return null

  const averagePaceSecPerMeter = totalDurationSec / totalDistanceM

  // Appliquer la formule de Riegel
  // D1 = Distance moyenne des entraînements
  // T1 = Durée moyenne estimée pour D1 à l'allure moyenne
  const avgDistanceM = totalDistanceM / runs.length
  const avgDurationSec = avgDistanceM * averagePaceSecPerMeter
  const targetDistanceM = targetDistanceKm * 1000

  // Riegel: T2 = T1 * (D2 / D1)^1.06
  let estimatedTimeSec = avgDurationSec * Math.pow(targetDistanceM / avgDistanceM, 1.06)

  // Pénalité d'endurance basée sur le Readiness Score
  const readiness = calculateGroupReadiness(activities, targetDistanceKm, now)
  // Max 40% de pénalité de temps si readiness = 0
  const penaltyFactor = 1.0 + ((100 - readiness) / 100) * 0.4
  estimatedTimeSec *= penaltyFactor

  // S'assurer de rester dans des bornes physiologiques crédibles
  // Allure de course entre 3:00/km et 10:00/km
  const minAllowedTime = targetDistanceKm * 180 // 3 min/km
  const maxAllowedTime = targetDistanceKm * 600 // 10 min/km

  return Math.round(Math.max(minAllowedTime, Math.min(estimatedTimeSec, maxAllowedTime)))
}
