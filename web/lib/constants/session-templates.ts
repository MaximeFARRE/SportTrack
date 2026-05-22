export type SessionTemplate = {
  id: string
  label: string
  sport_type: string
  session_type: string
  default_duration_min: number
  description: string
  target_zones: number[]
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  // ── Course à pied ──────────────────────────────────────────────────────────
  {
    id: "run-endurance",
    label: "Endurance fondamentale",
    sport_type: "Run",
    session_type: "endurance",
    default_duration_min: 60,
    description: "Sortie longue à allure conversationnelle, zones 1-2.",
    target_zones: [1, 2],
  },
  {
    id: "run-threshold",
    label: "Seuil",
    sport_type: "Run",
    session_type: "threshold",
    default_duration_min: 55,
    description: "Échauffement 15min + 3×10min seuil (zone 4) + retour 10min.",
    target_zones: [4],
  },
  {
    id: "run-intervals",
    label: "Fractionné VMA",
    sport_type: "Run",
    session_type: "intervals",
    default_duration_min: 50,
    description: "Échauffement 15min + 8×400m VMA (zone 5) + retour 10min.",
    target_zones: [5],
  },
  {
    id: "run-recovery",
    label: "Récupération active",
    sport_type: "Run",
    session_type: "recovery",
    default_duration_min: 30,
    description: "Footing très léger zone 1, aucune contrainte de temps.",
    target_zones: [1],
  },
  {
    id: "run-long",
    label: "Sortie longue",
    sport_type: "Run",
    session_type: "long_run",
    default_duration_min: 90,
    description: "Sortie 1h30+ à allure facile, hydratation et nutrition.",
    target_zones: [2],
  },

  // ── Vélo ───────────────────────────────────────────────────────────────────
  {
    id: "ride-endurance",
    label: "Endurance vélo",
    sport_type: "Ride",
    session_type: "endurance",
    default_duration_min: 90,
    description: "Sortie à allure stable zones 2-3, bon pour la base aérobie.",
    target_zones: [2, 3],
  },
  {
    id: "ride-threshold",
    label: "Seuil FTP",
    sport_type: "Ride",
    session_type: "threshold",
    default_duration_min: 60,
    description: "2×20min autour du FTP (zone 4) avec récup 5min entre.",
    target_zones: [4],
  },
  {
    id: "ride-intervals",
    label: "Intervalles puissance",
    sport_type: "Ride",
    session_type: "intervals",
    default_duration_min: 75,
    description: "5×5min au-dessus du FTP (zone 5) + 5min récup entre chaque.",
    target_zones: [5],
  },
  {
    id: "ride-recovery",
    label: "Récupération vélo",
    sport_type: "Ride",
    session_type: "recovery",
    default_duration_min: 45,
    description: "Sortie facile zone 1, cadence élevée (90+), sans forcer.",
    target_zones: [1],
  },

  // ── Natation ───────────────────────────────────────────────────────────────
  {
    id: "swim-endurance",
    label: "Endurance natation",
    sport_type: "Swim",
    session_type: "endurance",
    default_duration_min: 50,
    description: "3000m en continu à allure modérée, travail du souffle.",
    target_zones: [2, 3],
  },
  {
    id: "swim-intervals",
    label: "Séance vitesse",
    sport_type: "Swim",
    session_type: "intervals",
    default_duration_min: 60,
    description: "10×100m rapide avec 20s récup, travail de l'allure cible.",
    target_zones: [4, 5],
  },
  {
    id: "swim-technique",
    label: "Technique",
    sport_type: "Swim",
    session_type: "technique",
    default_duration_min: 45,
    description: "Exercices spécifiques : catch, pull, rotation. Qualité avant quantité.",
    target_zones: [1, 2],
  },

  // ── Musculation / Force ────────────────────────────────────────────────────
  {
    id: "strength-full",
    label: "Force globale",
    sport_type: "WeightTraining",
    session_type: "strength",
    default_duration_min: 60,
    description: "Squat, développé couché, soulevé de terre. 4 séries × 5 reps lourdes.",
    target_zones: [],
  },
  {
    id: "strength-hypertrophy",
    label: "Hypertrophie",
    sport_type: "WeightTraining",
    session_type: "hypertrophy",
    default_duration_min: 70,
    description: "8-12 reps par exercice, 3-4 séries. Progression en volume.",
    target_zones: [],
  },
  {
    id: "strength-core",
    label: "Gainage / Core",
    sport_type: "WeightTraining",
    session_type: "core",
    default_duration_min: 30,
    description: "Planches, oiseau-chien, deadbugs. Renforcement du tronc profond.",
    target_zones: [],
  },

  // ── Yoga / Mobilité ────────────────────────────────────────────────────────
  {
    id: "yoga-recovery",
    label: "Yoga récupération",
    sport_type: "Yoga",
    session_type: "recovery",
    default_duration_min: 30,
    description: "Séance douce : étirements, respiration, relâchement musculaire.",
    target_zones: [],
  },
  {
    id: "yoga-power",
    label: "Yoga dynamique",
    sport_type: "Yoga",
    session_type: "strength",
    default_duration_min: 50,
    description: "Vinyasa ou Ashtanga : travail de force, équilibre et souplesse.",
    target_zones: [],
  },

  // ── Libre ──────────────────────────────────────────────────────────────────
  {
    id: "free",
    label: "Séance libre",
    sport_type: "Workout",
    session_type: "free",
    default_duration_min: 45,
    description: "",
    target_zones: [],
  },
]

export const TEMPLATE_BY_SPORT: Record<string, SessionTemplate[]> = {}
for (const t of SESSION_TEMPLATES) {
  if (!TEMPLATE_BY_SPORT[t.sport_type]) TEMPLATE_BY_SPORT[t.sport_type] = []
  TEMPLATE_BY_SPORT[t.sport_type].push(t)
}
