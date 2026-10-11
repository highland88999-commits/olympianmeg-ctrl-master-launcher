-- Raptor Rush shared scoreboard.
-- The app writes through /api/raptor-rush/submit (service role, server-validated);
-- reads are public via /api/raptor-rush/leaderboard. Direct client inserts are
-- also allowed for the row owner, bounded by CHECK constraints.
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

create table if not exists public.raptor_rush_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  player_name text not null default 'PLAYER',
  score integer not null default 0 check (score >= 0 and score <= 50000),
  rabbits integer not null default 0 check (rabbits >= 0 and rabbits <= 1000),
  mode text not null default 'solo' check (mode in ('solo', 'party')),
  room_code text,
  created_at timestamptz not null default now()
);

create index if not exists raptor_rush_scores_solo_idx
  on public.raptor_rush_scores (score desc) where mode = 'solo';
create index if not exists raptor_rush_scores_room_idx
  on public.raptor_rush_scores (room_code, score desc) where mode = 'party';

alter table public.raptor_rush_scores enable row level security;

drop policy if exists raptor_rush_scores_read_all on public.raptor_rush_scores;
create policy raptor_rush_scores_read_all on public.raptor_rush_scores
  for select using (true);

drop policy if exists raptor_rush_scores_insert_own on public.raptor_rush_scores;
create policy raptor_rush_scores_insert_own on public.raptor_rush_scores
  for insert with check (auth.uid() = user_id);
