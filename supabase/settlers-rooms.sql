-- supabase/settlers-rooms.sql — Settlers of Olympus online rooms.
--
-- STAGED, NOT RUN. Needs Merlin's green light before running in the
-- Supabase SQL Editor (house SQL gate), the same way monopoly_rooms
-- was run live Nov 3. The API routes answer 503 with a plain-English
-- message while this table is missing, so the game still loads.
--
-- One row per room. The game state lives in `state` as JSON (see
-- serializeState in lib/settlers-of-olympus/engine.js); players is a
-- JSON array of { name, token, seat, lastSeen }. Tokens are secrets —
-- only the service-role key (server routes) ever reads this table.
-- RLS is on with NO public policies: only the service role touches it.

create table if not exists public.settlers_rooms (
  code text primary key,
  host_token text not null,
  players jsonb not null default '[]'::jsonb,
  state jsonb,
  expansions jsonb not null default '{"seafarers":false,"citiesKnights":false,"fishermen":false,"caravans":false}'::jsonb,
  status text not null default 'lobby',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.settlers_rooms enable row level security;

-- No policies: service role bypasses RLS; no signed-in user reads
-- this table directly. Tokens and full game state stay server-side.
