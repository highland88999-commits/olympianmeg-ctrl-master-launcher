-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- ANTI-LIFE LINGERING DECAY (Merlin, 2026-11-15): decayed SPOTS for
-- contagion. A carrier's timer lives on their own device
-- (localStorage), but contagion needs effected things to be visible
-- to other users — so every place a carrier decays is a row here:
-- one row per carrier per world per 200 m cell, live until the
-- carrier's own timer dies (expires_at). When the timer dies the
-- spot dies with it, and everything there resets to normal — the
-- reset law, enforced by the expiry itself (reads filter expired
-- rows; carriers best-effort delete their own expired rows).
--
-- Transport is plain DB polling (2.5 s) — no Realtime, no websockets
-- — matching the presence pattern (lib/presence.js). The client
-- (lib/anti-life/decay-spots.js) detects the missing table and
-- no-ops cleanly: the carrier still decays their own view, nobody
-- else is infected, nothing errors. No fake contagion, ever.
--
-- Editing this FILE is preparation only — RUNNING it still needs
-- Merlin's explicit green light.
-- ============================================================================

create table if not exists public.anti_life_decay_spots (
  id text primary key,
  -- Deterministic: <carrier_id>:<world>:<grid-x>:<grid-z> — re-touching
  -- the same 200 m cell updates the same row instead of littering.
  world text not null,
  -- Position: x/z in world metres for metre worlds; x = latitude,
  -- y = longitude for planet-scale latlon worlds (Earth 1/3/4).
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  -- The decayed field's radius in metres: 50 (infection only
  -- within ~50 m of decayed ground, Merlin 2026-11-15 — the
  -- carrier's own decay field stays 1 km).
  radius_m double precision not null default 50
    check (radius_m > 0 and radius_m <= 50),
  -- For signed-in carriers carrier_id = auth.uid(). Guests use their
  -- device carrier id (a uuid kept in localStorage with the timer).
  carrier_id text not null,
  -- The carrier's own timer expiry: the spot dies with it.
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists anti_life_decay_spots_world_live_idx
  on public.anti_life_decay_spots (world, expires_at);

create index if not exists anti_life_decay_spots_carrier_idx
  on public.anti_life_decay_spots (carrier_id, expires_at);

alter table public.anti_life_decay_spots enable row level security;

-- Everyone (signed-in or guest) reads only live spots. An expired
-- spot is dead ground — it must never infect anyone.
drop policy if exists "decay spots live readable" on public.anti_life_decay_spots;
create policy "decay spots live readable"
  on public.anti_life_decay_spots
  for select
  using (expires_at > now());

-- Signed-in carriers: strictly their own rows (carrier_id = auth.uid()).
drop policy if exists "decay spots owner insert" on public.anti_life_decay_spots;
create policy "decay spots owner insert"
  on public.anti_life_decay_spots
  for insert
  with check (auth.uid()::text = carrier_id);

drop policy if exists "decay spots owner update" on public.anti_life_decay_spots;
create policy "decay spots owner update"
  on public.anti_life_decay_spots
  for update
  using (auth.uid()::text = carrier_id)
  with check (auth.uid()::text = carrier_id);

drop policy if exists "decay spots owner delete" on public.anti_life_decay_spots;
create policy "decay spots owner delete"
  on public.anti_life_decay_spots
  for delete
  using (auth.uid()::text = carrier_id);

-- Guests (anon): best-effort self-service, same as presence. Rows
-- are ephemeral (live at most 10 minutes, re-upserted every 2.5 s
-- while the carrier moves, purged when expired), so the abuse
-- surface of a permissive anon policy is minimal and self-healing.
drop policy if exists "decay spots guest insert" on public.anti_life_decay_spots;
create policy "decay spots guest insert"
  on public.anti_life_decay_spots
  for insert
  to anon
  with check (true);

drop policy if exists "decay spots guest update" on public.anti_life_decay_spots;
create policy "decay spots guest update"
  on public.anti_life_decay_spots
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "decay spots guest delete" on public.anti_life_decay_spots;
create policy "decay spots guest delete"
  on public.anti_life_decay_spots
  for delete
  to anon
  using (true);

-- Expired-row purge. Run on a schedule (pg_cron every minute, or
-- call from a cron edge function) so dead spots vanish even if the
-- carrier's own purge never ran.
create or replace function public.purge_expired_decay_spots()
returns integer
language plpgsql
security definer
as $$
declare
  n integer;
begin
  delete from public.anti_life_decay_spots
  where expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Example pg_cron wiring (enable pg_cron first; adjust schedule as needed):
-- select cron.schedule('purge-expired-decay-spots', '* * * * *',
--   $$select public.purge_expired_decay_spots()$$);
