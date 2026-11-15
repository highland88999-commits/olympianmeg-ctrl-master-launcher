-- ============================================================================
-- MEDUSA'S LAIR — STAGED, DO NOT RUN YET.
--
-- Merlin, 2026-11-15: one head per user (medusa_heads), permanent
-- statues for everyone (medusa_statues). Running this file needs
-- Merlin's explicit green light (the Supabase SQL gate).
--
-- The head is REUSABLE: one per user, use it as often as you like
-- (Nov 15 ~02:08). Upgrades are FLAT 20 orc shards each (Nov 15
-- ~02:11): +1 victim per use, up to 5 victims max (4 upgrades,
-- 80 shards total) — upgrade_level 0..4, enforced by CHECK.
--
-- Orc shards themselves live in the backpack record (a stacking
-- material, 'orc-shard', dropped by Middle-earth orc kills) —
-- there is no shard table; the server only stores the level.
--
-- Statues are public monuments: everyone reads them. Only the
-- service role (the API routes) writes — there is deliberately
-- NO insert/update/delete policy for anon/authenticated, so a
-- client can never mint its own head or statue. Deletes are
-- keeper-only through the service role (dashboard / SQL).
--
-- NOTE: the foe system also needs supabase/presence.sql (the
-- shared presence table, sector 'hades') — likewise staged,
-- likewise awaiting his green light.
-- ============================================================================

create table if not exists public.medusa_heads (
  user_id uuid primary key,
  earned_at timestamptz not null default now(),
  uses integer not null default 0,
  upgrade_level integer not null default 0
    check (upgrade_level >= 0 and upgrade_level <= 4)
);

create table if not exists public.medusa_statues (
  id uuid primary key default gen_random_uuid(),
  victim_user_id uuid not null,
  victim_name text not null,
  victim_appearance jsonb not null default '{}'::jsonb,
  petrifier_user_id uuid,
  petrifier_name text not null default 'Traveller',
  realm text not null default 'hades',
  x double precision not null,
  y double precision not null default 0,
  z double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists medusa_statues_realm_created_idx
  on public.medusa_statues (realm, created_at desc);

alter table public.medusa_heads enable row level security;
alter table public.medusa_statues enable row level security;

-- Heads: a user reads only their own row.
drop policy if exists "medusa_heads owner read" on public.medusa_heads;
create policy "medusa_heads owner read"
  on public.medusa_heads
  for select
  using (auth.uid() = user_id);

-- Statues: public monuments — everyone reads them.
drop policy if exists "medusa_statues public read" on public.medusa_statues;
create policy "medusa_statues public read"
  on public.medusa_statues
  for select
  using (true);

-- No insert / update / delete policies for anon or authenticated on
-- either table: only the service role (the /api/medusa/* routes)
-- writes. A client can never mint its own head, level, or statue.
-- Keeper deletes go through the service role (dashboard / SQL).
