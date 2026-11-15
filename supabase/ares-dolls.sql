-- ============================================================
-- ARES — Russian-doll prisoner sandboxes (Merlin, 2026-11-15)
-- STAGED — NOT RUN. Needs Merlin's green light before executing.
-- Run this in the Supabase SQL editor (pjslctbyigtapvblbjao).
--
-- Why this exists: the doll layers (lib/ares/dolls.js) record every
-- breakout transition where the current schema allows — and today
-- that is NOWHERE durable:
--
--   1. ares_events.event_type has a CHECK constraint allowing only
--      five values ('honeypot_hit','scanner_path','bot_blocked',
--      'rate_limited','blocked_ip_hit'). A doll_breakout row cannot
--      be inserted until the CHECK is widened. The same gap blocks
--      two rows the existing code already attempts: 'abyss_trapped'
--      (the known gap) and 'agent_self_terminate' (the self-terminate
--      report in lib/ares/server.js, which fails the CHECK today).
--
--   2. ares_trapped has no doll_layer column, so the prisoner's
--      current doll depth cannot be stored per prisoner.
--
-- Until this runs, the code attempts both writes on every transition
-- and degrades silently (the prisoner is still contained, the page
-- still serves), and the layer is derived per request from the
-- Referer header. Once this runs, ares_trapped.doll_layer is
-- authoritative and the ares_events rows become the evidence trail.
-- ============================================================

-- 1. Widen the evidence-log CHECK so doll (and abyss + self-terminate)
--    rows can be written.
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
    'agent_self_terminate'
  ));

-- 2. Store the prisoner's current doll depth (0 = the maze, 1–6 = the
--    dolls) on the trapped row.
alter table public.ares_trapped
  add column if not exists doll_layer integer not null default 0;

-- Sanity checks after running (expect: one row each, no error):
--   select count(*) from public.ares_events
--     where event_type = 'doll_breakout';
--   select ip_hash, doll_layer from public.ares_trapped limit 5;
