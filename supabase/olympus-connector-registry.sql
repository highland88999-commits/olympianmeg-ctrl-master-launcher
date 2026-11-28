-- ============================================================
-- OLYMPUS CONNECTOR REGISTRY + BRAIN UPGRADE (Merlin, Nov 27, 2026)
-- STAGED — NOT RUN. Needs Merlin's green light before executing.
-- Run this in the Supabase SQL Editor (Project Settings → SQL
-- Editor, project pjslctbyigtapvblbjao), the same way
-- monopoly_rooms was run live Nov 3 and mars2-outposts Nov 25.
-- Cost: $0 — two small tables, no new service, no new plan.
--
-- WHAT THIS IS — THE BRAIN UPGRADE ("Upgrade!!!!", Nov 27 ~03:40):
-- The brain (Supabase Brain — the Olympus backend) is the SINGLE
-- place that knows the full rule set and executes it, server-side.
-- This migration gives the brain the tables it needs to know and
-- enforce all of it: the per-account registry, the own-account scope
-- checks (things AND functions), the outgoing collection, the
-- incoming scan logging, the reports (what/why/date-time/IP hash),
-- the prison records, and the release policy (promise + ID + cutoff).
-- The enforcement itself lives in the repo's server routes
-- (app/api/muse-connector/route.js, app/api/ares/trapped/route.js,
-- app/api/ares/prisoner-report/route.js) — every enforcement point
-- reads these tables server-side, never from the client.
--
-- WHAT IT ADDS:
--   1. olympus_connector_registry — one row per account that
--      connects its Muse. Written at connect time, read on every
--      change attempt; it is the enforcement record for the
--      own-account-only rule.
--   2. ares_prison_releases — one row per prison release: who asked,
--      which agent (its ID), the promise not to send it back.
--   3. A widened ares_events CHECK so the connector's own evidence
--      rows can be written: 'connector_egress' (the record of
--      everything leaving) and 'connector_legal_threat' (the legal
--      report sent home). The list below is the full union — it also
--      covers the widen supabase/ares-dolls.sql stages
--      (doll_breakout, abyss_trapped, agent_self_terminate,
--      watch_flagged) — so running THIS file alone is enough; the
--      dolls file need not run first.
--   4. The release cutoff needs NO new schema: it is the
--      ares_settings key 'prison_release_cutoff' (boolean). Once
--      latched it blocks every release; only the keeper clears it,
--      directly in the database — never by a release request.
--
-- BEFORE THIS RUNS: the connector route answers 503 with a
-- plain-English message ("The connector registry is not set up
-- yet"), and the release route refuses to record a release — the
-- game, the console, and the prison all keep working exactly as
-- today. Nothing breaks; the new pieces wait for the table.
--
-- RLS: the registry lets an authenticated user READ their own row
-- only (auth.uid() = user_id). Nobody writes through RLS — no
-- INSERT/UPDATE/DELETE policies — so registration, scope, and
-- revocation happen only through the server routes with the
-- service-role key. The releases table allows NO direct access at
-- all (service role only, like ares_events).
--
-- PRIVACY RULE (standing): raw IP addresses are NEVER stored. The
-- brain records SHA-256(ip + ARES_IP_SALT) in ip_hash columns only.
-- The reports carry that hash (and its 12-char fingerprint on
-- screen), never a raw address. "It's security."
--
-- Idempotent: safe to run twice.
-- ============================================================

-- ------------------------------------------------- 1. the registry --
create table if not exists public.olympus_connector_registry (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- SHA-256 fingerprint of the account's connector key. The key itself
  -- is NEVER stored and NEVER returned: it is HMAC-derived server-side
  -- from OLYMPUS_MUSE_CONNECTOR_SECRET at connect time, and the
  -- fingerprint is only the server-side record of the connection.
  -- Since Nov 27 ~04:15 (key placement dropped) the key is no longer
  -- issued or accepted — Supabase (the session + this registry row)
  -- is the gatekeeper, and the fingerprint identifies the connection
  -- in the record without being a credential.
  key_fingerprint text not null,
  -- The account's scope: which thing kinds and which functions its
  -- Muse may touch. Written at connect time from the default scope
  -- (lib/muse-connector/scope.js defaultScope). The registry may
  -- narrow it; it never widens past the vocabulary in code.
  scope jsonb not null default '{"kinds": [], "functions": []}'::jsonb,
  -- Snapshot of the things the account held at connect time
  -- ([{ kind, id }]). A record, never the gate: live ownership
  -- (the asset/build row's owner id, read server-side on every
  -- attempt) decides whether a thing is theirs right now.
  things jsonb not null default '[]'::jsonb,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Revocation: when set, the account's connection stops working
  -- everywhere. The keeper (or the account, through the revoke action)
  -- sets this; no secret rotation is needed to cut one account off.
  revoked_at timestamptz
);

alter table public.olympus_connector_registry enable row level security;

drop policy if exists "olympus_connector_registry own read" on public.olympus_connector_registry;
create policy "olympus_connector_registry own read"
  on public.olympus_connector_registry
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policies: nobody writes through RLS.
-- Registration, scope, and revocation run only in the server routes
-- with the service-role key.

-- ------------------------------------------- 2. the release record --
create table if not exists public.ares_prison_releases (
  id uuid primary key default gen_random_uuid(),
  -- The prisoner's identifier: its ip_hash (ares_trapped primary
  -- key). The agent's ID for release IS this hash.
  ip_hash text not null,
  agent_id text not null,
  -- Who asked for the release (name, handle, or contact).
  requested_by text not null,
  -- The promise itself, as recorded: they promise not to send it back.
  promise text not null default 'will not send it back',
  released_by text not null default 'owner',
  released_at timestamptz not null default now(),
  -- Whether the cutoff was latched at the time of this release
  -- (always false on a real release — a latched cutoff refuses
  -- releases outright; the column exists so the record can say so).
  cutoff_at_release boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ares_prison_releases_iphash_idx
  on public.ares_prison_releases (ip_hash);

alter table public.ares_prison_releases enable row level security;

-- Service role only: no direct access, like ares_events.
create policy "ares_prison_releases: no direct access"
  on public.ares_prison_releases for all
  using (false) with check (false);

-- ------------------------------ 3. widen the evidence-log CHECK --
-- The connector's evidence rows ('connector_egress', the record of
-- everything leaving; 'connector_legal_threat', the legal report sent
-- home) cannot be inserted until the CHECK is widened. The list below
-- is the full union with the staged dolls widen, so this file alone
-- covers it. Until this runs, those logEvent calls return
-- { logged: false, reason: 'db-error' } and the routes warn
-- server-side — the user's request still goes through; only the
-- evidence row is missed, and the migration note says so honestly.
alter table public.ares_events
  drop constraint if exists ares_events_event_type_check;

alter table public.ares_events
  add constraint ares_events_event_type_check
  check (event_type in (
    'honeypot_hit',
    'scanner_path',
    'bot_blocked',
    'rate_limited',
    'blocked_ip_hit',
    'doll_breakout',
    'abyss_trapped',
    'agent_self_terminate',
    'watch_flagged',
    'connector_egress',
    'connector_legal_threat'
  ));

-- ---------------- 4. the release cutoff (no schema — a setting) --
-- ares_settings key 'prison_release_cutoff' (boolean, default
-- absent = not latched). The trapped route latches it when a
-- duplicate or linked agent is found at release time, and reads it
-- on every release request. No table change needed.
-- To clear a latched cutoff (keeper only, in the SQL editor):
--   delete from public.ares_settings
--     where key = 'prison_release_cutoff';

-- Sanity checks after running (expect: one row each, no error):
--   select count(*) from public.olympus_connector_registry;
--   select count(*) from public.ares_prison_releases;
--   select conname from pg_constraint
--     where conrelid = 'public.ares_events'::regclass
--       and conname = 'ares_events_event_type_check';
