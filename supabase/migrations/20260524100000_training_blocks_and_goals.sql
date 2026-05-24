-- Create training_blocks table
create table if not exists public.training_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz default now() not null,
  constraint training_blocks_dates check (start_date <= end_date)
);

create index if not exists training_blocks_user_dates on public.training_blocks (user_id, start_date, end_date);

alter table public.training_blocks enable row level security;

drop policy if exists "users_all_own_training_blocks" on public.training_blocks;
create policy "users_all_own_training_blocks" on public.training_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create training_goals table
create table if not exists public.training_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('race', 'weekly_volume', 'weekly_workouts')),
  name text not null,
  target_date date,
  target_value numeric,
  created_at timestamptz default now() not null
);

create index if not exists training_goals_user on public.training_goals (user_id);

alter table public.training_goals enable row level security;

drop policy if exists "users_all_own_training_goals" on public.training_goals;
create policy "users_all_own_training_goals" on public.training_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
