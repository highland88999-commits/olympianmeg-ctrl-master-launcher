-- supabase/migrations/20261027_earth_rendered_tiles.sql
-- Earth 1 RENDERED-TILES record (Merlin, 2026-10-27: "Create a
-- supabase table that tracks what tiles have been rendered… make
-- sure ones that get mapped and sent to this supabase table know
-- to render upon load for that users").
--
-- HOW TO RUN (Merlin's step, dashboard only — code never runs this):
--   Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Until this runs, the record/fetch routes answer "not_ready" and
-- Earth behaves exactly as today (device-only rendered record,
-- no server restore) — nothing errors, nothing blanks.
--
-- WHY THIS TABLE EXISTS: the tracker registry
-- (earth_mapped_registry) stores only the 16,200-cell 2° coverage
-- bitset — it says WHERE the player has been, never WHICH
-- photographic sheets were built there. The device record
-- (localStorage olympus.earth.renderedTiles.v1, lib/earth/
-- lens-cache.js) remembers built sheets on ONE device only, capped
-- at 512 keys, and is never synced. A fresh load on a new device
-- (or cleared storage) therefore rebuilds all ground from scratch.
-- This table is the server half: one row per user per built sheet,
-- and Earth reloads the rows near the traveler as build jobs.
--
-- SHAPE (one row per user + tile cell):
--   user_id    uuid — the Supabase auth user id (part of PK).
--   tile_key   text — the sheet identity, EXACTLY the tile
--     builder's addressing: preset + zoom + slippy grid origin,
--     e.g. "streetCoarse:z6:-12:34" (lib/earth/lens-cache.js
--     tileCellKey). Same identity as the device record, so the
--     two records agree key-for-key.
--   preset     text — the lens preset (street, streetFar,
--     streetCoarse, streetCoarseWide). The orbital overlook sheet
--     is never recorded: it is not roaming ground.
--   center_lat / center_lon — the build job's centre, so a
--     reload rebuilds the sheet EXACTLY (no grid inversion).
--   rendered_at timestamptz — last record for this row (an
--     upsert refreshes it; re-recording never duplicates).
--
-- PRIVACY: a signed-in user touches ONLY their own rows (RLS
-- below + the server-side user filter in the routes). No
-- per-user breakdown is ever shown to anyone else; the fetch
-- route returns the calling user's rows only.

create table if not exists public.earth_rendered_tiles (
  user_id uuid not null,
  tile_key text not null,
  preset text not null,
  center_lat double precision not null,
  center_lon double precision not null,
  rendered_at timestamptz not null default now(),
  primary key (user_id, tile_key)
);

alter table public.earth_rendered_tiles enable row level security;

-- A signed-in user may read only their own rows.
drop policy if exists "earth_rendered_tiles own row read"
  on public.earth_rendered_tiles;
create policy "earth_rendered_tiles own row read"
  on public.earth_rendered_tiles
  for select
  using (auth.uid() = user_id);

-- A signed-in user may insert only their own rows.
drop policy if exists "earth_rendered_tiles own row insert"
  on public.earth_rendered_tiles;
create policy "earth_rendered_tiles own row insert"
  on public.earth_rendered_tiles
  for insert
  with check (auth.uid() = user_id);

-- A signed-in user may update only their own rows.
drop policy if exists "earth_rendered_tiles own row update"
  on public.earth_rendered_tiles;
create policy "earth_rendered_tiles own row update"
  on public.earth_rendered_tiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: rows are never deleted through the API.
-- (A user who wants their record removed can ask Merlin; the
-- dashboard can delete the row.)

grant select, insert, update on public.earth_rendered_tiles to authenticated;
