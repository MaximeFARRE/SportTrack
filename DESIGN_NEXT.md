# Design — Prochaines évolutions SportTrack

*Document de conception — pas de code. Référence pour l'implémentation future.*
*Rédigé le 2026-05-20, suite à l'audit AUDIT.md.*

---

## 1. Zones de fréquence cardiaque automatiques

### Principe

Les zones FC sont calculées automatiquement depuis la **FC max** du profil athlète. L'athlète peut ensuite les **modifier manuellement** pour coller à sa physiologie réelle (ou aux recommandations de son coach).

### Méthode de calcul recommandée : zones Friel (5 zones)

C'est la référence la plus utilisée en endurance. Basée sur un pourcentage de la FC max.

| Zone | Nom | % FC max | Perception | Effet physiologique |
|---|---|---|---|---|
| Z1 | Récupération active | < 68% | Très facile, conversation normale | Récupération, base aérobie |
| Z2 | Endurance fondamentale | 68–83% | Facile, conversation possible | Construction aérobie, fat burning |
| Z3 | Tempo / Allure soutenue | 84–94% | Modéré, phrases courtes | Seuil aérobie, endurance musculaire |
| Z4 | Seuil lactique | 95–105% | Difficile, mots isolés | Seuil anaérobie, VO2max |
| Z5 | Anaérobie / Max | > 106% | Maximum, impossible de parler | Puissance neuromusculaire |

> Note : les pourcentages peuvent légèrement dépasser 100% car la FC max est parfois sous-estimée par l'athlète. Cela est normal.

### Variantes disponibles (selon sport et préférence)

| Méthode | Zones | Basée sur | Adapté à |
|---|---|---|---|
| Friel 5 zones | 5 | FC max | Course, vélo, natation |
| Coggan (vélo) | 7 | FTP (puissance) | Cyclisme avec capteur de puissance |
| Polar 5 zones | 5 | FC max + FC repos | Général |
| 3 zones (polarisé) | 3 | VT1 / VT2 | Approche scientifique moderne |

Pour l'implémentation initiale : **Friel 5 zones** uniquement. Les autres peuvent être ajoutées plus tard.

### Règle de calcul (Python pseudocode)

```
FC_max = athlete.profile.hr_max  # saisie manuelle ou détectée via Garmin/Strava

zones = [
    Zone(name="Z1", min_pct=0.00, max_pct=0.68),
    Zone(name="Z2", min_pct=0.68, max_pct=0.83),
    Zone(name="Z3", min_pct=0.83, max_pct=0.94),
    Zone(name="Z4", min_pct=0.94, max_pct=1.05),
    Zone(name="Z5", min_pct=1.05, max_pct=1.00),  # pas de borne haute
]

# Calcul des bornes absolues
for zone in zones:
    zone.hr_min = round(FC_max * zone.min_pct)
    zone.hr_max = round(FC_max * zone.max_pct)
```

### Comportement du calcul automatique

1. À la création ou mise à jour du profil athlète (modification de la FC max), les zones sont **recalculées automatiquement**.
2. Si l'athlète a défini des **valeurs manuelles**, celles-ci prennent le dessus et le calcul automatique ne les écrase plus.
3. Un flag `is_custom: bool` sur chaque zone permet de distinguer "calculé" vs "défini manuellement".
4. Un bouton "Réinitialiser les zones" remet les valeurs calculées depuis la FC max.

### Utilisation des zones dans l'application

Une fois les zones définies, toute activité avec des données de FC peut être analysée :

