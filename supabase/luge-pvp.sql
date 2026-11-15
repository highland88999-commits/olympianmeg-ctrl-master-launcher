-- supabase/luge-pvp.sql
-- LUGE PvP (up to 100 racers) + global leaderboard.
--
-- ============================================================================
-- DRAFT — folds into the frozen consolidated SQL. DO NOT RUN YET.
-- ============================================================================
--
-- Design (Merlin 2026-09-30):
--   * PvP rooms ride the OASIS room-code system (oasis_rooms, game='luge'):
--     6-char codes, DB polling, zero Realtime. The room row carries lobby
--     state + the synced startsAt; per-rider live progress lives here in
--     luge_race_beacons (one cheap upsert per rider per second).
--   * Leaderboards are GLOBAL (Merlin's standing rule): luge_leaderboard
--     is public-read, exactly like the MIDI library's universal table.
--     Writes happen server-side only, through POST /api/luge/leaderboard,
--     which validates every submission against the physics anti-cheat
--     floor in lib/luge/logic.js. A fabricated time is rejected there.

-- ---------------------------------------------------------------------------
-- Allow 'luge' as an OASIS game slug (was: chess, basketball, colosseum,
-- battleship). The inline check in supabase/oasis.sql is named
-- oasis_rooms_game_check by Postgres.
-- ---------------------------------------------------------------------------
alter table public.oasis_rooms
  drop constraint if exists oasis_rooms_game_check;
alter table public.oasis_rooms
  add constraint oasis_rooms_game_check
  check (game in ('chess', 'basketball', 'colosseum', 'battleship', 'luge'));

-- ---------------------------------------------------------------------------
-- Live race beacons: one row per rider per room. Clients upsert their own
-- row ~1/sec (progress 0..1, finished flag, synced finish_ms) and poll the
-- board for ghost markers + the live standings. Spectators are seated in
-- the room but flagged here, so they never count as racers.
-- ---------------------------------------------------------------------------
create table if not exists public.luge_race_beacons (
  room_code text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  callsign text not null default 'Rider' check (char_length(callsign) between 1 and 24),
  sled_id text not null default 'g1',
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  finished boolean not null default false,
  finish_ms integer check (finish_ms is null or finish_ms > 0),
  spectating boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
create index if not exists luge_race_beacons_room_idx on public.luge_race_beacons (room_code);

alter table public.luge_race_beacons enable row level security;

-- The live board is public during a race (ghost markers + standings for
-- every racer). Codes are unguessable 6-char strings, same exposure model
-- as oasis_rooms.
drop policy if exists luge_race_beacons_public_read on public.luge_race_beacons;
create policy luge_race_beacons_public_read
  on public.luge_race_beacons for select
  using (true);

-- Riders write only their own beacon row (insert + update). Deletes are
-- rider-initiated leave cleanup, also own-row only.
drop policy if exists luge_race_beacons_owner_insert on public.luge_race_beacons;
create policy luge_race_beacons_owner_insert
  on public.luge_race_beacons for insert
  with check (auth.uid() = user_id);

drop policy if exists luge_race_beacons_owner_update on public.luge_race_beacons;
create policy luge_race_beacons_owner_update
  on public.luge_race_beacons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists luge_race_beacons_owner_delete on public.luge_race_beacons;
create policy luge_race_beacons_owner_delete
  on public.luge_race_beacons for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Global leaderboard: one row per validated finish. Public-read (global
-- leaderboards are the deliberate exception to account-scoped data).
-- No client writes — rows are inserted server-side by
-- POST /api/luge/leaderboard with the service-role key after the
-- anti-cheat validation in lib/luge/logic.js passes.
-- ---------------------------------------------------------------------------
create table if not exists public.luge_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player text not null check (char_length(player) between 1 and 24),
  course text not null,
  sled_id text not null,
  time_ms integer not null check (time_ms > 0),
  created_at timestamptz not null default now()
);
create index if not exists luge_leaderboard_course_time_idx
  on public.luge_leaderboard (course, time_ms asc);

-- Obstacle hits for the recorded finish (Nov 14, 2026): rides along on
-- the same single row, never a second row. Staged, NOT RUN.
alter table public.luge_leaderboard
  add column if not exists hits integer not null default 0 check (hits >= 0);

alter table public.luge_leaderboard enable row level security;

-- Global read: every rider sees the same board.
drop policy if exists luge_leaderboard_public_read on public.luge_leaderboard;
create policy luge_leaderboard_public_read
  on public.luge_leaderboard for select
  using (true);

-- No client insert/update/delete policies: the API writes with the
-- service-role key only. (An absent policy = denied, which is the intent.)
