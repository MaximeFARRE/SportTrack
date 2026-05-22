-- Add is_admin flag to profiles.
-- Set manually in Supabase SQL Editor for your own account:
--   UPDATE public.profiles SET is_admin = true WHERE email = 'ton@email.com';

alter table public.profiles
  add column if not exists is_admin boolean not null default false;
