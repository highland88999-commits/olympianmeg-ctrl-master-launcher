-- supabase/keepsake.sql
-- STATUS: GREEN-LIT Nov 17, 2026 — Merlin's word to run it. Run in the
-- Supabase SQL Editor (project pjslctbyigtapvblbjao, olympiannexus@gmail.com).
-- A pasted script runs as ONE transaction: if any statement fails, the
-- whole run rolls back and nothing is half-created.
--
-- KEEPSAKE (Nov 17, 2026) — a treasured photo, kept in a snow globe.
-- A saved globe is a row in keepsake_globes plus one photo object in the
-- public 'keepsake-globes' bucket. The share link is /keepsake/view/<id>:
-- anyone with the link can open the globe, no sign-in, because the table
-- and the bucket both read public for shared globes.
--
-- Uploads NEVER go through a client policy: the API route mints a
-- service-role signed upload URL (/api/keepsake/upload-url) and the phone
-- PUTs the photo straight to Storage. The service role bypasses storage
-- RLS by design; clients get read-only on the bucket.
--
-- Verify after the run (SQL Editor):
--   select * from public.keepsake_globes limit 1;          -- table exists
--   select id, public from storage.buckets
--     where id = 'keepsake-globes';                         -- bucket, public
--   select policyname from pg_policies
--     where tablename = 'keepsake_globes';                  -- 4 table policies
--   select policyname from pg_policies
--     where tablename = 'objects' and policyname like 'keepsake%';

create table if not exists public.keepsake_globes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  owner_email text,
  title text not null default 'Keepsake',
  plaque text not null default 'Keepsake',
  image_path text not null,
  image_url text not null,
  palette jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists keepsake_globes_owner_idx
  on public.keepsake_globes (owner_id, created_at desc);
create index if not exists keepsake_globes_created_idx
  on public.keepsake_globes (created_at desc);

alter table public.keepsake_globes enable row level security;

-- Anyone with the link can read a shared globe. Private globes
-- (is_public = false) are invisible to everyone but their owner.
drop policy if exists "keepsake_globes: public read" on public.keepsake_globes;
create policy "keepsake_globes: public read"
  on public.keepsake_globes
  for select to public
  using (is_public = true);

-- A signed-in user inserts only their own rows.
drop policy if exists "keepsake_globes: owner insert" on public.keepsake_globes;
create policy "keepsake_globes: owner insert"
  on public.keepsake_globes
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Owners can rename or unshare their own globes, and delete them.
drop policy if exists "keepsake_globes: owner update" on public.keepsake_globes;
create policy "keepsake_globes: owner update"
  on public.keepsake_globes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "keepsake_globes: owner delete" on public.keepsake_globes;
create policy "keepsake_globes: owner delete"
  on public.keepsake_globes
  for delete to authenticated
  using (owner_id = auth.uid());

-- The photo bucket: public, so a shared globe's photo loads for anyone.
insert into storage.buckets (id, name, public)
values ('keepsake-globes', 'keepsake-globes', true)
on conflict (id) do nothing;

-- Public read on the bucket's objects.
drop policy if exists "keepsake-globes: public read" on storage.objects;
create policy "keepsake-globes: public read"
  on storage.objects
  for select to public
  using (bucket_id = 'keepsake-globes');

-- Intent made visible: no client ever writes to this bucket directly.
-- Uploads arrive only through service-role signed URLs (the API route);
-- a permissive policy with USING (false) grants no rows to anyone, and
-- the service role bypasses storage RLS entirely and is unaffected.
drop policy if exists "keepsake-globes: no client writes" on storage.objects;
create policy "keepsake-globes: no client writes"
  on storage.objects
  for insert to public
  with check (false);
drop policy if exists "keepsake-globes: no client deletes" on storage.objects;
create policy "keepsake-globes: no client deletes"
  on storage.objects
  for delete to public
  using (false);
