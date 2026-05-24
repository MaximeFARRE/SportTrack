alter table public.provider_connections
  drop constraint if exists provider_connections_provider_check;

alter table public.provider_connections
  add constraint provider_connections_provider_check
  check (provider in ('strava', 'terra', 'garmin'));

create table if not exists public.garmin_credentials (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  password text not null,
  updated_at timestamptz default now() not null
);

alter table public.garmin_credentials enable row level security;

drop policy if exists "users_select_own_garmin_credentials" on public.garmin_credentials;
create policy "users_select_own_garmin_credentials" on public.garmin_credentials
  for select using (auth.uid() = user_id);

drop trigger if exists garmin_credentials_set_updated_at on public.garmin_credentials;
create trigger garmin_credentials_set_updated_at
  before update on public.garmin_credentials
  for each row execute function public.set_updated_at();
