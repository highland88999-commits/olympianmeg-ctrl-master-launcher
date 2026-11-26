-- supabase/hub-baseball-leaderboard.sql — Hub Baseball global leaderboard.
--
-- GREEN-LIT Nov 26, 2026 — Merlin: "global leaderboard" order. STAGED —
-- run in the Supabase SQL Editor (Project Settings → SQL Editor, project
-- pjslctbyigtapvblbjao), the same way monopoly_rooms was run live
-- Nov 3. Cost: $0 — one small table, no new service, no new plan.
--
-- What it stores: one row per finished flight — who flew it, how far
-- the ball got from the plate (whole metres, max 100000), and whether
-- a black hole ate the ball. Nothing else. No tokens, no personal
-- data beyond the user id (which Supabase already holds).
--
-- What it enables: the scoreboard in the hub shows the global ranking
-- (top 50 distances + the player's own rank), and every finished
-- flight submits its distance to the server.
--
-- Before this runs: the API route answers 503 with a plain-English
-- message, and the game still works locally with a local-only
-- scoreboard — nothing breaks.
--
-- RLS: authenticated users may READ every row (the board is global —
-- it ranks every user's flights). Nobody writes through RLS — no
-- INSERT/UPDATE/DELETE policies, so flights are recorded only
-- through the SECURITY DEFINER function below, called by the API
-- route with the service-role key. Clients never touch this table
-- except through that route.

create table if not exists public.hub_baseball_flights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player text not null default 'Player',
  distance_m double precision not null check (distance_m >= 0 and distance_m <= 100000),
  eaten boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.hub_baseball_flights enable row level security;

-- Global board: any signed-in user reads every flight.
create policy "global board readable"
  on public.hub_baseball_flights for select
  to authenticated
  using (true);

-- No INSERT / UPDATE / DELETE policies: nobody writes through RLS.
-- Flights are recorded only inside submit_hub_baseball_flight below
-- (SECURITY DEFINER, called by the API route with the service-role
-- key), so the distance cap is enforced in one place.

-- Record one finished flight. SECURITY DEFINER so the insert runs
-- past RLS (which has no write policies). Returns the new row's id
-- and distance. Player name is trimmed to 24 chars; a blank name
-- becomes 'Player'.
create or replace function public.submit_hub_baseball_flight(
  p_user_id uuid,
  p_player text,
  p_distance_m double precision,
  p_eaten boolean
)
returns table (id uuid, distance_m double precision)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player text;
  v_id uuid;
begin
  if p_distance_m is null or p_distance_m < 0 or p_distance_m > 100000 then
    raise exception 'distance_m must be between 0 and 100000';
  end if;

  v_player := nullif(left(trim(coalesce(p_player, '')), 24), '');
  if v_player is null then
    v_player := 'Player';
  end if;

  insert into public.hub_baseball_flights (user_id, player, distance_m, eaten)
  values (p_user_id, v_player, p_distance_m, coalesce(p_eaten, false))
  returning hub_baseball_flights.id into v_id;

  return query select v_id, p_distance_m;
end;
$$;
