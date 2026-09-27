-- Streetball high scores (Olympian Meg master launcher)
-- One table per program; all programs share the same Supabase project.
-- Run this in the Supabase SQL editor (or via migration tooling).

create table if not exists public.basketball_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null
    check (char_length(player_name) between 1 and 24),
  score integer not null
    check (score >= 0 and score <= 500),
  mode text not null
    check (mode in ('shootout', 'freeplay')),
  created_at timestamptz not null default now()
);

alter table public.basketball_scores enable row level security;

-- Anyone (including logged-out players) can read the leaderboard.
drop policy if exists "basketball_scores public read" on public.basketball_scores;
create policy "basketball_scores public read"
  on public.basketball_scores
  for select
  using (true);

-- Anyone can submit a score; abuse is bounded by the column CHECK
-- constraints above (name length, score range, fixed mode list).
-- No updates or deletes from the client.
drop policy if exists "basketball_scores public insert" on public.basketball_scores;
create policy "basketball_scores public insert"
  on public.basketball_scores
  for insert
  with check (true);

create index if not exists basketball_scores_score_idx
  on public.basketball_scores (score desc);

-- OASIS room parties (2026-09-27): scores can be tagged with a 6-character
-- room code so everyone in a party shares one leaderboard.
alter table public.basketball_scores
  add column if not exists room_code text
    check (room_code is null or room_code ~ '^[A-Z0-9]{6}$');

create index if not exists basketball_scores_room_code_idx
  on public.basketball_scores (room_code, score desc);
