-- supabase/artemis.sql
-- ARTEMIS pocket universe — Supabase schema.
--
-- Migrates the ARTEMIS program's data off every legacy backend and onto the
-- launcher's Supabase project (org Olympus), with ZERO reliance on
-- render.com / OMEGA_DATABASE_URL / the old Firebase project:
--   artemis_history     <- Firestore users/{uid}/history   (Architect-Artemis oracle chat log)
--   artemis_deployments <- Firestore "deployments"         (Architect-Artemis sandbox deploys)
--   apex_sessions       <- artemis-hub's Supabase           (APEX HERITAGE OS window state)
--   apex_bookmarks      <- artemis-hub's Supabase           (APEX HERITAGE OS bookmarks)
--   artemis_mail_log    <- engine/core/stewardship/mailer.js (Resend report log, new)
--
-- The background harvester engine's tables (internet_map, harvests,
-- inventions, conflicts, good_news, logs — schema.sql in the old repo) are
-- NOT ported: they belong to a crawler daemon, not the pocket universe.
-- The OMEGA MIND phone-home tables (central_telemetry, connected_repos)
-- are deliberately never created here.
--
-- Idempotent: safe to run more than once. Do NOT run until Merlin gives the
-- green light; this file folds into the consolidated SQL at the end.

-- ---------------------------------------------------------------------------
-- 1. Oracle chat history (per-user, account-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.artemis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  persona text not null default 'ORACLE',
  prompt text not null,
  reply text not null default '',
  functions_called text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists artemis_history_user_idx on public.artemis_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Sandbox deployments (per-user, account-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.artemis_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  url text,
  created_at timestamptz not null default now()
);
create index if not exists artemis_deployments_user_idx on public.artemis_deployments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. APEX HERITAGE OS — window session state (per-user, account-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.apex_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- 4. APEX HERITAGE OS — bookmarks (per-user, account-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.apex_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_name text not null,
  app_url text not null,
  icon text,
  created_at timestamptz not null default now()
);
create index if not exists apex_bookmarks_user_idx on public.apex_bookmarks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Mail log — Resend report sends (per-user, account-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.artemis_mail_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  to_email text not null,
  subject text not null,
  resend_id text,
  created_at timestamptz not null default now()
);
create index if not exists artemis_mail_log_user_idx on public.artemis_mail_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is owner-only. (Leaderboards are the only
-- global exception in this launcher; ARTEMIS data is account-scoped.)
-- ---------------------------------------------------------------------------
alter table public.artemis_history enable row level security;
alter table public.artemis_deployments enable row level security;
alter table public.apex_sessions enable row level security;
alter table public.apex_bookmarks enable row level security;
alter table public.artemis_mail_log enable row level security;

drop policy if exists artemis_history_owner on public.artemis_history;
create policy artemis_history_owner on public.artemis_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists artemis_deployments_owner on public.artemis_deployments;
create policy artemis_deployments_owner on public.artemis_deployments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists apex_sessions_owner on public.apex_sessions;
create policy apex_sessions_owner on public.apex_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists apex_bookmarks_owner on public.apex_bookmarks;
create policy apex_bookmarks_owner on public.apex_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists artemis_mail_log_owner on public.artemis_mail_log;
create policy artemis_mail_log_owner on public.artemis_mail_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
