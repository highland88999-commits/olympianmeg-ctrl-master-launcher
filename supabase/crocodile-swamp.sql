-- supabase/crocodile-swamp.sql
-- Crocodile Swamp global leaderboard.
--
-- The Florida survival-chase game records runs here: how long you
-- survived and how far you travelled before the crocodile ate you.
-- Leaderboards are the deliberate global exception to account-scoped
-- data (same as Neon Void and Starblood): everyone reads the same top-10.
-- Sanity is enforced twice: CHECK constraints here and validateScore()
-- in /api/crocodile-swamp/leaderboard.
--
-- DO NOT RUN STANDALONE — folds into the consolidated SQL per Merlin's
-- directive. The /api/crocodile-swamp/leaderboard route answers 503 with
-- offline:true until this table exists, so the game degrades to its
-- on-device board and never fakes global scores.

-- ---------------------------------------------------------------- table ---
create table if not exists public.crocodile_swamp_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  score       integer     not null check (score >= 0 and score <= 10000000),
  seconds     integer     not null default 0 check (seconds >= 0 and seconds <= 86400),
  distance_m  integer     not null default 0 check (distance_m >= 0 and distance_m <= 1000000),
  created_at  timestamptz not null default now()
);

create index if not exists crocodile_swamp_leaderboard_score_idx
  on public.crocodile_swamp_leaderboard (score desc, created_at asc);

alter table public.crocodile_swamp_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists crocodile_swamp_leaderboard_public_read on public.crocodile_swamp_leaderboard;
create policy crocodile_swamp_leaderboard_public_read
  on public.crocodile_swamp_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real run cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists crocodile_swamp_leaderboard_open_insert on public.crocodile_swamp_leaderboard;
create policy crocodile_swamp_leaderboard_open_insert
  on public.crocodile_swamp_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
