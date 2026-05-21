# Requêtes SQL Supabase — SportTrack

À exécuter dans **Supabase Dashboard → SQL Editor**, dans l'ordre indiqué.
Chaque bloc est indépendant et peut être exécuté séparément.

---

## Bloc 1 — Fonctions utilitaires + table `profiles`

> Phase 0 · Prérequis de tous les autres blocs — à exécuter en premier.

```sql
-- Fonction générique updated_at (utilisée par tous les triggers)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Table profiles (liée à auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger : crée automatiquement un profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Bloc 2 — Table `athlete_profiles` + `hr_zones`

> Phase 1 · Profil sportif et zones de fréquence cardiaque.

```sql
create table public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users on delete cascade,
  first_name text,
  last_name text,
  birth_date date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  hr_max int check (hr_max between 100 and 230),
  hr_rest int check (hr_rest between 30 and 100),
  vma_kmh numeric(4,1),
  ftp_watts int,
  css_pace_per_100m text,
  primary_sport text,
  practiced_sports jsonb default '[]'::jsonb,
  training_years int,
  weekly_target_hours numeric(4,1),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.athlete_profiles enable row level security;

create policy "users_select_own_athlete_profile" on athlete_profiles
  for select using (auth.uid() = user_id);
create policy "users_insert_own_athlete_profile" on athlete_profiles
  for insert with check (auth.uid() = user_id);
create policy "users_update_own_athlete_profile" on athlete_profiles
  for update using (auth.uid() = user_id);
create policy "users_delete_own_athlete_profile" on athlete_profiles
  for delete using (auth.uid() = user_id);

create trigger athlete_profiles_set_updated_at
  before update on public.athlete_profiles
  for each row execute function public.set_updated_at();

create index idx_athlete_profiles_user_id on public.athlete_profiles (user_id);

-- -------------------------------------------------------

create table public.hr_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  zone_number int not null check (zone_number between 1 and 5),
  zone_name text not null,
  hr_min int not null,
  hr_max int,
  pct_min numeric(3,2) not null,
  pct_max numeric(3,2),
  is_custom boolean default false not null,
  color_hex text not null,
  updated_at timestamptz default now() not null,
  unique (user_id, zone_number)
);

alter table public.hr_zones enable row level security;

create policy "users_all_own_hr_zones" on hr_zones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger hr_zones_set_updated_at
  before update on public.hr_zones
  for each row execute function public.set_updated_at();

create index idx_hr_zones_user_id on public.hr_zones (user_id);
```

---

## Bloc 3 — Table `provider_connections`

> Phase 3 · Connexions OAuth Strava et Terra (tokens stockés côté serveur).

```sql
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('strava', 'terra')),
  provider_user_id text not null,
  access_token text,
  refresh_token text,
  token_expires_at bigint,
  scopes text[],
  is_active boolean default true not null,
  last_sync_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider)
);

alter table public.provider_connections enable row level security;

-- L'utilisateur voit ses connexions (mais jamais les tokens — sélectionnés explicitement dans le code)
create policy "users_select_own_connections" on provider_connections
  for select using (auth.uid() = user_id);

create policy "users_delete_own_connections" on provider_connections
  for delete using (auth.uid() = user_id);

-- Le service_role (FastAPI) gère les inserts/updates (tokens restent côté serveur)

create trigger provider_connections_set_updated_at
  before update on provider_connections
  for each row execute function public.set_updated_at();
```

---

## Bloc 4 — Table `activities`

> Phase 3 · Activités importées depuis Strava (et futures sources).

```sql
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  provider_activity_id text not null,
  name text,
  sport_type text not null,
  start_date timestamptz not null,
  timezone text,
  duration_sec int,
  moving_time_sec int,
  distance_m numeric,
  elevation_gain_m numeric,
  average_speed numeric,
  max_speed numeric,
  average_heartrate int,
  max_heartrate int,
  average_cadence int,
  average_power int,
  calories int,
  raw_data_json jsonb,
  source text not null default 'strava',
  -- Feedback (Phase 5)
  rpe int check (rpe between 1 and 10),
  feel_score int check (feel_score between 1 and 5),
  motivation_score int check (motivation_score between 1 and 5),
  perceived_recovery int check (perceived_recovery between 1 and 5),
  post_session_notes text,
  body_feeling_tags jsonb default '[]'::jsonb,
  context_tags jsonb default '[]'::jsonb,
  session_quality_tags jsonb default '[]'::jsonb,
  temperature_c numeric,
  weather_condition text,
  -- Phase 12
  time_in_zones_json jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider, provider_activity_id)
);

