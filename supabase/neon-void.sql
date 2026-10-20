-- supabase/neon-void.sql
-- Neon Void global leaderboard.
--
-- The 3D maze-chase game records runs here. Leaderboards are the
-- deliberate global exception to account-scoped data (same as Starblood
-- and the MIDI library): every rider reads the same world board, and any
-- rider can post a sane score. Sanity is enforced twice: CHECK
-- constraints here and validateScore() in /api/neon-void/leaderboard.
--
-- DO NOT RUN STANDALONE — folds into the consolidated SQL per Merlin's
-- directive. The /api/neon-void/leaderboard route answers 503 with
-- offline:true until this table exists, so the game degrades to its
-- on-device board and never fakes global scores.

-- ---------------------------------------------------------------- table ---
create table if not exists public.neon_void_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  score       integer     not null check (score >= 0 and score <= 1000000),
  level       integer     not null default 1 check (level >= 1 and level <= 100),
  created_at  timestamptz not null default now()
);

create index if not exists neon_void_leaderboard_score_idx
  on public.neon_void_leaderboard (score desc, created_at asc);

alter table public.neon_void_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists neon_void_leaderboard_public_read on public.neon_void_leaderboard;
create policy neon_void_leaderboard_public_read
  on public.neon_void_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real run cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists neon_void_leaderboard_open_insert on public.neon_void_leaderboard;
create policy neon_void_leaderboard_open_insert
  on public.neon_void_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
