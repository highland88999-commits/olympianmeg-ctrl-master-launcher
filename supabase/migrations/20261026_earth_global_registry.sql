-- supabase/migrations/20261026_earth_global_registry.sql
-- Earth 1 GLOBAL team registry (Merlin, 2026-10-26: "build the
-- global team registry" — every user's swept cells union into ONE
-- Earth total toward Oblivion).
--
-- HOW TO RUN (Merlin's step, dashboard only — code never runs this):
--   Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Until this runs, the aggregate route answers "not ready" and the
-- Earth tracker keeps showing the personal number; nothing errors.
--
-- SHAPE (one row per user, same grid + encoding as the personal
-- record in lib/earth/mapping-progress.js):
--   user_id    uuid PK — the Supabase auth user id.
--   mapped_hex text — the v1 bitset: 16,200 cells (2° x 2°) as a
--     4,050-character lowercase hex string. The CHECK enforces the
--     exact encoding; anything else is rejected, never stored.
--   updated_at timestamptz — last sync for this row.
-- The global total is the OR-union of all rows (computed by the
-- aggregate route, never stored), so re-syncs and overlaps never
-- double-count and a row never shrinks on a subset re-sync.
--
-- PRIVACY: the UI shows ONLY the team total percentage. No
-- per-user breakdown, no names. The app reads rows only through
-- the service-role aggregate route, which returns covered cells
-- + percentage and never exposes a row. The RLS policies below
-- additionally let a signed-in user touch ONLY their own row,
-- so a direct client write can never read or overwrite anyone
-- else's record.

create table if not exists public.earth_mapped_registry (
  user_id uuid primary key,
  mapped_hex text not null check (mapped_hex ~ '^[0-9a-f]{4050}$'),
  updated_at timestamptz not null default now()
);

alter table public.earth_mapped_registry enable row level security;

-- A signed-in user may read only their own row.
drop policy if exists "earth_mapped_registry own row read"
  on public.earth_mapped_registry;
create policy "earth_mapped_registry own row read"
  on public.earth_mapped_registry
  for select
  using (auth.uid() = user_id);

-- A signed-in user may insert only their own row.
drop policy if exists "earth_mapped_registry own row insert"
  on public.earth_mapped_registry;
create policy "earth_mapped_registry own row insert"
  on public.earth_mapped_registry
  for insert
  with check (auth.uid() = user_id);

-- A signed-in user may update only their own row.
drop policy if exists "earth_mapped_registry own row update"
  on public.earth_mapped_registry;
create policy "earth_mapped_registry own row update"
  on public.earth_mapped_registry
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: rows are never deleted through the API.
-- (A user who wants their record removed can ask Merlin; the
-- dashboard can delete the row.)

grant select, insert, update on public.earth_mapped_registry to authenticated;