create index activities_user_start on activities (user_id, start_date desc);
create index activities_user_sport on activities (user_id, sport_type);

alter table public.activities enable row level security;

create policy "users_select_own_activities" on activities
  for select using (auth.uid() = user_id);
create policy "users_insert_own_activities" on activities
  for insert with check (auth.uid() = user_id);
create policy "users_update_own_activities" on activities
  for update using (auth.uid() = user_id);
create policy "users_delete_own_activities" on activities
  for delete using (auth.uid() = user_id);

create trigger activities_set_updated_at
  before update on activities
  for each row execute function public.set_updated_at();
```

---

## Bloc 5 — Table `strava_config`

> Phase 3 · Credentials Strava niveau application (Client ID, Secret, Webhook Token).
> Table à une seule ligne, accessible uniquement via `service_role`.

```sql
create table public.strava_config (
  id            int       primary key default 1 check (id = 1),
  client_id     text      not null default '',
  client_secret text      not null default '',
  webhook_verify_token text not null default '',
  updated_at    timestamptz default now() not null
);

-- Pas de RLS : seul service_role peut accéder à cette table.
-- Les utilisateurs authentifiés ne peuvent pas lire client_secret.

-- Initialiser la ligne unique
insert into public.strava_config (id) values (1);
```

---

## Bloc 6 — Table `daily_metrics`

> Phase 4 · Métriques journalières Terra/Garmin (HRV, sommeil, récupération).
> À exécuter quand vous configurez Terra.

```sql
create table public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  metric_date date not null,

  -- Agrégats d'activités (recalculés automatiquement)
  sessions_count int default 0,
  duration_sec int default 0,
  distance_m numeric default 0,
  elevation_gain_m numeric default 0,
  training_load numeric default 0,

  -- Cardiovasculaire (Terra / Garmin)
  resting_hr int,
  hrv_rmssd numeric,
  hrv_status text check (hrv_status in ('balanced', 'low', 'unbalanced', 'poor', 'no_status')),

  -- Sommeil (Terra / Garmin)
  sleep_score int check (sleep_score between 0 and 100),
  sleep_duration_min int,
  sleep_deep_min int,
  sleep_rem_min int,
  sleep_light_min int,
  sleep_awake_min int,

  -- Readiness (Terra / Garmin)
  body_battery_morning int check (body_battery_morning between 0 and 100),
  body_battery_evening int check (body_battery_evening between 0 and 100),
  training_readiness int check (training_readiness between 0 and 100),

  -- Bien-être (Terra / Garmin)
  stress_score_avg int check (stress_score_avg between 0 and 100),
  spo2_avg numeric,
  respiration_avg numeric,
  vo2max_estimated numeric,

  updated_at timestamptz default now() not null,

  unique (user_id, metric_date)
);

create index daily_metrics_user_date on public.daily_metrics (user_id, metric_date desc);

alter table public.daily_metrics enable row level security;

create policy "users_select_own_daily" on public.daily_metrics
  for select using (auth.uid() = user_id);

-- Le service_role (FastAPI) gère les écritures via les webhooks Terra
create policy "service_role_all_daily" on public.daily_metrics
  for all using (auth.role() = 'service_role');

create trigger daily_metrics_set_updated_at
  before update on public.daily_metrics
  for each row execute function public.set_updated_at();
```

---

## Ordre d'exécution recommandé

| # | Bloc | Quand l'exécuter |
|---|------|-----------------|
| 1 | Fonctions + `profiles` | Dès le début, avant tout le reste |
| 2 | `athlete_profiles` + `hr_zones` | Avant d'utiliser la page Profil |
| 3 | `provider_connections` | Avant de connecter Strava ou Terra |
| 4 | `activities` | Avant la première synchro Strava |
| 5 | `strava_config` | Avant de configurer Strava (page Paramètres) |
| 6 | `daily_metrics` | Quand vous configurerez Terra/Garmin |
