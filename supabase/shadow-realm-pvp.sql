-- supabase/shadow-realm-pvp.sql
-- SHADOW REALM drop 2: PvP track matches + open-world presence.
--
-- ============================================================================
-- DRAFT — DO NOT RUN YET. Merlin green-lights SQL separately; folds into the
-- frozen consolidated SQL alongside luge-pvp.sql and the other OASIS games.
-- ============================================================================
--
-- Design (Merlin 2026-10-03):
--   * PvP rooms ride the OASIS room-code system (oasis_rooms,
--     game='shadow-realm'): 6-char codes, DB polling, zero Realtime. The
--     room row carries lobby state (full_state: trackKey, laps,
--     queueEndsAt, startsAt); per-rider live transforms live here in
--     shadow_realm_beacons (one cheap upsert per rider ~3Hz in races).
--   * Open-world presence rides a single persistent room
--     (game='shadow-realm-grid', fixed code 'SHDWRD'): riders beacon ~1Hz
--     and render each other's ghost bikes, nearest 12 for iPhone perf.
--   * Remote bikes are GHOSTS by design — no collision, cosmetic only.
--     PvP times are rider-reported, same as solo runs and luge.

-- ---------------------------------------------------------------------------
-- Allow 'shadow-realm' (PvP track matches) and 'shadow-realm-grid'
-- (persistent open-world presence) as OASIS game slugs. The inline check in
-- supabase/oasis.sql is named oasis_rooms_game_check by Postgres; the
-- current list (verified 2026-10-03) is
-- chess / basketball / colosseum / battleship / luge / order-67.
-- ---------------------------------------------------------------------------
alter table public.oasis_rooms
  drop constraint if exists oasis_rooms_game_check;
alter table public.oasis_rooms
  add constraint oasis_rooms_game_check
  check (game in ('chess', 'basketball', 'colosseum', 'battleship', 'luge',
                  'order-67', 'shadow-realm', 'shadow-realm-grid'));

-- ---------------------------------------------------------------------------
-- Live presence beacons: one row per rider per room. Clients upsert their
-- own row ~3Hz in PvP races (~1Hz while roaming) and poll the board for
-- ghost bikes + live standings. Tiny payload: x/z/heading/speed, boost
-- flag, 0..1 progress, finish flag + synced finish_ms. Stale rows (>10s)
-- mean the rider dropped — clients hide the ghost, no pop-up.
-- Callsigns only — never email, wallet, or any other identity.
-- ---------------------------------------------------------------------------
create table if not exists public.shadow_realm_beacons (
  room_code text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  callsign text not null default 'Rider' check (char_length(callsign) between 1 and 24),
  x numeric not null default 0,
  z numeric not null default 0,
  heading numeric not null default 0,
  speed numeric not null default 0,
  boosting boolean not null default false,
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  finished boolean not null default false,
  finish_ms integer check (finish_ms is null or finish_ms > 0),
  -- BUMP RACE battle state (Merlin 2026-10-03): 3 lives per rider, self-
  -- reported like finish times. lives 0 = eliminated (ghost hides).
  lives integer not null default 3 check (lives >= 0 and lives <= 3),
  updated_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
create index if not exists shadow_realm_beacons_room_idx on public.shadow_realm_beacons (room_code);

alter table public.shadow_realm_beacons enable row level security;

-- The live board is public during a race / roam session (ghost bikes +
-- standings for every rider). Codes are unguessable 6-char strings, same
-- exposure model as luge_race_beacons and oasis_rooms.
drop policy if exists shadow_realm_beacons_public_read on public.shadow_realm_beacons;
create policy shadow_realm_beacons_public_read
  on public.shadow_realm_beacons for select
  using (true);

-- Riders write only their own beacon row (insert + update). Deletes are
-- rider-initiated leave cleanup, also own-row only.
drop policy if exists shadow_realm_beacons_owner_insert on public.shadow_realm_beacons;
create policy shadow_realm_beacons_owner_insert
  on public.shadow_realm_beacons for insert
  with check (auth.uid() = user_id);

drop policy if exists shadow_realm_beacons_owner_update on public.shadow_realm_beacons;
create policy shadow_realm_beacons_owner_update
  on public.shadow_realm_beacons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists shadow_realm_beacons_owner_delete on public.shadow_realm_beacons;
create policy shadow_realm_beacons_owner_delete
  on public.shadow_realm_beacons for delete
  using (auth.uid() = user_id);
