-- supabase/tidal-rush.sql
-- Tidal Rush global leaderboard.
--
-- The 3D jet ski racer records race times here. Leaderboards are the
-- deliberate global exception to account-scoped data (same as Starblood,
-- Neon Void and the MIDI library): every rider reads the same world
-- board, and any rider can post a sane time. Sanity is enforced twice:
-- CHECK constraints here and validateScore() in
-- /api/tidal-rush/leaderboard.
--
-- DO NOT RUN STANDALONE — folds into the consolidated SQL per Merlin's
-- directive. The /api/tidal-rush/leaderboard route answers 503 with
-- offline:true until this table exists, so the game degrades to its
-- on-device board and never fakes global times.

-- ---------------------------------------------------------------- table ---
create table if not exists public.tidal_rush_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  total_ms    integer     not null check (total_ms >= 45000 and total_ms <= 1800000),
  best_lap_ms integer     not null check (best_lap_ms >= 10000 and best_lap_ms <= 600000),
  racers      integer     not null default 6 check (racers in (4, 6, 8, 10)),
  created_at  timestamptz not null default now()
);

create index if not exists tidal_rush_leaderboard_time_idx
  on public.tidal_rush_leaderboard (total_ms asc, created_at asc);

alter table public.tidal_rush_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists tidal_rush_leaderboard_public_read on public.tidal_rush_leaderboard;
create policy tidal_rush_leaderboard_public_read
  on public.tidal_rush_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real race cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists tidal_rush_leaderboard_open_insert on public.tidal_rush_leaderboard;
create policy tidal_rush_leaderboard_open_insert
  on public.tidal_rush_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).
