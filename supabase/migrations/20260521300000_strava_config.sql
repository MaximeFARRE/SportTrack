-- App-level Strava OAuth credentials.
-- Single-row table (id = 1 enforced by check constraint).
-- Accessed exclusively via service_role key — no RLS for regular users.

create table public.strava_config (
  id            int       primary key default 1 check (id = 1),
  client_id     text      not null default '',
  client_secret text      not null default '',
  webhook_verify_token text not null default '',
  updated_at    timestamptz default now() not null
);

-- No row-level security: only service_role may access this table.
-- Regular anon/authenticated users cannot read client_secret.

-- Seed the single config row so upserts always hit an existing row.
insert into public.strava_config (id) values (1);
