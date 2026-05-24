alter table public.garmin_credentials
  add column if not exists token_data jsonb;
