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
