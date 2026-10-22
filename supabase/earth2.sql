-- supabase/earth2.sql
-- EARTH 2 — Phase 2 foundation (owner-locked test build, 2026-10-21).
-- Run in the Supabase SQL editor. Idempotent.
--
-- Two tables carry the whole test build:
--   earth2_parcels — who owns which parcel of the 1000-parcel grid
--     (the grid itself is deterministic code: lib/earth2/parcels.js;
--     only ownership is state, so only ownership is stored).
--   earth2_ledger — the Phase 2 activity record (buys, rent, forge
--     claims). Gold BALANCES never live here — they move through the
--     gold economy's gold_apply() (lib/economy/ledger.js); this table
--     is the Earth 2 diary that explains those movements.
--
-- Access model: RLS is enabled with NO policies. The anon and
-- authenticated roles can do nothing with these tables; every read
-- and write arrives through the /api/earth2/* routes with the
-- service-role key, and those routes admit the owner account alone.

create table if not exists public.earth2_parcels (
  parcel_id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  price_gold integer not null check (price_gold >= 0),
  acquired_at timestamptz not null default now()
);
create index if not exists earth2_parcels_owner_idx
  on public.earth2_parcels (owner_id, acquired_at desc);

create table if not exists public.earth2_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('buy', 'rent', 'forge')),
  parcel_id text,
  amount_gold integer not null,
  counterparty text,
  created_at timestamptz not null default now()
);
create index if not exists earth2_ledger_user_idx
  on public.earth2_ledger (user_id, created_at desc);
create index if not exists earth2_ledger_kind_idx
  on public.earth2_ledger (kind, created_at desc);

alter table public.earth2_parcels enable row level security;
alter table public.earth2_ledger enable row level security;

-- No policies on purpose: service-role only (see the header note).
