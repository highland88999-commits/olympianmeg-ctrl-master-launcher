-- supabase/migrations/20261027_billboard_ads.sql
-- Billboard Manager queue + creative storage (Merlin, 2026-10-27).
--
-- HOW TO RUN (Merlin's step, dashboard only — code never runs this):
--   Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Until this runs, the manager page honestly says the queue is not set
-- up yet, and the hub keeps its rotating inventory. Nothing errors.
--
-- MODEL — staged queue + Send, the Portal Menu Graphics pattern:
-- - The manager NEVER writes live billboards. It stages queue rows
--   here (status 'staged'), and Send flips them to 'sent'.
-- - The builder reads the sent rows, wires them into the repo
--   manifest (public/billboards/manifest.json) via the push path,
--   and the hub panels read that manifest. Until the push lands,
--   the hub keeps showing its previous creative — never half-live.
-- - The live manifest is repo content, NOT a table: no live-write
--   route exists, so no manager action can ever go live on its own.
--
-- Rows:
--   kind 'ad'     — one ad entry for one billboard: creative +
--                  company + link, plus the billboard's rotation
--                  interval at stage time.
--   kind 'remove' — a request to drop a LIVE ad: identified by the
--                  billboard number + company + link pair the builder
--                  matches against the live manifest.
-- Statuses: 'staged' (private to the owner) -> 'sent' (readable by
-- the builder via the public sent-only queue endpoint) -> deleted
-- by the owner once the manifest shows them live.

create table if not exists public.billboard_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ad', 'remove')),
  billboard_number integer not null check (billboard_number between 1 and 44),
  company_name text not null check (char_length(company_name) between 1 and 80),
  link_url text not null check (char_length(link_url) between 1 and 2048),
  creative_type text check (creative_type in ('image', 'video')),
  creative_url text,
  rotation_interval_seconds integer not null default 15
    check (rotation_interval_seconds between 5 and 60),
  -- Ownership-cap support (Merlin, 2026-10-27 — hard rule): one
  -- billboard per satellite per advertiser. House/demo ads
  -- (Merlin's own) are exempt and never count as holdings.
  is_house boolean not null default false,
  status text not null default 'staged' check (status in ('staged', 'sent')),
  batch_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (
    (kind = 'ad' and creative_type is not null and creative_url is not null)
    or kind = 'remove'
  )
);

alter table public.billboard_queue enable row level security;

-- Nobody reads or writes queue rows through RLS directly; the app
-- touches this table only via service-role routes. The builder's
-- sent-only endpoint is the read path, and it runs service-role.
-- (No select/insert/update/delete policies are granted on purpose.)

-- Creative storage: one public bucket for staged billboard creatives.
-- The browser uploads with a service-role signed URL minted by an
-- owner-only route; the public reads the creative only after the
-- builder wires it into the repo manifest (the storage URL itself
-- is what the builder downloads from).
insert into storage.buckets (id, name, public)
values ('billboard-creatives', 'billboard-creatives', true)
on conflict (id) do nothing;

-- Public read on staged creatives (they are ad creatives, destined
-- for public display; the queue rows themselves stay private).
create policy "billboard-creatives public read"
  on storage.objects for select
  using (bucket_id = 'billboard-creatives');

-- Writes go through service-role signed URLs only: no anon or
-- authenticated insert/update/delete policy is granted here.
