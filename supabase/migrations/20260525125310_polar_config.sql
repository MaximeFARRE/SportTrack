-- Support for Polar Flow connection.
-- Update check constraint on provider_connections to support 'polar'.
alter table public.provider_connections
  drop constraint if exists provider_connections_provider_check;

alter table public.provider_connections
  add constraint provider_connections_provider_check
  check (provider in ('strava', 'terra', 'garmin', 'polar'));

-- Single-row configuration table for Polar App credentials.
create table if not exists public.polar_config (
  id            int       primary key default 1 check (id = 1),
  client_id     text      not null default '',
  client_secret text      not null default '',
  updated_at    timestamptz default now() not null
);

-- Seed default empty row for Polar configuration.
insert into public.polar_config (id) values (1) on conflict (id) do nothing;
