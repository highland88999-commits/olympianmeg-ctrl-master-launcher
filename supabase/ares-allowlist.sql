-- supabase/ares-allowlist.sql
--
-- ARES ALLOWLIST: REGISTERED USERS, USER BANS, BOT TRAP, ATTACK SOURCES
-- ============================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first, he reviews, then it runs and reports back.
--
-- What this adds (existing ares_whitelist / ares_blocks / ares_events
-- from supabase/ares.sql are untouched):
--
--   ares_user_bans      one row per banned ACCOUNT (not IP): the keeper
--                       bans a user from the allowlist with one click;
--                       lifting deletes the row. Banned accounts are
--                       refused by every API route (getUserFromRequest).
--                       The keeper's own account can never be banned
--                       (the route refuses it).
--   ares_trapped        one row per source the defence agents trapped
--                       in the abyss sandbox. A trapped source stays in
--                       the sandbox on every later request until the
--                       keeper releases it from the console.
--   ares_attack_sources one row per hostile source: hashed IP, what it
--                       tried, its worst score, and its trap status.
--                       This is the attack-source report the keeper
--                       sees in the console. Only hashes are stored —
--                       never a raw IP — matching the existing ARES
--                       source guardrail.
--
-- What "automatically granted" means (no SQL needed for it): a user
-- who registers or signs in IS on the allowlist by definition — the
-- console's registered-users list is built from auth.users, so every
-- account shows as Allowed unless a ban row says otherwise. No grant
-- step, no grant table, nothing to forget.
--
-- RLS is enabled on all three tables with NO permissive policies: only
-- the service role (the server routes) reads and writes them. Nothing
-- here is public, and no client policy is needed.
--
-- Idempotent: safe to run twice.

-- ============================================================ user bans
create table if not exists public.ares_user_bans (
  user_id uuid primary key,
  email text,
  reason text not null default 'Manual ban by the keeper',
  banned_by text,
  created_at timestamptz not null default now()
);

alter table public.ares_user_bans enable row level security;

-- ============================================================ trapped sources (abyss)
create table if not exists public.ares_trapped (
  ip_hash text primary key,
  reason text not null default 'Extra-malicious attack',
  score integer not null default 0,
  hits integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.ares_trapped enable row level security;

-- ============================================================ attack sources (the report)
create table if not exists public.ares_attack_sources (
  ip_hash text primary key,
  user_agent text,
  last_path text,
  path_count integer not null default 1,
  max_score integer not null default 0,
  reasons text[] not null default '{}',
  trap_status text not null default 'none',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists ares_attack_sources_last_seen_idx
  on public.ares_attack_sources (last_seen desc);

alter table public.ares_attack_sources enable row level security;
