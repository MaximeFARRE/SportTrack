-- risk_assessments: one row per user per day, computed by the FastAPI scheduler
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  assessment_date date not null,
  score int not null check (score between 0 and 10),
  level text not null check (level in ('none', 'low', 'moderate', 'high', 'critical')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz default now() not null,
  unique (user_id, assessment_date)
);

alter table public.risk_assessments enable row level security;

drop policy if exists "users_select_own_risk" on public.risk_assessments;
create policy "users_select_own_risk" on public.risk_assessments
  for select using (auth.uid() = user_id);

drop policy if exists "service_role_all_risk" on public.risk_assessments;
create policy "service_role_all_risk" on public.risk_assessments
  for all using (auth.role() = 'service_role');
