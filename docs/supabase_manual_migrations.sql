-- SportTrack manual Supabase migrations for MIGRATION_PLAN.md.
--
-- Keep this file updated at each migration sub-phase.
-- At the end of the FastAPI removal plan, copy this whole file into the
-- Supabase SQL editor and run it once against the target project.
--
-- Rules:
-- - Add only SQL that must be run manually in Supabase.
-- - Keep statements idempotent when possible.
-- - Group changes by migration plan sub-phase.
-- - Do not add secrets or environment variable values here.

begin;

-- Phase D.0 — Protect Strava app credentials.
-- strava_config stores client_secret and webhook_verify_token.
alter table public.strava_config enable row level security;

drop policy if exists "service_role_all_strava_config" on public.strava_config;
create policy "service_role_all_strava_config" on public.strava_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

commit;