- **Temps passé par zone** : pie chart Z1/Z2/Z3/Z4/Z5 pour chaque activité
- **Distribution de charge par zone** sur la semaine/mois
- **Ratio polarisé** : % Z1+Z2 vs % Z3+ (idéalement 80/20 pour l'endurance)
- **FC moyenne de l'activité** → indicateur de zone dominante
- Les zones alimentent aussi le calcul du **Training Load** (plus précis que le coefficient générique actuel)

### Modèle de données

**Nouveau modèle `HRZone`** lié à `Athlete` :
```
id
athlete_id          (FK)
zone_number         (1–5)
zone_name           (Z1, Z2, ...)
hr_min              (bpm)
hr_max              (bpm, nullable pour Z5)
is_custom           (bool, false = calculé automatiquement)
color_hex           (ex: #2196F3 pour Z2, pour l'affichage)
created_at
updated_at
```

---

## 2. Ressenti et informations post-séance

### Objectif

Après chaque séance (importée ou saisie manuellement), l'athlète peut enrichir l'activité avec des données subjectives. Ces données sont **cruciales pour l'IA** — elles donnent un contexte que les capteurs ne peuvent pas fournir.

### Champs à ajouter sur le modèle `Activity`

#### Données subjectives

| Champ | Type | Valeurs / Format | Description |
|---|---|---|---|
| `rpe` | int (nullable) | 1–10 | Rate of Perceived Exertion. 1 = très facile, 10 = maximum absolu |
| `feel_score` | int (nullable) | 1–5 | Sensations générales (1=terrible → 5=exceptionnel) |
| `motivation_score` | int (nullable) | 1–5 | Niveau de motivation avant la séance |
| `post_session_notes` | text (nullable) | texte libre | Journal libre : douleurs, contexte, observations |
| `perceived_recovery` | int (nullable) | 1–5 | Récupération ressentie *avant* la séance (jambes lourdes ?) |

#### Sélecteurs contextuels (multi-sélection possible)

| Champ | Type | Valeurs possibles |
|---|---|---|
| `body_feeling_tags` | list[str] | `jambes_lourdes`, `jambes_légères`, `fatigue_générale`, `courbatures`, `douleur_genou_droit`, `douleur_genou_gauche`, `douleur_dos`, `douleur_cheville`, `douleur_hanche`, `douleur_épaule`, `crampes`, `tête_lourde` |
| `context_tags` | list[str] | `chaleur_forte`, `froid`, `vent`, `pluie`, `altitude`, `manque_de_sommeil`, `stress_professionnel`, `voyage`, `maladie`, `menstruations` |
| `session_quality_tags` | list[str] | `séance_coupée`, `objectif_non_atteint`, `mieux_que_prévu`, `bonne_régularité`, `mauvaise_alimentation`, `déshydratation`, `matériel_problème` |

> Ces tags sont stockés en JSON array dans la DB. Ils permettent des corrélations statistiques : "quand `jambes_lourdes` + `manque_de_sommeil`, la perf chute de X%".

#### Données environnementales (auto ou manuelle)

| Champ | Type | Source |
|---|---|---|
| `temperature_c` | float (nullable) | Auto via API météo (OpenMeteo, gratuit) ou Garmin |
| `humidity_pct` | float (nullable) | Auto via API météo |
| `weather_condition` | str (nullable) | `soleil`, `nuageux`, `pluie`, `neige`, `vent` |

### Interface utilisateur (Streamlit)

Le formulaire post-séance s'affiche après chaque import ou en cliquant sur une activité :

```
┌─────────────────────────────────────────────────────────┐
│  🏃 Course à pied — 12.4 km — 58 min                    │
│  Dimanche 18 mai 2026                                   │
├─────────────────────────────────────────────────────────┤
│  Comment s'est passée cette séance ?                     │
│                                                         │
│  RPE (effort perçu)     [  1  2  3  4  5  6  7  8  9  10 ]
│  Sensations             [☆ ☆ ☆ ☆ ☆]  Terrible → Exceptionnel
│  Récupération ressentie [☆ ☆ ☆ ☆ ☆]  Avant la séance
│                                                         │
│  Comment étaient tes jambes ?                           │
│  [ ] Légères  [✓] Légèrement lourdes  [ ] Lourdes       │
│                                                         │
│  Contexte                                               │
│  [ ] Chaleur  [ ] Vent  [✓] Manque de sommeil           │
│                                                         │
│  Notes libres                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Sortie difficile, jambes encore chargées de       │  │
│  │ la séance seuil de jeudi. Genou droit un peu...   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│                              [ Enregistrer ]            │
└─────────────────────────────────────────────────────────┘
```

### Utilisation dans l'application

- **Corrélation RPE vs charge calculée** : si RPE élevé pour une charge faible → signal de fatigue
- **Tags de douleur** → alerte dans le module de détection de blessures
- **Tendance des sensations** sur 4 semaines → courbe `feel_score` superposée au CTL
- **Export IA** : les notes textuelles sont le signal le plus riche pour un LLM

---

## 3. Intégration Garmin — Stratégie

### Le problème fondamental

Les sportifs utilisent des montres Garmin (Fenix, Forerunner, Epix, etc.). Garmin synchronise automatiquement les activités vers Strava **mais** les données de santé (HRV, FC repos, sommeil, Body Battery, stress) **ne passent pas dans Strava**. Elles restent exclusivement dans Garmin Connect.

Il faut donc une intégration directe avec Garmin, en plus de Strava.

### Données disponibles sur Garmin Connect

| Catégorie | Donnée | Disponibilité |
|---|---|---|
| **Activités** | GPS, FC, cadence, puissance, allure, zones FC | ✅ (aussi via Strava) |
| **Récupération** | HRV status, HRV nuit (rMSSD), Body Battery | ✅ Garmin uniquement |
| **Sommeil** | Durée totale, phases (sommeil léger/profond/REM), score de sommeil, respirations | ✅ Garmin uniquement |
| **Santé quotidienne** | FC repos, FC moyenne journalière, SpO2, fréquence respiratoire, stress score | ✅ Garmin uniquement |
| **Fitness** | VO2max estimé, Training Status (productive/recovery/strained), Training Readiness score | ✅ Garmin uniquement |
| **Corps** | Poids, % masse grasse (si balance Garmin Index) | ✅ Garmin uniquement |
| **Hydratation** | Consommation d'eau journalière (saisie manuelle sur montre) | ✅ Garmin uniquement |

> **Training Readiness** (score 0–100 intégrant HRV, sommeil, Body Battery) est une des données les plus précieuses pour prévenir le surentraînement.

### Analyse des options d'intégration

#### Option A — Garmin Health API (officielle)

L'API officielle de Garmin pour les partenaires B2B.

**Fonctionnement :** Architecture **push-only**. Garmin envoie les données vers un webhook de l'application dès que l'utilisateur synchronise sa montre. L'application n'interroge jamais Garmin.

**Données disponibles :** Toutes. C'est l'API la plus complète.

**Accès :**
- Enrollment obligatoire sur le [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/health-api/)
- Processus d'approbation B2B (quelques semaines)
- Coût : non public, partenarial

**Verdict :** Solution idéale à long terme si l'application devient un produit sérieux. Trop lourd pour un démarrage.

---

#### Option B — `garminconnect` (bibliothèque Python non officielle)

Bibliothèque Python maintenue par la communauté (cyberjunky) qui simule l'application Android Garmin Connect pour récupérer les données.

**Données disponibles :** Toutes (HRV, sommeil, Body Battery, stress, VO2max, etc.)

**Fonctionnement :** L'application se connecte avec les identifiants Garmin de l'utilisateur, obtient des tokens OAuth, et interroge les endpoints internes de Garmin Connect.

**Problèmes récents (2025-2026) :**
- Mars 2026 : changement côté Garmin → authentification cassée (issue #332)
- Décembre 2025 : bug sur les comptes avec MFA (issue #312)
- Garmin renforce activement la protection de ses endpoints
- Risque permanent : Garmin peut casser l'intégration sans préavis

**Verdict :** Acceptable pour prototyper rapidement. **Risque élevé en production** — prévoir une dégradation gracieuse si l'API casse.

---

#### Option C — Terra API (agrégateur tiers)

Service tiers gérant l'intégration avec Garmin (et 30+ autres sources : Apple Health, Polar, Fitbit, Whoop...).

**Fonctionnement :** Terra devient partenaire officiel Garmin et expose une API REST unifiée vers l'application.

**Données disponibles :** Toutes les données Garmin Health API, normalisées dans un format unifié.

**Coût :** Gratuit jusqu'à 10 utilisateurs, puis tarification par utilisateur actif. Abordable pour un petit projet.

**Avantages clés :**
- Un seul connecteur couvre Garmin, Polar, Fitbit, Apple Health, Suunto, Whoop, etc.
- Webhook push vers l'application (même architecture que Garmin Health API directe)
- Pas de gestion de tokens Garmin, pas de risque de cassure
- Onboarding utilisateur via un widget Terra (comme Strava OAuth)

**Inconvénients :**
- Dépendance à un service tiers
- Données transitent par les serveurs de Terra

**Verdict : Recommandé comme solution principale pour l'intégration Garmin.** C'est le meilleur rapport effort/fiabilité pour une application de taille moyenne.

---

#### Option D — Parsing de fichiers FIT

Les montres Garmin génèrent des fichiers `.FIT` (format binaire propriétaire). L'utilisateur peut les exporter manuellement depuis Garmin Express ou Garmin Connect Web.

**Données disponibles :** Activités complètes avec données GPS, FC, puissance, zones. **Pas les données de santé** (HRV, sommeil, Body Battery — ceux-ci ne sont pas dans les FIT d'activité).

**Librairies Python :** `python-fitparse` ou le SDK officiel `garmin-fit-sdk`.

**Verdict :** Utile comme **fallback** ou pour les utilisateurs qui ne veulent pas connecter un compte Garmin. Ne remplace pas une intégration cloud pour les données de récupération.

---

### Stratégie recommandée en 3 phases

#### Phase 1 — Prototypage (maintenant)
**Approche : `garminconnect` + Strava**

- Strava pour les activités (déjà en place)
- `garminconnect` pour HRV, sommeil, FC repos, Body Battery
- Sync manuelle + sync automatique toutes les 6h (APScheduler existant dans l'app)
- Toutes les données stockées en DB immédiatement (ne pas dépendre de Garmin en temps réel)
- Afficher une alerte utilisateur si la sync Garmin échoue (ne pas bloquer le reste)

**Ce qu'on récupère :**
```
Chaque matin (sync 6h) :
├── FC repos du jour (DailyMetric)
├── Score HRV de la nuit (DailyMetric)
├── Durée et score de sommeil (DailyMetric)
├── Body Battery matin (DailyMetric)
├── Training Readiness score (DailyMetric)
└── Score stress journalier (DailyMetric)
```

#### Phase 2 — Stabilisation (3–6 mois)
**Approche : Migration vers Terra API**

- Remplacer `garminconnect` par Terra si des problèmes de stabilité apparaissent
- Terra gère aussi Polar, Fitbit, Apple Health → élargit l'audience sans travail supplémentaire
- Webhook Terra → endpoint FastAPI → stockage DB (même logique que Strava webhooks)

#### Phase 3 — Officialisation (si l'app devient publique)
**Approche : Garmin Health API officielle**

- Soumettre une demande de partenariat Garmin Health API
- Architecture identique à Terra (push webhooks) mais sans intermédiaire
- Données certifiées, SLA garanti

---

### Architecture technique cible

```
Montre Garmin
    │
    ▼ sync Bluetooth
Garmin Connect App
    │
    ├──► Strava (activités seulement) ──► /sync/strava  ──► DB activities
    │
    └──► garminconnect lib / Terra API
              │
              ▼
         /sync/garmin (nouveau endpoint FastAPI)
              │
              ├──► DB daily_metrics
              │     ├── resting_hr
              │     ├── hrv_rmssd
              │     ├── sleep_score
              │     ├── sleep_duration_min
              │     ├── body_battery_morning
              │     ├── training_readiness
              │     └── stress_score
              │
              └──► DB activities (si doublons avec Strava → merge par date/durée)
```

---

### Nouvelles colonnes sur `DailyMetric`

Les données de récupération Garmin enrichissent le modèle existant :

| Colonne | Type | Source | Description |
|---|---|---|---|
| `resting_hr` | int (nullable) | Garmin | FC repos matinale (bpm) |
| `hrv_rmssd` | float (nullable) | Garmin | HRV nuit (ms) — plus le chiffre est élevé, meilleure est la récupération |
| `hrv_status` | str (nullable) | Garmin | `balanced`, `low`, `unbalanced`, `poor` |
| `sleep_score` | int (nullable) | Garmin | Score global 0–100 |
| `sleep_duration_min` | int (nullable) | Garmin | Durée totale de sommeil |
| `sleep_deep_min` | int (nullable) | Garmin | Temps en sommeil profond |
| `sleep_rem_min` | int (nullable) | Garmin | Temps en sommeil REM |
| `body_battery_morning` | int (nullable) | Garmin | Body Battery au réveil (0–100) |
| `training_readiness` | int (nullable) | Garmin | Score Training Readiness (0–100) |
| `stress_score_avg` | int (nullable) | Garmin | Score de stress journalier moyen |
| `spo2_avg` | float (nullable) | Garmin | SpO2 moyen (%) |

---

### Modification de la stratégie de détection surentraînement

Avec les données Garmin, la logique d'alerte devient bien plus précise :

**Ancien modèle (TSB seul) :**
```
if TSB < -20 → "risque de surentraînement"
```

**Nouveau modèle (multivarié) :**
```
score_risque = 0

if ACWR > 1.5:          score_risque += 3  # charge aiguë trop haute
if TSB < -20:           score_risque += 2  # fatigue accumulée
if HRV < baseline - 10: score_risque += 3  # SNA perturbé (signal le plus fort)
if resting_hr > baseline + 5: score_risque += 2  # FC repos élevée
if sleep_score < 50:    score_risque += 2  # récupération nocturne insuffisante
if body_battery < 40:   score_risque += 1  # réserves faibles
if RPE > 8 (3 séances consécutives): score_risque += 2  # ressenti dégradé

if score_risque >= 5 → alerte "Surentraînement probable — repos recommandé"
if score_risque >= 3 → alerte "Charge élevée — surveiller la récupération"
```

La **HRV** est le signal le plus fiable : une baisse de 10+ points par rapport à la baseline personnelle est un indicateur de stress physiologique avant même l'apparition de la fatigue subjective.

---

## 4. Données nécessaires pour l'export IA

En combinant tout ce qui précède, voici le payload complet que l'endpoint `/export/ai-summary` pourra retourner :

```json
{
  "athlete": {
    "sport_principal": "trail",
    "hr_max": 187,
    "vma_kmh": 14.5,
    "objectifs": ["Trail 50km - 15 juin 2026"],
    "age": 34,
    "poids_kg": 72
  },
  "forme_actuelle": {
    "ctl": 58.3,
    "atl": 67.1,
    "tsb": -8.8,
    "acwr": 1.34,
    "statut": "charge_elevee",
    "tendance_7j": "+12%"
  },
  "recuperation_7j": {
    "hrv_moyen": 42.1,
    "hrv_baseline_4sem": 51.3,
    "hrv_tendance": "basse",
    "fc_repos_moy": 54,
    "sleep_score_moy": 68,
    "body_battery_matin_moy": 55,
    "training_readiness_moy": 48
  },
  "semaine_en_cours": {
    "sessions": 4,
    "volume_km": 52,
    "deuxieme_km": 1850,
    "charge_totale": 312,
    "zones": {"Z1": "34%", "Z2": "41%", "Z3": "18%", "Z4": "7%", "Z5": "0%"}
  },
  "ressenti_recent": [
    {"date": "2026-05-19", "rpe": 8, "feel_score": 2, "tags": ["jambes_lourdes", "manque_de_sommeil"], "notes": "Sortie difficile, genou droit un peu douloureux en descente"},
    {"date": "2026-05-17", "rpe": 7, "feel_score": 3, "tags": [], "notes": ""}
  ],
  "alertes_actives": [
    "HRV 18% sous la baseline sur 5 jours consécutifs",
    "ACWR à 1.34 — zone de risque modéré",
    "Douleur genou droit mentionnée 2 séances sur 3"
  ],
  "blessures_actives": [],
  "plan_semaine_prochaine": [
    {"jour": "lundi", "type": "récupération", "durée_min": 45},
    {"jour": "mercredi", "type": "seuil", "durée_min": 75},
    {"jour": "vendredi", "type": "long", "durée_min": 120}
  ]
}
```

Ce JSON suffit à n'importe quel LLM pour produire une analyse pertinente et personnalisée.

---

## 5. Résumé des modèles à créer ou modifier

| Modèle | Action | Changements |
|---|---|---|
| `Athlete` | Modifier | + `hr_max`, `hr_rest`, `vma_kmh`, `ftp_watts`, `weight_kg`, `birth_year`, `garmin_access_token`, `garmin_refresh_token`, `garmin_token_expires_at` |
| `HRZone` | Créer | Voir §1 — 5 zones par athlète, calculées ou manuelles |
| `Activity` | Modifier | + `rpe`, `feel_score`, `motivation_score`, `perceived_recovery`, `post_session_notes`, `body_feeling_tags` (JSON), `context_tags` (JSON), `session_quality_tags` (JSON), `temperature_c`, `weather_condition`, `source` (strava/garmin/manual) |
| `DailyMetric` | Modifier | + colonnes récupération Garmin (voir §3) |
| `PlannedSession` | Créer | `athlete_id`, `planned_date`, `sport_type`, `planned_duration_min`, `planned_load`, `notes`, `actual_activity_id` (nullable) |

---

*Ce document sera la référence pour toutes les prochaines implémentations. Ne pas supprimer avant que les fonctionnalités soient livrées.*
