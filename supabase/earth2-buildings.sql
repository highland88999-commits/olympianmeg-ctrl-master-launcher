-- supabase/earth2-buildings.sql
-- EARTH 2 — BUILDING (Phase 1, 2026-10-22).
--
-- *** STAGED — NOT RUN. *** This file executes only on Merlin's
-- green light, like the rest of the Earth 2 bundle. Until it runs,
-- /api/earth2/builds answers setupRequired and the building layer
-- is exercised by the pure libs (lib/building/, lib/earth2/
-- building.js) and the tests alone.
--
-- Merlin's approved design: building is part of the land-title
-- bundle. Owners build on their parcels; ownable-but-unsold
-- parcels can be homestead-claimed for building (permit only —
-- no title, no rent, no spawn); a sale ends the claim, packs the
-- build up for its builder, and notifies them. Free Commons and
-- protected ground are never buildable (enforced in the rights
-- engine, lib/building/rights.js — this file only stores state).
--
-- Four tables:
--   earth2_builds               — one build per user per ground.
--     ground_type/ground_id keep the toolkit world-agnostic:
--     Earth 2 writes ('earth2-parcel', 'E2-0001'); user worlds
--     will write ('user-world', <world id>) when their scene
--     mounting lands.
--   earth2_homestead_claims     — the claim lifecycle (active →
--     released / evicted / purchased). A partial unique index
--     guarantees at most ONE active claim per parcel.
--   earth2_build_packups        — evicted builds, returned to
--     their builders as blueprints (pieces intact).
--   earth2_build_notifications  — the builder-facing record of an
--     eviction (and, later, other building events).
--
-- Access model: RLS is enabled with NO policies — service-role
-- only through the /api/earth2/* routes, exactly like earth2.sql.

create table if not exists public.earth2_builds (
  id uuid primary key default gen_random_uuid(),
  ground_type text not null check (ground_type in ('earth2-parcel', 'user-world')),
  ground_id text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null,
  pieces jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ground_type, ground_id, owner_id)
);
create index if not exists earth2_builds_ground_idx
  on public.earth2_builds (ground_type, ground_id);
create index if not exists earth2_builds_owner_idx
  on public.earth2_builds (owner_id, updated_at desc);

create table if not exists public.earth2_homestead_claims (
  id uuid primary key default gen_random_uuid(),
  parcel_id text not null,
  builder_id uuid not null references auth.users (id) on delete cascade,
  builder_email text not null,
  status text not null default 'active'
    check (status in ('active', 'released', 'evicted', 'purchased')),
  end_reason text,
  claimed_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists earth2_homestead_claims_parcel_idx
  on public.earth2_homestead_claims (parcel_id, status);
create index if not exists earth2_homestead_claims_builder_idx
  on public.earth2_homestead_claims (builder_id, claimed_at desc);
-- At most one ACTIVE claim per parcel, ever.
create unique index if not exists earth2_homestead_claims_one_active_idx
  on public.earth2_homestead_claims (parcel_id)
  where status = 'active';

create table if not exists public.earth2_build_packups (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references auth.users (id) on delete cascade,
  builder_email text not null,
  parcel_id text not null,
  pieces jsonb not null default '[]'::jsonb,
  piece_count integer not null default 0 check (piece_count >= 0),
  reason text not null default 'parcel-sold',
  created_at timestamptz not null default now()
);
create index if not exists earth2_build_packups_builder_idx
  on public.earth2_build_packups (builder_id, created_at desc);

create table if not exists public.earth2_build_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null,
  kind text not null check (kind in ('homestead-evicted')),
  parcel_id text,
  packup_id uuid references public.earth2_build_packups (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists earth2_build_notifications_user_idx
  on public.earth2_build_notifications (user_id, created_at desc);

alter table public.earth2_builds enable row level security;
alter table public.earth2_homestead_claims enable row level security;
alter table public.earth2_build_packups enable row level security;
alter table public.earth2_build_notifications enable row level security;

-- No policies on purpose: service-role only (see the header note).
