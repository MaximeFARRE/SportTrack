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
