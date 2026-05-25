-- ============================================================================
-- Helper security definer functions to bypass RLS recursion
-- ============================================================================

create or replace function public.is_group_member(group_id uuid, user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_members.group_id = $1 and group_members.user_id = $2
  );
$$;

create or replace function public.is_group_coach(group_id uuid, user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_members.group_id = $1 and group_members.user_id = $2 and group_members.role in ('admin', 'coach')
  );
$$;

create or replace function public.shares_group(user_id_1 uuid, user_id_2 uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = $1 and gm2.user_id = $2
  );
$$;

create or replace function public.is_coach_of_athlete(coach_id uuid, athlete_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm_coach
    join public.group_members gm_athlete on gm_coach.group_id = gm_athlete.group_id
    where gm_coach.user_id = $1
      and gm_coach.role in ('admin', 'coach')
      and gm_athlete.user_id = $2
  );
$$;

-- ============================================================================
-- Table: groups
-- ============================================================================
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  target_event_name text not null,
  target_event_date date not null,
  target_distance_km numeric not null,
  invite_code text unique not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups enable row level security;

drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups
  for select using (auth.uid() is not null);

drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups
  for insert with check (auth.uid() = created_by);

drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups
  for update using (auth.uid() = created_by or public.is_group_coach(id, auth.uid()));

drop policy if exists "groups_delete" on public.groups;
create policy "groups_delete" on public.groups
  for delete using (auth.uid() = created_by);

-- ============================================================================
-- Table: group_members
-- ============================================================================
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'coach', 'athlete')),
  target_time_sec int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members
  for select using (auth.uid() is not null);

drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "group_members_update" on public.group_members;
create policy "group_members_update" on public.group_members
  for update using (auth.uid() = user_id or public.is_group_coach(group_id, auth.uid()));

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete using (auth.uid() = user_id or public.is_group_coach(group_id, auth.uid()));

-- ============================================================================
-- Table: group_planned_sessions
-- ============================================================================
create table if not exists public.group_planned_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  planned_date date not null,
  planned_time time,
  sport_type text not null,
  session_type text not null,
  planned_duration_min int,
  planned_distance_km numeric,
  description text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_planned_sessions enable row level security;

drop policy if exists "group_planned_select" on public.group_planned_sessions;
create policy "group_planned_select" on public.group_planned_sessions
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_planned_all_coach" on public.group_planned_sessions;
create policy "group_planned_all_coach" on public.group_planned_sessions
  for all using (public.is_group_coach(group_id, auth.uid())) with check (public.is_group_coach(group_id, auth.uid()));

-- ============================================================================
-- Table: group_training_blocks
-- ============================================================================
create table if not exists public.group_training_blocks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint group_training_blocks_dates check (start_date <= end_date)
);

alter table public.group_training_blocks enable row level security;

drop policy if exists "group_blocks_select" on public.group_training_blocks;
create policy "group_blocks_select" on public.group_training_blocks
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_blocks_all_coach" on public.group_training_blocks;
create policy "group_blocks_all_coach" on public.group_training_blocks
  for all using (public.is_group_coach(group_id, auth.uid())) with check (public.is_group_coach(group_id, auth.uid()));

-- ============================================================================
-- Alter existing tables to add references to group items
-- ============================================================================

alter table public.planned_sessions
  add column if not exists group_planned_session_id uuid references public.group_planned_sessions(id) on delete set null;

alter table public.training_blocks
  add column if not exists group_training_block_id uuid references public.group_training_blocks(id) on delete cascade;

-- ============================================================================
-- Updated RLS for existing tables
-- ============================================================================

-- profiles
drop policy if exists "profiles_select_group_members" on public.profiles;
create policy "profiles_select_group_members" on public.profiles
  for select using (public.shares_group(id, auth.uid()));

-- activities
drop policy if exists "activities_select_group_members" on public.activities;
create policy "activities_select_group_members" on public.activities
  for select using (public.shares_group(user_id, auth.uid()));

