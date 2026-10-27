-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- Multiplayer PRESENCE for the master launcher ("other players should be
-- able to be seen from all other players"): one ephemeral row per active
-- rider, upserted every ~2.5s while flying, read by everyone else in the
-- same sector. Transport is plain DB polling (2.5s) — no Realtime, no
-- websockets — matching the OASIS layer pattern.
--
-- This file folds into the final consolidated SQL once the Takeout mining
-- freeze lifts. Until then the presence client (lib/presence.js) detects the
-- missing table and no-ops cleanly: every page renders solo, zero errors.
--
-- 2026-10-26 (Earth 1 passers-by): the client has ALWAYS upserted and
-- selected character_id (the sender's character pick, so peers can embody
-- the sender) but this draft NEVER DECLARED the column — the upserts
-- would have failed on an unknown column the moment the table existed.
-- The column is added below (nullable: a peer with no pick sends null).
-- Same round: the client gained opts.userId so a signed-in rider's row id
-- IS auth.uid() (the RLS policies below demand it); the old sessionId-only
-- row id would have been denied on every upsert. Editing this FILE is
-- preparation only — RUNNING it still needs Merlin's explicit green light.
-- ============================================================================

create table if not exists public.presence (
  id uuid primary key,
  -- For signed-in riders id = auth.uid(). Guests generate a random uuid per
  -- browser session (see lib/presence.js makeSessionId) and keep it in
  -- localStorage for the session.
  user_label text not null default 'Rider'
    check (char_length(user_label) <= 32),
  -- Sector scope keeps polls tiny: 'nova:shallows' | 'nova:gift-drift' |
  -- 'nova:spiral-reach' | 'myriad:<1-100>' | 'argo:earth' | ...
  sector text not null,
  pos jsonb not null default '{"x":0,"y":0,"z":0}'::jsonb,
  vehicle text not null default 'wisp',
  color text not null default '#22d3ee'
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- The sender's character pick (platform roster id like 'q020-neo',
  -- or an Earth extension id like 'x-me-wizard'). Nullable: a peer
  -- with no pick sends null and renders the neutral figure.
  -- Added 2026-10-26 — the client already upserted/selected this
  -- column, but the draft table never declared it.
  character_id text,
  updated_at timestamptz not null default now()
);

create index if not exists presence_sector_fresh_idx
  on public.presence (sector, updated_at desc);

alter table public.presence enable row level security;

-- Everyone (signed-in or guest) reads only recently-active rows. A 30s
-- window matches the client's stale-drop (15s) with headroom for jitter.
drop policy if exists "presence recent readable" on public.presence;
create policy "presence recent readable"
  on public.presence
  for select
  using (updated_at > now() - interval '30 seconds');

-- Signed-in riders: strictly their own row (id = auth.uid()).
drop policy if exists "presence owner insert" on public.presence;
create policy "presence owner insert"
  on public.presence
  for insert
  with check (auth.uid() = id);

drop policy if exists "presence owner update" on public.presence;
create policy "presence owner update"
  on public.presence
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "presence owner delete" on public.presence;
create policy "presence owner delete"
  on public.presence
  for delete
  using (auth.uid() = id);

-- Guests (anon): best-effort self-service. Rows are ephemeral (re-upserted
-- every 2.5s, purged when stale, readable only inside a 30s window), so the
-- abuse surface of a permissive anon policy is minimal and self-healing.
drop policy if exists "presence guest insert" on public.presence;
create policy "presence guest insert"
  on public.presence
  for insert
  to anon
  with check (true);

drop policy if exists "presence guest update" on public.presence;
create policy "presence guest update"
  on public.presence
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "presence guest delete" on public.presence;
create policy "presence guest delete"
  on public.presence
  for delete
  to anon
  using (true);

-- Stale-row purge. Run on a schedule (pg_cron every minute, or call from a
-- cron edge function) so abandoned sessions vanish even if leave() never ran.
create or replace function public.purge_stale_presence()
returns integer
language plpgsql
security definer
as $$
declare
  n integer;
begin
  delete from public.presence
  where updated_at < now() - interval '60 seconds';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Example pg_cron wiring (enable pg_cron first; adjust schedule as needed):
-- select cron.schedule('purge-stale-presence', '* * * * *',
--   $$select public.purge_stale_presence()$$);
