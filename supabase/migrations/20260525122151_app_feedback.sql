-- app_feedback: user feedback submissions (bugs, features, other) with RLS
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  feedback_type text not null check (feedback_type in ('bug', 'feature', 'other')),
  message text not null,
  created_at timestamptz default now() not null
);

alter table public.app_feedback enable row level security;

drop policy if exists "users_insert_own_feedback" on public.app_feedback;
create policy "users_insert_own_feedback" on public.app_feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "users_select_own_feedback" on public.app_feedback;
create policy "users_select_own_feedback" on public.app_feedback
  for select using (auth.uid() = user_id);
