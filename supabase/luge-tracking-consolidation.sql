-- supabase/luge-tracking-consolidation.sql
-- LUGE race tracking: one consolidated, idempotent migration.
--
-- WHY THIS FILE EXISTS (Merlin, Nov 13, 2026 — "it wasn't tracking my races
-- in luge"): the luge tables were defined across two DRAFT files marked
-- DO NOT RUN YET (supabase/luge.sql, supabase/luge-pvp.sql), and there was
-- no single migration guaranteeing the schema the API routes expect. Live
-- checks on Nov 13 confirmed all six tables DO exist in production
-- (pjslctbyigtapvblbjao) with the expected columns — and Merlin's own runs
-- that night ARE in luge_leaderboard. What could NOT be verified from
-- outside the database is whether luge_course_completions carries the
-- (user_id, course_id) primary key that POST /api/luge/complete's upsert
-- (onConflict 'user_id,course_id') depends on. If that key is missing, every
-- completion upsert fails with 42P10 and no course is ever recorded, while
-- the leaderboard insert (plain insert, no conflict target) keeps working.
--
-- This file makes the contract true regardless of how the tables were first
-- created: every table, every column, the completions primary key, indexes,
-- and RLS policies — all guarded, all safe to run when everything already
-- exists (a re-run is a no-op). It does NOT backfill anything: only runs
-- finished after the routes went live are recorded, one legitimate run at a
-- time (Merlin's standing anti-backfill rule).
--
-- DO NOT RUN without Merlin's green light (standing Supabase gate).
-- Run in the Supabase SQL Editor, in one paste. Idempotent.

-- ============================================================================
-- 1. Tables (all six the luge routes touch)
-- ============================================================================

-- Which premium sleds each user owns (granted by the Stripe webhook).
create table if not exists public.luge_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  sled_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, sled_id)
);
create index if not exists luge_inventory_user_idx on public.luge_inventory (user_id);

-- Processed Stripe events, so webhook retries never double-grant.
create table if not exists public.luge_stripe_events (
  stripe_event_id text primary key,
  created_at timestamptz not null default now()
);

-- One hoodie redemption per user.
create table if not exists public.luge_redemptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

-- One row per course a rider legitimately finished. Written server-side
-- only, by POST /api/luge/complete, which validates the run against the
-- game's physics, requires the sled to be owned, and rejects anything a
-- client flag alone claims.
create table if not exists public.luge_course_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id int not null check (course_id between 1 and 20),
  completed_at timestamptz not null default now(),
  run_seconds numeric,
  primary key (user_id, course_id)
);
create index if not exists luge_course_completions_user_idx
  on public.luge_course_completions (user_id);

-- Obstacle hits for the recorded run (Nov 14, 2026): the hit count rides
-- along on the same single row — never a second row. The API routes retry
-- without the column until it lands, so recording never breaks either way.
alter table public.luge_course_completions
  add column if not exists hits integer not null default 0 check (hits >= 0);

-- Live race beacons: one row per rider per room (PvP ghost markers +
-- live standings). Clients upsert their own row ~1/sec.
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

-- Global leaderboard: one row per validated finish. Public-read (global
-- leaderboards are the deliberate exception to account-scoped data).
-- Written server-side only, by POST /api/luge/leaderboard.
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
-- the same single row, never a second row.
alter table public.luge_leaderboard
  add column if not exists hits integer not null default 0 check (hits >= 0);

-- ============================================================================
-- 2. The completions primary key — the link POST /api/luge/complete depends on
-- ============================================================================
-- If the table was first created without a primary key, the upsert's
-- onConflict 'user_id,course_id' has no constraint to target and fails
-- (42P10) on every finish. Add it when the table has no primary key at all.
-- If a DIFFERENT primary key already exists, this block deliberately does
-- nothing except say so — dropping a live key is a manual call, not a
-- migration side effect.
DO $$
DECLARE
  existing_pk text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_pk
  FROM pg_constraint
  WHERE conrelid = 'public.luge_course_completions'::regclass AND contype = 'p';
  IF existing_pk IS NULL THEN
    ALTER TABLE public.luge_course_completions
      ADD CONSTRAINT luge_course_completions_pkey PRIMARY KEY (user_id, course_id);
    RAISE NOTICE 'luge_course_completions: primary key (user_id, course_id) added.';
  ELSIF existing_pk NOT ILIKE '%user_id%course_id%' THEN
    RAISE NOTICE 'luge_course_completions: existing primary key is %, NOT (user_id, course_id) — the /api/luge/complete upsert still needs a manual look.', existing_pk;
  END IF;
END $$;

-- ============================================================================
-- 3. Redemption columns (from the luge.sql draft: which reward + $0 order)
-- ============================================================================
alter table public.luge_redemptions
  add column if not exists reward text not null default 'luge_free_hoodie',
  add column if not exists size text,
  add column if not exists store_order_id uuid;

-- ============================================================================
-- 4. OASIS room game slug: allow 'luge' (PvP rooms ride the OASIS system)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oasis_rooms'
  ) THEN
    ALTER TABLE public.oasis_rooms
      DROP CONSTRAINT IF EXISTS oasis_rooms_game_check;
    ALTER TABLE public.oasis_rooms
      ADD CONSTRAINT oasis_rooms_game_check
      CHECK (game IN ('chess', 'basketball', 'colosseum', 'battleship', 'luge'));
  END IF;
END $$;

-- ============================================================================
-- 5. Row level security + policies (no client writes anywhere — the API
--    writes with the service-role key only; riders read only their own rows,
--    except the global leaderboard and live beacons, which are public-read)
-- ============================================================================
alter table public.luge_inventory enable row level security;
alter table public.luge_stripe_events enable row level security;
alter table public.luge_redemptions enable row level security;
alter table public.luge_course_completions enable row level security;
alter table public.luge_race_beacons enable row level security;
alter table public.luge_leaderboard enable row level security;

drop policy if exists luge_inventory_owner_read on public.luge_inventory;
create policy luge_inventory_owner_read
  on public.luge_inventory for select
  using (auth.uid() = user_id);

drop policy if exists luge_redemptions_owner_read on public.luge_redemptions;
create policy luge_redemptions_owner_read
  on public.luge_redemptions for select
  using (auth.uid() = user_id);

-- luge_stripe_events: no client access at all (webhook-only table).

drop policy if exists luge_course_completions_owner_read on public.luge_course_completions;
create policy luge_course_completions_owner_read
  on public.luge_course_completions for select
  using (auth.uid() = user_id);

drop policy if exists luge_race_beacons_public_read on public.luge_race_beacons;
create policy luge_race_beacons_public_read
  on public.luge_race_beacons for select
  using (true);

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

drop policy if exists luge_leaderboard_public_read on public.luge_leaderboard;
create policy luge_leaderboard_public_read
  on public.luge_leaderboard for select
  using (true);

-- No client insert/update/delete policies on luge_leaderboard: the API
-- writes with the service-role key only. (An absent policy = denied.)
