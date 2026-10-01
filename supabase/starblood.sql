-- supabase/starblood.sql
-- Starblood global leaderboard (2026-10-01, Merlin's direction).
--
-- The 20-card memory-match game records wins here. Leaderboards are the
-- deliberate global exception to the account-scoped rule (same as the MIDI
-- library): every rider reads the same world board, and any rider can post
-- a sane score. Sanity is enforced twice: CHECK constraints here and
-- validateScore() in the /api/starblood/leaderboard route.
--
-- Fold into the consolidated SQL at the end (per the one-prompt law).
-- DO NOT RUN STANDALONE.

-- ---------------------------------------------------------------- table ---
create table if not exists public.starblood_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  flips       integer     not null check (flips >= 10 and flips < 1000),
  created_at  timestamptz not null default now()
);

create index if not exists starblood_leaderboard_flips_idx
  on public.starblood_leaderboard (flips asc, created_at asc);

alter table public.starblood_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists starblood_leaderboard_public_read on public.starblood_leaderboard;
create policy starblood_leaderboard_public_read
  on public.starblood_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a 20-card game cannot produce. Writes go through the API
-- route (service role), which validates again before inserting.
drop policy if exists starblood_leaderboard_open_insert on public.starblood_leaderboard;
create policy starblood_leaderboard_open_insert
  on public.starblood_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
