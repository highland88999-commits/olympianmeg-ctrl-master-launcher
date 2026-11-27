-- ============================================================
-- ARES — schema additions for the Phase 1 gold-label review
-- queue and audit trail (Merlin, 2026-11-15/25)
-- STAGED — NOT RUN. UNEXECUTED. Needs Merlin's green light
-- before executing. Run this in the Supabase SQL Editor
-- (dashboard), never from a script or migration runner.
--
-- Why this exists: the code already writes both tables and
-- degrades gracefully until they exist —
--
--   * app/api/ares/labels/route.js upserts human confirm/reject
--     decisions into ares_event_labels (onConflict event_id) and
--     selects event_id, decision, threat_class, reviewer,
--     created_at back. Until this runs, GET answers
--     { labels: [], provisioned: false } and POST answers 503.
--   * lib/ares/audit.js inserts every consequential console
--     action (kill-switch, settings changes, label decisions)
--     into ares_audit_log as { action, actor, details }. Until
--     this runs, every write degrades to a server-side warning
--     and { written: false } — the caller's request never fails.
--
-- What this file does NOT do: it does NOT widen the
-- ares_events.event_type CHECK — that widen (now 9 types
-- including 'watch_flagged') already lives in
-- supabase/ares-dolls.sql, and duplicating the ALTER here
-- would create a conflicting duplicate. Run ares-dolls.sql
-- for the CHECK; run this file for the two tables below.
--
-- Notes on the shape:
--   * ares_event_labels.event_id is the primary key (one label
--     per event — the route upserts onConflict event_id) and is
--     deliberately NOT a foreign key to ares_events(id):
--     purge_old_ares_events() deletes old evidence rows, and a
--     FK would block the purge. The label outlives the event.
--   * ares_audit_log has no CHECK on action: audit.js writes
--     AUDIT_ACTIONS plus an 'unknown' fallback, and a CHECK
--     must never reject a future action the code writes.
--   * Both tables are service-role only, matching the house
--     pattern in supabase/ares.sql (RLS on, no direct access):
--     the labels route and audit.js both use serviceClient().
-- ============================================================

-- 1. Human gold labels for the review queue (tier-2/3 training set).
create table if not exists public.ares_event_labels (
  event_id bigint primary key,               -- ares_events.id; one label per event
  decision text not null
    check (decision in ('confirm', 'reject')),
  threat_class text not null,                -- kept heuristic class, or 'benign' on reject
  reviewer text not null default 'owner',    -- the console is owner-locked
  created_at timestamptz not null default now()
);
create index if not exists ares_event_labels_created_idx
  on public.ares_event_labels (created_at desc);

alter table public.ares_event_labels enable row level security;

create policy "ares_event_labels: no direct access"
  on public.ares_event_labels for all
  using (false)
  with check (false);

-- 2. Immutable audit trail for consequential console actions.
create table if not exists public.ares_audit_log (
  id bigint generated always as identity primary key,
  action text not null,                      -- e.g. 'kill_switch_on', 'settings_change', 'label_confirm'
  actor text not null default 'owner',       -- literal 'owner'; no personal identifier in the trail
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ares_audit_log_created_idx
  on public.ares_audit_log (created_at desc);

alter table public.ares_audit_log enable row level security;

create policy "ares_audit_log: no direct access"
  on public.ares_audit_log for all
  using (false)
  with check (false);

-- Sanity checks after running (expect: two rows, no error):
--   select to_regclass('public.ares_event_labels'),
--          to_regclass('public.ares_audit_log');
