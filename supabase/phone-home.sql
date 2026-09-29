-- ============================================================================
-- PHONE HOME — advisory dismissals (travel/emergency advisory banner).
--
-- QUEUED FOR EXECUTION — the coordinator runs this (no dashboard access at
-- the authoring depth). Safe to fold into the final consolidated SQL: it
-- uses CREATE TABLE IF NOT EXISTS and drops policies before recreating.
--
-- Purpose: the /phone-home travel/emergency advisory banner is temporary
-- and dismissible. Dismissal is persisted PER USER here, keyed by
-- `advisory_key`. The key is the "temporary" mechanism:
--
--   * Retire or replace the advisory WITHOUT a code change: delete that
--     key's rows from advisory_dismissals (rows are inert markers carrying
--     no user content), or publish a new ADVISORY_KEY in lib/advisory.js
--     so the banner shows again for every user.
--
-- Client behavior (lib/advisory.js): cloud upsert first; if Supabase is
-- unreachable or this table doesn't exist yet, the client falls back to a
-- per-advisory localStorage flag (banner may reappear on another device
-- until the cloud record lands). Nothing in /phone-home depends on this
-- table existing — missing table = banner always shows, zero errors.
-- ============================================================================

create table if not exists public.advisory_dismissals (
  user_id uuid not null references auth.users (id) on delete cascade,
  advisory_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, advisory_key)
);

comment on table public.advisory_dismissals is
  'Per-user dismissal markers for temporary advisory banners. advisory_key is the advisory identity; deleting a key''s rows (or shipping a new key) retires/replaces the advisory without code changes.';

alter table public.advisory_dismissals enable row level security;

-- Strictly owner-only: a user reads/writes only their own dismissal rows.
drop policy if exists "advisory_dismissals owner read" on public.advisory_dismissals;
create policy "advisory_dismissals owner read"
  on public.advisory_dismissals
  for select
  using (auth.uid() = user_id);

drop policy if exists "advisory_dismissals owner insert" on public.advisory_dismissals;
create policy "advisory_dismissals owner insert"
  on public.advisory_dismissals
  for insert
  with check (auth.uid() = user_id);

-- Update policy exists so the client can upsert (re-dismiss = no-op) on the
-- (user_id, advisory_key) primary key.
drop policy if exists "advisory_dismissals owner update" on public.advisory_dismissals;
create policy "advisory_dismissals owner update"
  on public.advisory_dismissals
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
