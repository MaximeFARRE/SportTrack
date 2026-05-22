-- injuries: user-managed injury log with RLS
create table if not exists public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  body_zone text not null,
  injury_type text check (injury_type in ('muscular', 'tendinous', 'bone', 'ligament', 'other')),
  severity int check (severity between 1 and 3),
  start_date date not null,
  end_date date,
  description text,
  treatment text,
  related_activity_id uuid references activities(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.injuries enable row level security;

drop policy if exists "users_all_own_injuries" on public.injuries;
create policy "users_all_own_injuries" on public.injuries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
