-- ============================================================================
-- Fortress of Solitude — per-user Supabase Storage buckets.
--
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).
--
-- Every user gets their OWN private bucket, named `fortress-<user_id>`
-- (e.g. fortress-3f9a...c1). Buckets are created on first use by the server
-- (service role) via POST /api/fortress/vault/ensure — never by the client.
--
-- All app access goes through service-role server routes, which bypass RLS.
-- These policies are defense-in-depth: even if a client key ever touched
-- storage directly, a user could only ever see their own bucket.
-- No cross-user access, ever.
-- ============================================================================

-- Drop first so the migration is re-runnable.
drop policy if exists "fortress_owner_read" on storage.objects;
drop policy if exists "fortress_owner_insert" on storage.objects;
drop policy if exists "fortress_owner_update" on storage.objects;
drop policy if exists "fortress_owner_delete" on storage.objects;

-- Read: a user sees objects only inside their own fortress bucket.
create policy "fortress_owner_read" on storage.objects
  for select
  using (bucket_id = 'fortress-' || auth.uid()::text);

-- Write: a user uploads only into their own fortress bucket.
create policy "fortress_owner_insert" on storage.objects
  for insert
  with check (bucket_id = 'fortress-' || auth.uid()::text);

-- Update: same bucket confinement for overwrites / moves.
create policy "fortress_owner_update" on storage.objects
  for update
  using (bucket_id = 'fortress-' || auth.uid()::text)
  with check (bucket_id = 'fortress-' || auth.uid()::text);

-- Delete: a user removes only their own vault files.
create policy "fortress_owner_delete" on storage.objects
  for delete
  using (bucket_id = 'fortress-' || auth.uid()::text);
