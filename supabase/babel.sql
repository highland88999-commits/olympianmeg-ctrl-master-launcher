-- Miles' vault (Babel module) — encrypted legacy storage.
--
-- SECURITY MODEL (read this before touching):
-- * The table stores CIPHERTEXT ONLY. Plaintext and passphrases never leave
--   the device; encryption is AES-GCM-256 with PBKDF2-SHA256 (600k iterations),
--   per-item random 16-byte salt + 12-byte IV (see lib/babel/crypto.js).
-- * Photos are stored as encrypted BYTES in the private `babel-vault` storage
--   bucket; the row keeps iv/salt and the storage path. Notes/credentials are
--   stored as base64 ciphertext in the row.
-- * RLS: every row belongs to exactly one owner (auth.uid()). No public read,
--   no cross-owner access. Forgetting a passphrase = unrecoverable data.
-- * OPEN QUESTION (Merlin to decide): how Miles gets login access to the
--   account that owns these rows (shared account? future handover?).
--
-- Run this whole file in the Supabase SQL editor.

create table if not exists public.babel_vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('photo', 'note', 'credential')),
  name text not null check (char_length(name) between 1 and 80),
  ciphertext text,                 -- base64 AES-GCM ciphertext (notes/credentials); null for photos
  iv text not null,                -- base64, 12 bytes
  salt text not null,              -- base64, 16 bytes
  mime_type text not null default 'text/plain',
  storage_path text,               -- bucket path for photos; null otherwise
  created_at timestamptz not null default now(),
  check (
    (item_type = 'photo' and ciphertext is null and storage_path is not null)
    or
    (item_type in ('note', 'credential') and ciphertext is not null and storage_path is null)
  )
);

alter table public.babel_vault_items enable row level security;

drop policy if exists "babel_vault owner read" on public.babel_vault_items;
create policy "babel_vault owner read"
  on public.babel_vault_items for select
  using (auth.uid() = owner_id);

drop policy if exists "babel_vault owner insert" on public.babel_vault_items;
create policy "babel_vault owner insert"
  on public.babel_vault_items for insert
  with check (auth.uid() = owner_id);

drop policy if exists "babel_vault owner update" on public.babel_vault_items;
create policy "babel_vault owner update"
  on public.babel_vault_items for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "babel_vault owner delete" on public.babel_vault_items;
create policy "babel_vault owner delete"
  on public.babel_vault_items for delete
  using (auth.uid() = owner_id);

create index if not exists babel_vault_items_owner_idx
  on public.babel_vault_items (owner_id, created_at desc);

-- Private storage bucket for encrypted photo blobs.
insert into storage.buckets (id, name, public)
values ('babel-vault', 'babel-vault', false)
on conflict (id) do nothing;

drop policy if exists "babel_vault storage owner read" on storage.objects;
create policy "babel_vault storage owner read"
  on storage.objects for select
  using (bucket_id = 'babel-vault' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "babel_vault storage owner write" on storage.objects;
create policy "babel_vault storage owner write"
  on storage.objects for insert
  with check (bucket_id = 'babel-vault' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "babel_vault storage owner delete" on storage.objects;
create policy "babel_vault storage owner delete"
  on storage.objects for delete
  using (bucket_id = 'babel-vault' and auth.uid()::text = (storage.foldername(name))[1]);
