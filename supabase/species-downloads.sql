-- supabase/species-downloads.sql
-- STATUS: NOT RUN — staged for Merlin's green light. Do not execute
-- from a build; the owner runs it in the dashboard SQL Editor.
--
-- SPECIES FILES IN THE AUCTION HOUSE (Merlin, 2026-11-14): the species
-- databases are house files sold as repeatable downloads — first 20
-- downloads of EACH FILE free, then $5.00 USD per download. The files
-- themselves (2.66 GB across 11 files) live in the private bucket
-- below; the download API mints 1-hour signed URLs only after the free
-- grant or the $5 payment, so no client can fetch a file for free past
-- the first 20.
--
-- TWO PARTS:
--   1. The private storage bucket 'species-files'. No client access at
--      all (same pattern as supabase/earth2-models-bucket.sql): the
--      service role mints signed URLs and uploads the files, never a
--      browser client.
--   2. The per-file download counter table + two small functions. The
--      counter is GLOBAL per file (the first 20 downloads of the file,
--      worldwide — not per user). The free claim is atomic: the UPDATE
--      only fires while download_count < 20, so two buyers racing for
--      the last free slot cannot both win it.
--
-- The cap (20) mirrors SPECIES_FREE_DOWNLOADS in lib/auction/species.js.
-- If Merlin ever means per-user free downloads instead, the table keys
-- on (file_key, user_id) — a one-line change, flagged in the build
-- report, not done here.
--
-- AFTER THIS RUNS, the files still need uploading into the bucket at
-- the keys in lib/auction/species.js (species/species-complete.csv,
-- species/species-complete.xlsx, ... — 11 files, 2.66 GB). Until an
-- object lands, its listing shows as "being placed in the vault" and
-- the download API refuses honestly.

insert into storage.buckets (id, name, public)
values ('species-files', 'species-files', false)
on conflict (id) do nothing;

-- Intent made visible in the policy list: clients get nothing.
-- (A permissive policy with USING (false) grants no rows to anyone;
-- the service role bypasses RLS entirely and is unaffected.)
drop policy if exists "species-files: no client access" on storage.objects;
create policy "species-files: no client access"
  on storage.objects
  for all
  to public
  using (false)
  with check (false);

-- One row per file key: how many downloads of that file have happened.
create table if not exists public.species_download_counts (
  file_key text primary key,
  download_count integer not null default 0 check (download_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.species_download_counts enable row level security;

-- No client policies on purpose: the counts are read and written
-- server-side with the service-role key (the public GET route serves
-- the numbers). Clients read nothing directly.

-- Atomically claim one of the free 20 for a file. Returns the new
-- count, or NULL when no free slot is left (or the row does not exist).
create or replace function public.species_claim_free(p_file_key text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.species_download_counts
  set download_count = download_count + 1,
      updated_at = now()
  where file_key = p_file_key
    and download_count < 20
  returning download_count into v_count;
  return v_count;
end;
$$;

-- Record one paid download (no cap — the price, not the counter, gates
-- it). Returns the new count, or NULL when the row does not exist.
create or replace function public.species_record_download(p_file_key text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.species_download_counts
  set download_count = download_count + 1,
      updated_at = now()
  where file_key = p_file_key
  returning download_count into v_count;
  return v_count;
end;
$$;
