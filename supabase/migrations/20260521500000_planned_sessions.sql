-- planned_sessions: one row per planned training session per user
create table public.planned_sessions (
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

create index planned_sessions_user_date on public.planned_sessions (user_id, planned_date);

alter table public.planned_sessions enable row level security;

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
  -- Match the closest planned session if multiple exist
  limit 1;
  return new;
end;
$$ language plpgsql security definer;

create trigger activities_match_planned
  after insert on public.activities
  for each row execute function public.match_planned_to_actual();
