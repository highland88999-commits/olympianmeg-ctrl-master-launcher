-- ============================================================================
-- JUPITER 2 OBLIVION — STAGED, DO NOT RUN YET.
--
-- Merlin, 2026-11-19 (OVERWRITES all previous oblivion rules where they
-- conflict): pulling the J2 lever blows up Earth 1; everyone on Earth
-- is pulled to the hub to witness it; a 72-hour timer appears where
-- Earth was; when it runs out, Earth respawns EXACTLY as it was, all
-- saved game data preserved. Earth 2 stays live throughout. The lever
-- re-locks until Earth returns. Running this file needs Merlin's
-- explicit green light (the Supabase SQL gate).
--
-- TWO tables:
--   earth_oblivion_events — one row per lever pull. armed_at_ms is
--     the confirm instant, ends_at_ms is armed_at + 72 h. While
--     now < ends_at the event is ACTIVE (Earth gone, timer running,
--     travel refused, lever locked). At now >= ends_at the event is
--     COMPLETE and Earth is back — nothing about Earth 1's world or
--     any user's saved data ever changed, so there is nothing to
--     restore; the row is only a clock. A second arm while one is
--     active is refused by the API (409) — the timer never resets.
--   j2_dragon_shield_kills — one row per user per guard dragon
--     killed (stormwing / aureline). The tier is the distinct-dragon
--     count (0..2); each dragon grants once per user (unique
--     user_id + dragon). On Earth 2 the tier is charges: one
--     predator catch blocked per tier, refilled on arrival + respawn.
--
-- Reads: the oblivion event is PUBLIC (anyone may see whether Earth
-- is gone and when it returns — the same rule as the Earth 2 release
-- route). Shield kills are owner-read only. Writes: only the service
-- role (the /api/oblivion/* routes). A client can never mint its own
-- event or kill. Keeper deletes go through the service role
-- (dashboard / SQL).
-- ============================================================================

create table if not exists public.earth_oblivion_events (
  id uuid primary key default gen_random_uuid(),
  armed_at_ms bigint not null,
  ends_at_ms bigint not null,
  armed_by uuid,
  source text not null default 'jupiter-2',
  created_at timestamptz not null default now()
);

create index if not exists earth_oblivion_events_armed_idx
  on public.earth_oblivion_events (armed_at_ms desc);

create table if not exists public.j2_dragon_shield_kills (
  user_id uuid not null,
  dragon text not null check (dragon in ('stormwing', 'aureline')),
  killed_at_ms bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, dragon)
);

create index if not exists j2_dragon_shield_kills_user_idx
  on public.j2_dragon_shield_kills (user_id);

alter table public.earth_oblivion_events enable row level security;
alter table public.j2_dragon_shield_kills enable row level security;

-- Oblivion events: public records — everyone reads them (a user on
-- Earth must be able to see the event to evacuate; the hub must be
-- able to show the timer).
drop policy if exists "earth_oblivion_events public read" on public.earth_oblivion_events;
create policy "earth_oblivion_events public read"
  on public.earth_oblivion_events
  for select
  using (true);

-- Shield kills: a user reads only their own rows.
drop policy if exists "j2_dragon_shield_kills owner read" on public.j2_dragon_shield_kills;
create policy "j2_dragon_shield_kills owner read"
  on public.j2_dragon_shield_kills
  for select
  using (auth.uid() = user_id);

-- No insert / update / delete policies for anon or authenticated on
-- either table: only the service role (the /api/oblivion/* routes)
-- writes. A client can never mint its own event or kill. Keeper
-- deletes go through the service role (dashboard / SQL).
