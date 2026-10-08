-- Generic user achievements (Hawkins: Hunt For Vecna ships the first; more to come)
-- e.g. 'olympian-scholar' for completing all 12 Olympian Education lessons.
-- Vecna Slayer milestones keep their own specialized table (global ordering +
-- unique collectible video); this table covers everything else.
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key text not null,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists user_achievements_user_idx on public.user_achievements (user_id);
create index if not exists user_achievements_key_idx on public.user_achievements (key);

alter table public.user_achievements enable row level security;

drop policy if exists user_achievements_read_own on public.user_achievements;
create policy user_achievements_read_own on public.user_achievements
  for select using (auth.uid() = user_id);

drop policy if exists user_achievements_read_all on public.user_achievements;
create policy user_achievements_read_all on public.user_achievements
  for select using (true);
