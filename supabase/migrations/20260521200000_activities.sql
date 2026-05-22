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
