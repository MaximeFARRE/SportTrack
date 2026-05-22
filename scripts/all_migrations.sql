-- SportTrack — migrations complètes idempotentes (générées automatiquement)
-- À coller dans Supabase → SQL Editor — peut être relancé sans risque

-- ================================================================
-- supabase/migrations/20260520000000_initial_schema.sql
-- ================================================================
-- Initial schema: profiles table tied to auth.users, plus helper functions and RLS.

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================================
-- Auto-create a profile when a new auth.users row is inserted.
-- ============================================================================

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

-- ================================================================
-- supabase/migrations/20260521000000_athlete_profile.sql
-- ================================================================
-- Phase 1: athlete profile + HR zones

create table if not exists public.athlete_profiles (
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

drop policy if exists "users_select_own_athlete_profile" on public.athlete_profiles;
create policy "users_select_own_athlete_profile" on athlete_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_athlete_profile" on public.athlete_profiles;
create policy "users_insert_own_athlete_profile" on athlete_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "users_update_own_athlete_profile" on public.athlete_profiles;
create policy "users_update_own_athlete_profile" on athlete_profiles
  for update using (auth.uid() = user_id);

drop policy if exists "users_delete_own_athlete_profile" on public.athlete_profiles;
create policy "users_delete_own_athlete_profile" on athlete_profiles
  for delete using (auth.uid() = user_id);

drop trigger if exists athlete_profiles_set_updated_at on public.athlete_profiles;
create trigger athlete_profiles_set_updated_at
  before update on public.athlete_profiles
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------

create table if not exists public.hr_zones (
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

drop policy if exists "users_all_own_hr_zones" on public.hr_zones;
create policy "users_all_own_hr_zones" on hr_zones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists hr_zones_set_updated_at on public.hr_zones;
create trigger hr_zones_set_updated_at
  before update on public.hr_zones
  for each row execute function public.set_updated_at();

create index if not exists idx_athlete_profiles_user_id on public.athlete_profiles (user_id);
create index if not exists idx_hr_zones_user_id on public.hr_zones (user_id);

-- ================================================================
-- supabase/migrations/20260521100000_provider_connections.sql
-- ================================================================
-- provider_connections: stores OAuth tokens for each user per provider (Strava, Terra…)
create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('strava', 'terra')),
  provider_user_id text not null,
  access_token text,
  refresh_token text,
  token_expires_at bigint,          -- Unix timestamp returned by Strava/Terra
  scopes text[],
  is_active boolean default true not null,
  last_sync_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider)
);

alter table public.provider_connections enable row level security;

drop policy if exists "users_select_own_connections" on public.provider_connections;
create policy "users_select_own_connections" on provider_connections
  for select using (auth.uid() = user_id);

drop policy if exists "users_delete_own_connections" on public.provider_connections;
create policy "users_delete_own_connections" on provider_connections
  for delete using (auth.uid() = user_id);

-- Service role (FastAPI) handles all inserts/updates (tokens stay server-side)

drop trigger if exists provider_connections_set_updated_at on public.provider_connections;
create trigger provider_connections_set_updated_at
  before update on provider_connections
  for each row execute function public.set_updated_at();

-- ================================================================
-- supabase/migrations/20260521200000_activities.sql
-- ================================================================
-- activities: one row per activity per user, across all providers
create table if not exists public.activities (
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

create index if not exists activities_user_start on activities (user_id, start_date desc);
create index if not exists activities_user_sport on activities (user_id, sport_type);

alter table public.activities enable row level security;

drop policy if exists "users_select_own_activities" on public.activities;
create policy "users_select_own_activities" on activities
  for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_activities" on public.activities;
create policy "users_insert_own_activities" on activities
  for insert with check (auth.uid() = user_id);

drop policy if exists "users_update_own_activities" on public.activities;
create policy "users_update_own_activities" on activities
  for update using (auth.uid() = user_id);

drop policy if exists "users_delete_own_activities" on public.activities;
create policy "users_delete_own_activities" on activities
  for delete using (auth.uid() = user_id);

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
  before update on activities
  for each row execute function public.set_updated_at();

-- ================================================================
-- supabase/migrations/20260521300000_strava_config.sql
-- ================================================================
-- App-level Strava OAuth credentials.
-- Single-row table (id = 1 enforced by check constraint).
-- Accessed exclusively via service_role key — no RLS for regular users.

create table if not exists public.strava_config (
  id            int       primary key default 1 check (id = 1),
  client_id     text      not null default '',
  client_secret text      not null default '',
  webhook_verify_token text not null default '',
  updated_at    timestamptz default now() not null
);

-- No row-level security: only service_role may access this table.
-- Regular anon/authenticated users cannot read client_secret.

-- Seed the single config row so upserts always hit an existing row.
insert into public.strava_config (id) values (1) on conflict (id) do nothing;

-- ================================================================
-- supabase/migrations/20260521400000_daily_metrics.sql
-- ================================================================
-- Daily metrics per user per day.
-- Populated by Terra webhooks (Garmin/Polar/Fitbit) and activity aggregation.

create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  metric_date date not null,

  -- Activity aggregates (recomputed when activities change)
  sessions_count int default 0,
  duration_sec int default 0,
  distance_m numeric default 0,
  elevation_gain_m numeric default 0,
  training_load numeric default 0,

  -- Terra / Garmin — cardiovascular
  resting_hr int,
  hrv_rmssd numeric,
  hrv_status text check (hrv_status in ('balanced', 'low', 'unbalanced', 'poor', 'no_status')),

  -- Terra / Garmin — sleep
  sleep_score int check (sleep_score between 0 and 100),
  sleep_duration_min int,
  sleep_deep_min int,
  sleep_rem_min int,
  sleep_light_min int,
  sleep_awake_min int,

  -- Terra / Garmin — readiness
  body_battery_morning int check (body_battery_morning between 0 and 100),
  body_battery_evening int check (body_battery_evening between 0 and 100),
  training_readiness int check (training_readiness between 0 and 100),

  -- Terra / Garmin — wellness
  stress_score_avg int check (stress_score_avg between 0 and 100),
  spo2_avg numeric,
  respiration_avg numeric,
  vo2max_estimated numeric,

  updated_at timestamptz default now() not null,

  unique (user_id, metric_date)
);

