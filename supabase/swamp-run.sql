-- supabase/swamp-run.sql
-- Swamp Run global leaderboard.
--
-- The 3D crocodile survival game records runs here. A run's score is
-- survival seconds x distance metres: outlast AND outrun. Leaderboards
-- are the deliberate global exception to account-scoped data (same as
-- Neon Void and Starblood): every paddler reads the same world board,
-- and any paddler can post a sane score. Sanity is enforced twice:
-- CHECK constraints here and validateScore() in /api/swamp-run/leaderboard
-- (which also requires score = seconds x distance exactly).
--
-- DO NOT RUN STANDALONE — folds into the consolidated SQL per Merlin's
-- directive. The /api/swamp-run/leaderboard route answers 503 with
-- offline:true until this table exists, so the game degrades to its
-- on-device board and never fakes global scores.

-- ---------------------------------------------------------------- table ---
create table if not exists public.swamp_run_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  score       integer     not null check (score >= 0 and score <= 50000000),
  seconds     integer     not null default 0 check (seconds >= 0 and seconds <= 86400),
  distance    integer     not null default 0 check (distance >= 0 and distance <= 1000000),
  created_at  timestamptz not null default now()
);

create index if not exists swamp_run_leaderboard_score_idx
  on public.swamp_run_leaderboard (score desc, created_at asc);

alter table public.swamp_run_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists swamp_run_leaderboard_public_read on public.swamp_run_leaderboard;
create policy swamp_run_leaderboard_public_read
  on public.swamp_run_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real run cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists swamp_run_leaderboard_open_insert on public.swamp_run_leaderboard;
create policy swamp_run_leaderboard_open_insert
  on public.swamp_run_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
