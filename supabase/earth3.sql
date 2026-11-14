-- supabase/earth3.sql
-- EARTH 3 — THE TILE-CLAIM REGISTRY (Merlin, 2026-11-14).
-- STAGED — DO NOT RUN without Merlin's green light.
-- Run in the Supabase SQL editor. Idempotent.
--
-- Two tables carry the whole registry, mirroring Earth 2
-- (supabase/earth2.sql):
--   earth3_tiles — who owns which tile of the ten-billion-tile
--     grid (the grid itself is deterministic code:
--     lib/earth3/terrain.js + lib/earth3/claims.js; only
--     ownership is state, so only ownership is stored).
--   earth3_ledger — the activity record (claims, releases).
--     Gold BALANCES never live here — Earth 3 claims are FREE
--     while the world is under construction
--     (lib/earth3/claims.js CLAIM_PRICE_GOLD = 0); if Merlin
--     ever sets a price, the charge moves through the gold
--     economy's gold_apply() the way Earth 2's buy route does,
--     and this table stays the diary that explains it.
--
-- Access model: RLS is enabled with NO policies. The anon and
-- authenticated roles can do nothing with these tables; every
-- read and write arrives through the /api/earth3/* routes with
-- the service-role key. Until this file runs, those routes
-- answer setupRequired and claims live on the device
-- (localStorage, lib/earth3/claims.js LOCAL_CLAIMS_KEY).

create table if not exists public.earth3_tiles (
  tile_id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  price_gold integer not null check (price_gold >= 0),
  acquired_at timestamptz not null default now()
);
create index if not exists earth3_tiles_owner_idx
  on public.earth3_tiles (owner_id, acquired_at desc);

create table if not exists public.earth3_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('claim', 'release')),
  tile_id text,
  amount_gold integer not null,
  counterparty text,
  created_at timestamptz not null default now()
);
create index if not exists earth3_ledger_user_idx
  on public.earth3_ledger (user_id, created_at desc);
create index if not exists earth3_ledger_kind_idx
  on public.earth3_ledger (kind, created_at desc);

alter table public.earth3_tiles enable row level security;
alter table public.earth3_ledger enable row level security;

-- No policies on purpose: service-role only (see the header note).
