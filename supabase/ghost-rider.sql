-- ============================================================================
-- GHOST RIDER — STAGED, DO NOT RUN YET.
--
-- Merlin, 2026-11-15: win the Rider's battle, earn the flaming chain;
-- use the chain and the target burns to ash and respawns in the Lake
-- of Fire (Hell). Running this file needs Merlin's explicit green
-- light (the Supabase SQL gate).
--
-- ONE table: ghost_rider_incinerations. Every chain use that lands
-- leaves a record — the victim's client polls it and, on a fresh
-- record naming them, travels to /hell and lands at the lake's rim
-- (the lake-landing flag, lib/ghost-rider/chain.js). NPC
-- incinerations are recorded too (victim_kind 'npc'), so the lake's
-- roamers are a shared fact.
--
-- PLUS: ghost_rider_chains — one row per user who earned the chain.
-- Upgrades are FLAT 20 orc shards each (Merlin, Nov 15 ~02:52, the
-- SAME cost as Medusa's head): +1 chain per throw, up to 5 chains
-- max (4 upgrades, 80 shards total) — upgrade_level 0..4, enforced
-- by CHECK, like medusa_heads. Orc shards themselves live in the
-- backpack record (a stacking material, 'orc-shard') — there is no
-- shard table; the server only stores the level.
--
-- HONEST LIMIT, flagged: the chain's 3-use + 1-hour cooldown lives
-- in the backpack record on the device (lib/ghost-rider/chain.js) —
-- the server does NOT enforce charges. The API verifies only that
-- the caller is signed in and is not burning themself. A server
-- chain table (one row per user, charges + cooldown) is the
-- follow-up if Merlin wants the cooldown enforced across devices.
--
-- Incinerations are public records: everyone reads them (a victim
-- must be able to see their own burning). Only the service role
-- (the API routes) writes — there is deliberately NO
-- insert/update/delete policy for anon/authenticated, so a client
-- can never mint its own incineration. Deletes are keeper-only
-- through the service role (dashboard / SQL).
-- ============================================================================

create table if not exists public.ghost_rider_chains (
  user_id uuid primary key,
  earned_at timestamptz not null default now(),
  upgrade_level integer not null default 0
    check (upgrade_level >= 0 and upgrade_level <= 4)
);

create table if not exists public.ghost_rider_incinerations (
  id uuid primary key default gen_random_uuid(),
  victim_user_id uuid,
  victim_name text not null default 'Traveller',
  victim_kind text not null default 'user'
    check (victim_kind in ('user', 'npc')),
  chainer_user_id uuid,
  chainer_name text not null default 'Traveller',
  realm text not null default 'hades',
  x double precision not null,
  y double precision not null default 0,
  z double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists ghost_rider_incinerations_realm_created_idx
  on public.ghost_rider_incinerations (realm, created_at desc);

create index if not exists ghost_rider_incinerations_victim_created_idx
  on public.ghost_rider_incinerations (victim_user_id, created_at desc);

alter table public.ghost_rider_chains enable row level security;
alter table public.ghost_rider_incinerations enable row level security;

-- Chains: a user reads only their own row.
drop policy if exists "ghost_rider_chains owner read" on public.ghost_rider_chains;
create policy "ghost_rider_chains owner read"
  on public.ghost_rider_chains
  for select
  using (auth.uid() = user_id);

-- Incinerations: public records — everyone reads them.
drop policy if exists "ghost_rider_incinerations public read" on public.ghost_rider_incinerations;
create policy "ghost_rider_incinerations public read"
  on public.ghost_rider_incinerations
  for select
  using (true);

-- No insert / update / delete policies for anon or authenticated on
-- either table: only the service role (the /api/ghost-rider/*
-- routes) writes. A client can never mint its own chain, level,
-- or incineration. Keeper deletes go through the service role
-- (dashboard / SQL).