create index if not exists daily_metrics_user_date on public.daily_metrics (user_id, metric_date desc);

alter table public.daily_metrics enable row level security;

drop policy if exists "users_select_own_daily" on public.daily_metrics;
create policy "users_select_own_daily" on public.daily_metrics
  for select using (auth.uid() = user_id);

drop policy if exists "service_role_all_daily" on public.daily_metrics;
create policy "service_role_all_daily" on public.daily_metrics
  for all using (auth.role() = 'service_role');

drop trigger if exists daily_metrics_set_updated_at on public.daily_metrics;
create trigger daily_metrics_set_updated_at
  before update on public.daily_metrics
  for each row execute function public.set_updated_at();

-- ================================================================
-- supabase/migrations/20260521500000_planned_sessions.sql
-- ================================================================
-- planned_sessions: one row per planned training session per user
create table if not exists public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  planned_date date not null,
  planned_time time,
  sport_type text not null,
  session_type text not null,
  planned_duration_min int,
  planned_distance_km numeric,
  planned_load int,
  description text,
  target_zones int[],
  status text default 'planned' check (status in ('planned', 'completed', 'skipped', 'modified')),
  actual_activity_id uuid references public.activities(id) on delete set null,
  completion_score numeric,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists planned_sessions_user_date on public.planned_sessions (user_id, planned_date);

alter table public.planned_sessions enable row level security;

drop policy if exists "users_all_own_planned" on public.planned_sessions;
create policy "users_all_own_planned" on public.planned_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-match an activity to a planned session of the same day/sport
create or replace function public.match_planned_to_actual()
returns trigger as $$
begin
  update public.planned_sessions
  set
    actual_activity_id = new.id,
    status = 'completed',
    completion_score = least(
      100,
      (new.duration_sec / 60.0) / nullif(planned_duration_min, 0) * 100
    ),
    updated_at = now()
  where user_id = new.user_id
    and planned_date = new.start_date::date
    and sport_type = new.sport_type
    and actual_activity_id is null
    and status = 'planned'
  limit 1;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists activities_match_planned on public.activities;
create trigger activities_match_planned
  after insert on public.activities
  for each row execute function public.match_planned_to_actual();

-- ================================================================
-- supabase/migrations/20260521600000_risk_assessments.sql
-- ================================================================
-- risk_assessments: one row per user per day, computed by the FastAPI scheduler
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  assessment_date date not null,
  score int not null check (score between 0 and 10),
  level text not null check (level in ('none', 'low', 'moderate', 'high', 'critical')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  unique (user_id, assessment_date)
);

alter table public.risk_assessments enable row level security;

drop policy if exists "users_select_own_risk" on public.risk_assessments;
create policy "users_select_own_risk" on public.risk_assessments
  for select using (auth.uid() = user_id);

drop policy if exists "service_role_all_risk" on public.risk_assessments;
create policy "service_role_all_risk" on public.risk_assessments
  for all using (auth.role() = 'service_role');

-- ================================================================
-- supabase/migrations/20260522000000_injuries.sql
-- ================================================================
-- injuries: user-managed injury log with RLS
create table if not exists public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  body_zone text not null,
  injury_type text check (injury_type in ('muscular', 'tendinous', 'bone', 'ligament', 'other')),
  severity int check (severity between 1 and 3),
  start_date date not null,
  end_date date,
  description text,
  treatment text,
  related_activity_id uuid references activities(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.injuries enable row level security;

drop policy if exists "users_all_own_injuries" on public.injuries;
create policy "users_all_own_injuries" on public.injuries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

