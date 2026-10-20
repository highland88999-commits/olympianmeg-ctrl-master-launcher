-- supabase/tetrus.sql
-- Tetrus global leaderboard.
--
-- The 3D block-stacking game records runs here. Leaderboards are the
-- deliberate global exception to account-scoped data (same as Neon Void
-- and Starblood): every mason reads the same world board, and any mason
-- can post a sane score. Sanity is enforced twice: CHECK constraints
-- here and validateScore() in /api/tetrus/leaderboard.
--
-- DO NOT RUN STANDALONE — folds into the consolidated SQL per Merlin's
-- directive. The /api/tetrus/leaderboard route answers 503 with
-- offline:true until this table exists, so the game degrades to its
-- on-device board and never fakes global scores.

-- ---------------------------------------------------------------- table ---
create table if not exists public.tetrus_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  score       integer     not null check (score >= 0 and score <= 5000000),
  level       integer     not null default 1 check (level >= 1 and level <= 100),
  lines       integer     not null default 0 check (lines >= 0 and lines <= 100000),
  created_at  timestamptz not null default now()
);

create index if not exists tetrus_leaderboard_score_idx
  on public.tetrus_leaderboard (score desc, created_at asc);

alter table public.tetrus_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists tetrus_leaderboard_public_read on public.tetrus_leaderboard;
create policy tetrus_leaderboard_public_read
  on public.tetrus_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real run cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists tetrus_leaderboard_open_insert on public.tetrus_leaderboard;
create policy tetrus_leaderboard_open_insert
  on public.tetrus_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
