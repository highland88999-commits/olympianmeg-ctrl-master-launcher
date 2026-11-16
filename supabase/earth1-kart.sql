-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- Earth 1 Mario Kart (Merlin, 2026-11-15): ONE ORB = ONE MISSILE, tracked
-- in Supabase ("the brain") — a per-user missile inventory the client
-- reads and spends, so it persists and can't be faked locally, and so
-- hits on other players' vehicles are real shared state (the combat is
-- multiplayer — peers' positions come from presence, so the hit event
-- needs a server home too).
--
-- Two tables:
--   earth1_missiles      — one row per user: their missile count.
--   earth1_combat_events — one row per hit: who hit whom, how, where.
--     The client polls its own recent events (30 s window) and plays
--     the flip-3x-explode on its own vehicle. Old rows are inert —
--     nothing reads them after the window, so no cron is needed.
--
-- RUNNING this still needs Merlin's explicit green light (standing
-- rule: Supabase SQL migrations need his green light before
-- executing). Until it runs, the API route (app/api/earth1/kart)
-- answers 503 setupRequired and the client count carries the
-- session — the server count lands the moment he gives the word.
--
-- NOTE the presence.sql dependency: peer hits need presence live
-- too (presence.sql is still DRAFT/unrun) — peer targeting is
-- visual-only on the shooter's screen until BOTH run.
-- ============================================================================

create table if not exists public.earth1_missiles (
  user_id text primary key,
  missiles integer not null default 0 check (missiles >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.earth1_combat_events (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  target_id text not null,
  kind text not null check (kind in ('torpedo', 'collision')),
  damage integer not null default 0 check (damage >= 0),
  lat double precision,
  lon double precision,
  nonce text,
  created_at timestamptz not null default now()
);

-- The poll reads "my recent events": target + recency.
create index if not exists earth1_combat_events_target_created_idx
  on public.earth1_combat_events (target_id, created_at desc);
-- Nonce lookup for the client's dedupe (processedNonces).
create index if not exists earth1_combat_events_nonce_idx
  on public.earth1_combat_events (nonce);

-- Atomic counters (the API route calls these via rpc — a plain
-- JS upsert cannot express "missiles + 1", and a read-modify-
-- write would lose a missile when two grants land together).
create or replace function public.earth1_grant_missile(p_user_id text)
returns integer
language plpgsql
security definer
as $$
declare v integer;
begin
  insert into public.earth1_missiles (user_id, missiles)
  values (p_user_id, 1)
  on conflict (user_id)
  do update set missiles = public.earth1_missiles.missiles + 1,
                updated_at = now()
  returning missiles into v;
  return v;
end;
$$;

create or replace function public.earth1_spend_missile(p_user_id text)
returns table (ok boolean, missiles integer)
language plpgsql
security definer
as $$
declare v integer;
begin
  update public.earth1_missiles
  set missiles = missiles - 1, updated_at = now()
  where user_id = p_user_id and missiles > 0
  returning missiles into v;
  if v is null then
    select coalesce(max(missiles), 0) into v
    from public.earth1_missiles where user_id = p_user_id;
    return query select false, v;
  end if;
  return query select true, v;
end;
$$;

alter table public.earth1_missiles enable row level security;
alter table public.earth1_combat_events enable row level security;

-- Missiles: a signed-in rider touches ONLY their own row.
drop policy if exists "earth1_missiles own row" on public.earth1_missiles;
create policy "earth1_missiles own row" on public.earth1_missiles
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Combat events: anyone signed in may INSERT as themselves, and
-- may READ recent events (the poll window is enforced by the API
-- route's 30 s filter, not by the policy). No updates, no deletes
-- — a hit is a fact, not a draft.
drop policy if exists "earth1_combat_events insert own" on public.earth1_combat_events;
create policy "earth1_combat_events insert own" on public.earth1_combat_events
  for insert
  with check (auth.uid()::text = actor_id);

drop policy if exists "earth1_combat_events read recent" on public.earth1_combat_events;
create policy "earth1_combat_events read recent" on public.earth1_combat_events
  for select
  using (auth.role() = 'authenticated');