-- planned_sessions (coaches can read/write athlete sessions)
drop policy if exists "coach_select_planned" on public.planned_sessions;
create policy "coach_select_planned" on public.planned_sessions
  for select using (public.is_coach_of_athlete(auth.uid(), user_id));

drop policy if exists "coach_all_planned" on public.planned_sessions;
create policy "coach_all_planned" on public.planned_sessions
  for all using (public.is_coach_of_athlete(auth.uid(), user_id)) with check (public.is_coach_of_athlete(auth.uid(), user_id));

-- training_blocks (coaches can read/write athlete training blocks)
drop policy if exists "coach_select_training_blocks" on public.training_blocks;
create policy "coach_select_training_blocks" on public.training_blocks
  for select using (public.is_coach_of_athlete(auth.uid(), user_id));

drop policy if exists "coach_all_training_blocks" on public.training_blocks;
create policy "coach_all_training_blocks" on public.training_blocks
  for all using (public.is_coach_of_athlete(auth.uid(), user_id)) with check (public.is_coach_of_athlete(auth.uid(), user_id));

-- training_goals (coaches can read training goals)
drop policy if exists "coach_select_training_goals" on public.training_goals;
create policy "coach_select_training_goals" on public.training_goals
  for select using (public.is_coach_of_athlete(auth.uid(), user_id));

-- daily_metrics (coaches can read daily metrics)
drop policy if exists "coach_select_daily_metrics" on public.daily_metrics;
create policy "coach_select_daily_metrics" on public.daily_metrics
  for select using (public.is_coach_of_athlete(auth.uid(), user_id));

-- injuries (coaches can read injuries)
drop policy if exists "coach_select_injuries" on public.injuries;
create policy "coach_select_injuries" on public.injuries
  for select using (public.is_coach_of_athlete(auth.uid(), user_id));

-- ============================================================================
-- Propagation Triggers
-- ============================================================================

-- Function: Propagate group planned session to group members
create or replace function public.propagate_group_session()
returns trigger as $$
begin
  insert into public.planned_sessions (
    user_id,
    planned_date,
    planned_time,
    sport_type,
    session_type,
    planned_duration_min,
    planned_distance_km,
    description,
    group_planned_session_id,
    status
  )
  select
    gm.user_id,
    new.planned_date,
    new.planned_time,
    new.sport_type,
    new.session_type,
    new.planned_duration_min,
    new.planned_distance_km,
    new.description,
    new.id,
    'planned'
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.role != 'coach' -- do not add to coaches who don't want it, or add to everyone. Let's do athletes and admins.
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_propagate_group_session
  after insert on public.group_planned_sessions
  for each row execute function public.propagate_group_session();

-- Function: Sync group planned session updates to member sessions
create or replace function public.sync_group_session_updates()
returns trigger as $$
begin
  update public.planned_sessions
  set
    planned_date = new.planned_date,
    planned_time = new.planned_time,
    sport_type = new.sport_type,
    session_type = new.session_type,
    planned_duration_min = new.planned_duration_min,
    planned_distance_km = new.planned_distance_km,
    description = new.description,
    updated_at = now()
  where group_planned_session_id = new.id
    and status = 'planned'; -- only sync if the athlete hasn't marked it completed/skipped
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_sync_group_session_updates
  after update on public.group_planned_sessions
  for each row execute function public.sync_group_session_updates();

-- Function: Propagate group training block to group members
create or replace function public.propagate_group_training_block()
returns trigger as $$
begin
  insert into public.training_blocks (
    user_id,
    name,
    start_date,
    end_date,
    group_training_block_id
  )
  select
    gm.user_id,
    new.name,
    new.start_date,
    new.end_date,
    new.id
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.role != 'coach'
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_propagate_group_training_block
  after insert on public.group_training_blocks
  for each row execute function public.propagate_group_training_block();

-- Function: Sync group training block updates to member training blocks
create or replace function public.sync_group_training_block_updates()
returns trigger as $$
begin
  update public.training_blocks
  set
    name = new.name,
    start_date = new.start_date,
    end_date = new.end_date
  where group_training_block_id = new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_sync_group_training_block_updates
  after update on public.group_training_blocks
  for each row execute function public.sync_group_training_block_updates();
