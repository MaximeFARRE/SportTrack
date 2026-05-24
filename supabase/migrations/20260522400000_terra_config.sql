-- App-level Terra API credentials.
-- Single-row table (id = 1 enforced by check constraint).
-- Accessed exclusively via service_role key.

create table if not exists public.terra_config (
  id             int       primary key default 1 check (id = 1),
  dev_id         text      not null default '',
  api_key        text      not null default '',
  webhook_secret text      not null default '',
  updated_at     timestamptz default now() not null
);

insert into public.terra_config (id) values (1) on conflict (id) do nothing;
