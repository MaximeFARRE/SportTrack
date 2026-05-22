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
