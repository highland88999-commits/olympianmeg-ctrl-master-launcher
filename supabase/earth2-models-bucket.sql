-- supabase/earth2-models-bucket.sql
-- STATUS: NOT RUN — staged for Merlin's green light. Joins the
-- pending SQL bundle (journal.sql, earth2.sql, omega-comms.sql).
-- Do not execute from a build; the owner runs it in the dashboard
-- SQL Editor when the asset migration is scheduled.
--
-- THE EARTH 2 MODEL VAULT (Merlin's isolation rule, 2026-10-22):
-- "No characters for earth 2 should appear anywhere in the multiverse
-- except in earth 2 file which is behind lock and key to my account
-- until oblivion day."
--
-- Creates the PRIVATE storage bucket 'earth2-models' that holds the
-- Earth 2 foundry GLBs. Objects are addressed by relative keys —
-- the plain filenames from lib/earth2/models.js ('tyrannosaurus-rex.glb',
-- 'triceratops.glb', ...). The bucket is not public, and storage RLS
-- has NO permissive policy for anon or authenticated clients, so no
-- client can list, read, or guess-fetch an object directly.
--
-- The only door is server-side: /api/earth2/model-urls verifies the
-- owner's session (lib/owner.js) and mints 1-hour signed URLs with
-- the service role, which bypasses storage RLS by design. Uploads of
-- the optimized GLBs likewise happen with the service role (the
-- parent's migration step), never from a browser client.

insert into storage.buckets (id, name, public)
values ('earth2-models', 'earth2-models', false)
on conflict (id) do nothing;

-- Intent made visible in the policy list: clients get nothing.
-- (A permissive policy with USING (false) grants no rows to anyone;
-- the service role bypasses RLS entirely and is unaffected.)
drop policy if exists "earth2-models: no client access" on storage.objects;
create policy "earth2-models: no client access"
  on storage.objects
  for all
  to public
  using (false)
  with check (false);
