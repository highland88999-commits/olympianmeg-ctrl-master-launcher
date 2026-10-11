-- Hygieia sleep + water trackers.
-- Mirrors the existing user_steps pattern: one row per user per day, upserted.
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

create table if not exists public.user_sleep (
  user_id uuid not null references auth.users (id) on delete cascade,
  sleep_date date not null,
  bedtime time not null,
  wake_time time not null,
  hours numeric not null,
  quality smallint not null default 3 check (quality between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, sleep_date)
);

create table if not exists public.user_water (
  user_id uuid not null references auth.users (id) on delete cascade,
  water_date date not null,
  ml integer not null default 0 check (ml >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, water_date)
);

alter table public.user_sleep enable row level security;
alter table public.user_water enable row level security;

drop policy if exists user_sleep_own on public.user_sleep;
create policy user_sleep_own on public.user_sleep
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_water_own on public.user_water;
create policy user_water_own on public.user_water
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
