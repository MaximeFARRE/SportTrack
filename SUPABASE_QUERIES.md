# Supabase — État du schéma SportTrack

Ce fichier est la source de vérité sur l'état de la base de données.
Il est mis à jour à chaque nouvelle migration appliquée.

**Dernière vérification : 2026-05-21**

---

## À faire

> Rien — schéma complet et à jour.

---

## Tables en place

| Table | Description | RLS | Appliqué |
|-------|-------------|-----|----------|
| `profiles` | Profil public lié à `auth.users` (display_name, avatar) | ✅ | ✅ |
| `athlete_profiles` | Données sportives (FC max, VMA, FTP, poids…) | ✅ | ✅ |
| `hr_zones` | Zones FC 1-5 par utilisateur (auto ou custom) | ✅ | ✅ |
| `provider_connections` | Connexions OAuth Strava / Terra par utilisateur | ✅ | ✅ |
| `activities` | Activités importées (Strava, Terra, saisie manuelle) | ✅ | ✅ |
| `strava_config` | Credentials Strava app-level (service_role uniquement) | — | ✅ |
| `daily_metrics` | Métriques journalières Terra/Garmin (HRV, sommeil…) | ✅ | ✅ |

---

## Détail par table

### `profiles`
Créée automatiquement à l'inscription via trigger `handle_new_user`.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | = `auth.users.id` |
| `email` | text | unique |
| `display_name` | text | nullable |
| `avatar_url` | text | nullable |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | trigger auto |

Policies : SELECT (own), INSERT (own), UPDATE (own)

---

### `athlete_profiles`
Saisie via la page Profil. Une ligne par utilisateur.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid unique | FK auth.users |
| `first_name`, `last_name` | text | |
| `birth_date` | date | |
| `gender` | text | enum check |
| `height_cm`, `weight_kg` | numeric | |
| `hr_max`, `hr_rest` | int | avec check constraints |
| `vma_kmh` | numeric | |
| `ftp_watts` | int | |
| `css_pace_per_100m` | text | |
| `primary_sport` | text | |
| `practiced_sports` | jsonb | default `[]` |
| `training_years` | int | |
| `weekly_target_hours` | numeric | |
| `created_at`, `updated_at` | timestamptz | |

Policies : SELECT, INSERT, UPDATE, DELETE (own)

---

### `hr_zones`
Calculées depuis `hr_max` via FastAPI. 5 zones par utilisateur.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK auth.users |
| `zone_number` | int | 1–5 |
| `zone_name` | text | ex. "Z2 Endurance" |
| `hr_min`, `hr_max` | int | |
| `pct_min`, `pct_max` | numeric | % FC max |
| `is_custom` | boolean | false = calculé auto |
| `color_hex` | text | |
| `updated_at` | timestamptz | |

Policies : ALL (own)

---

### `provider_connections`
Une ligne par utilisateur par provider. Tokens stockés en clair (à chiffrer en prod).

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK auth.users |
| `provider` | text | `strava` ou `terra` |
| `provider_user_id` | text | ID chez le provider |
| `access_token`, `refresh_token` | text | nullable |
| `token_expires_at` | bigint | Unix timestamp |
| `scopes` | text[] | |
| `is_active` | boolean | default true |
| `last_sync_at` | timestamptz | nullable |
| `created_at`, `updated_at` | timestamptz | |

Policies : SELECT (own), DELETE (own) — INSERT/UPDATE réservés au service_role (FastAPI)

---

### `activities`
Source centrale de toutes les activités, tous providers confondus.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK auth.users |
| `provider` | text | `strava`, `terra`, `manual` |
| `provider_activity_id` | text | ID externe |
| `name` | text | nullable |
| `sport_type` | text | ex. `Run`, `Ride` |
| `start_date` | timestamptz | |
| `timezone` | text | nullable |
| `duration_sec`, `moving_time_sec` | int | nullable |
| `distance_m`, `elevation_gain_m` | numeric | nullable |
| `average_speed`, `max_speed` | numeric | nullable |
| `average_heartrate`, `max_heartrate` | int | nullable |
| `average_cadence`, `average_power` | int | nullable |
| `calories` | int | nullable |
| `raw_data_json` | jsonb | payload brut provider |
| `source` | text | default `strava` |
| `rpe` | int | 1–10, nullable |
| `feel_score`, `motivation_score`, `perceived_recovery` | int | 1–5, nullable |
| `post_session_notes` | text | nullable |
| `body_feeling_tags`, `context_tags`, `session_quality_tags` | jsonb | default `[]` |
| `temperature_c` | numeric | nullable |
| `weather_condition` | text | nullable |
| `time_in_zones_json` | jsonb | nullable (Phase 12) |
| `created_at`, `updated_at` | timestamptz | |

Indexes : `(user_id, start_date desc)`, `(user_id, sport_type)`
Policies : SELECT, INSERT, UPDATE, DELETE (own)

---

### `strava_config`
Table à une seule ligne (id = 1). Contient les credentials Strava de l'application.
Accessible uniquement via `service_role` — pas de RLS, pas de policies.

| Colonne | Type |
|---------|------|
| `id` | int PK (= 1) |
| `client_id` | text |
| `client_secret` | text |
| `webhook_verify_token` | text |
| `updated_at` | timestamptz |

---

### `daily_metrics`
Une ligne par utilisateur par jour. Alimentée par les webhooks Terra/Garmin.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK auth.users |
| `metric_date` | date | unique par user |
| `sessions_count`, `duration_sec`, `distance_m`, `elevation_gain_m`, `training_load` | numeric | agrégats activités |
| `resting_hr` | int | FC repos |
| `hrv_rmssd` | numeric | |
| `hrv_status` | text | enum check |
| `sleep_score` | int | 0–100 |
| `sleep_duration_min`, `sleep_deep_min`, `sleep_rem_min`, `sleep_light_min`, `sleep_awake_min` | int | minutes |
| `body_battery_morning`, `body_battery_evening`, `training_readiness` | int | 0–100 |
| `stress_score_avg` | int | 0–100 |
| `spo2_avg`, `respiration_avg`, `vo2max_estimated` | numeric | |
| `updated_at` | timestamptz | |

Index : `(user_id, metric_date desc)`
Policies : SELECT (own), ALL (service_role)

---

## Fonctions et triggers globaux

| Nom | Type | Rôle |
|-----|------|------|
| `set_updated_at()` | fonction trigger | Met à jour `updated_at` avant chaque UPDATE |
| `handle_new_user()` | fonction trigger | Crée un `profiles` à chaque nouvel `auth.users` |
| `on_auth_user_created` | trigger sur `auth.users` | Appelle `handle_new_user` après INSERT |
