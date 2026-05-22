# Architecture — SportTrack

## Système global

```
┌─────────────────────────────────────────────────────────────┐
│  Client (browser / mobile)                                  │
└────────────┬────────────────────────────────────────────────┘
             │ HTTPS
┌────────────▼────────────────────────────────────────────────┐
│  Next.js 15  (Vercel Edge)                                  │
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  Server Components  │  │  Server Actions              │  │
│  │  · Supabase direct  │  │  · Supabase direct (CRUD)    │  │
│  │    (service_role)   │  │  · FastAPI (compute + AI)    │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Client Components  (React, no DB access)              │ │
│  └─────────────────────────────────────────────────────────┘ │
└────────────┬──────────────────────┬─────────────────────────┘
             │ Supabase JS SDK      │ REST + Bearer JWT
             │ (anon key + RLS)     │ (x-internal-secret)
┌────────────▼──────┐    ┌──────────▼──────────────────────────┐
│  Supabase         │    │  FastAPI  (Railway)                 │
│  · Postgres (RLS) │    │  · /metrics  /risk  /export         │
│  · Auth (JWT)     │    │  · /zones  /injuries  /me           │
│  · Row policies   │    │  · /strava  /terra  /internal       │
└───────────────────┘    │  APScheduler (cron 08:00 / 08:15)  │
                         └──────────────┬──────────────────────┘
                                        │ service_role
                         ┌──────────────▼──────────────────────┐
                         │  Supabase Postgres                  │
                         └─────────────────────────────────────┘
```

### Règles d'accès

| Appelant | Clé utilisée | Accès |
|---|---|---|
| Composants server Next.js | `service_role` | Lecture/écriture toutes tables (pas de RLS) |
| Composants client Next.js | `anon` + session JWT | Lecture/écriture limitée par RLS |
| FastAPI | `service_role` | Lecture/écriture toutes tables (pas de RLS) |
| FastAPI `/internal/*` | Header `x-internal-secret` | Appels serveur-à-serveur uniquement |

---

## Modèle de données (Supabase Postgres)

### `profiles`
Créé automatiquement par le trigger `handle_new_user` à l'inscription.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text | Nom affiché |
| `created_at` | timestamptz | |

### `athlete_profiles`
Données physiologiques et préférences sportives.

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid FK → auth.users | |
| `first_name`, `last_name` | text | |
| `birth_date` | date | |
| `gender` | text | male/female/other/prefer_not_to_say |
| `height_cm`, `weight_kg` | numeric | |
| `hr_max`, `hr_rest` | int | FC max et repos |
| `vma_kmh`, `ftp_watts` | numeric | Seuils sport-spécifiques |
| `primary_sport` | text | running/cycling/trail/… |
| `practiced_sports` | text[] | |
| `weekly_target_hours` | numeric | Objectif hebdomadaire |

### `activities`
Une ligne par séance (importée Strava ou saisie manuellement).

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `strava_activity_id` | bigint | Nullable — null si saisie manuelle |
| `sport_type` | text | |
| `start_date` | timestamptz | |
| `duration_sec` | int | |
| `distance_m` | numeric | |
| `elevation_gain_m` | numeric | |
| `average_heartrate` | numeric | |
| `training_load` | numeric | Charge calculée par FastAPI |
| `rpe`, `feel_score`, `motivation_score`, `perceived_recovery` | int | Feedback post-séance |
| `body_feeling_tags` | jsonb | `{douleur_genou_droit: true, …}` |
| `time_in_zones_json` | jsonb | `[{zone, name, color, sec}, …]` |

### `daily_metrics`
Métriques agrégées par jour, calculées par le scheduler FastAPI.

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid FK | |
| `metric_date` | date | |
| `training_load` | numeric | Charge du jour |
| `training_readiness` | numeric | 0-100 |
| `hrv_rmssd` | numeric | Depuis Terra/Garmin |
| `sleep_score` | numeric | 0-100 |

**CTL / ATL / TSB** sont calculés à la volée depuis l'historique `daily_metrics` :
- CTL (Chronic Training Load, 42j) ≈ fitness
- ATL (Acute Training Load, 7j) ≈ fatigue
- TSB = CTL − ATL ≈ forme du jour

### `hr_zones`
Zones FC personnalisées (modèle Friel 5 zones).

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid FK | |
| `zone_number` | int (1–5) | |
| `zone_name` | text | Endurance, Tempo, … |
| `hr_min`, `hr_max` | int | Bornes en bpm |
| `pct_min`, `pct_max` | numeric | % FC max |
| `color_hex` | text | Couleur d'affichage |
| `is_custom` | bool | Zones manuelles ou calculées |

### `injuries`
Suivi des blessures.

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `body_zone` | text | genou_droit, dos, … |
| `injury_type` | text | muscular/tendinous/bone/ligament/other |
| `severity` | int (1–3) | 1=légère, 3=sévère |
| `start_date` | date | |
| `end_date` | date | null = blessure active |
| `description`, `treatment` | text | |

### `planned_sessions`
Séances planifiées (calendrier / planning).

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `planned_date` | date | |
| `sport_type`, `session_type` | text | |
| `planned_duration_min` | int | |
| `status` | text | planned/completed/skipped/modified |
| `actual_activity_id` | uuid FK → activities | Liaison séance réalisée |

### `provider_connections`
Jetons OAuth par fournisseur (Strava, Terra).

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid FK | |
| `provider` | text | strava / terra |
| `access_token`, `refresh_token` | text | Chiffrés au repos |
| `expires_at` | timestamptz | |
| `provider_user_id` | text | |

### `risk_assessments`
Score de risque de surentraînement calculé par le scheduler.

| Colonne | Type | Description |
|---|---|---|
| `user_id` | uuid FK | |
| `assessment_date` | date | |
| `score` | int (0–10) | |
| `level` | text | none/low/moderate/high/critical |
| `reasons` | jsonb | Liste de facteurs détectés |

---

## Flows de données

### Import Strava

```
Webhook Strava ──► POST /strava/webhook
                    └► sync_service.fetch_and_store_activity()
                         ├► Strava API (activité + streams HR)
                         ├► Calcul training_load
                         └► Upsert activities + daily_metrics
```

### Calcul journalier (APScheduler 08:00)

```
risk_assessment_job
  └► Pour chaque user_id avec activités récentes :
       ├► overtraining_detection.compute_risk_score()
       │    ├► daily_metrics (90j) → CTL/ATL/TSB/ACWR
       │    ├► activities (7j) → RPE moyen, volume
       │    └► Upsert risk_assessments
       └► injury_suggestion_job (08:15)
            └► activities.body_feeling_tags → suggestions
```

### Export IA

```
GET /export/ai-summary?weeks=8&format=markdown
  └► build_export(user_id, weeks=8)
       ├► athlete_profiles
       ├► daily_metrics (→ CTL/ATL/TSB/ACWR)
       ├► activities (7j → ressenti, semaine en cours)
       ├► injuries (actives)
       └► planned_sessions (semaine prochaine)
  └► to_markdown(data)  →  PlainTextResponse
```

---

## Sécurité

- **RLS** activé sur toutes les tables Supabase — chaque ligne n'est accessible qu'à son propriétaire (`auth.uid() = user_id`).
- **JWT** vérifié par FastAPI via `SUPABASE_JWT_SECRET` sur chaque requête authentifiée.
- **Internal secret** (`INTERNAL_SECRET`) partagé entre Next.js et FastAPI pour les endpoints `/internal/*` non exposés publiquement.
- **Tokens OAuth** chiffrés au repos avec Fernet (`ENCRYPTION_KEY`).
