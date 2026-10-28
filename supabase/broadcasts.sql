-- supabase/broadcasts.sql
--
-- VOCAL BROADCAST / INTERCOM STORAGE
-- ============================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first, he reviews, then it runs and reports back.
--
-- Why this file exists: the broadcast routes tried to create the
-- 'broadcasts' storage bucket on first use, and that failed in
-- production, so every send died with "Broadcast storage is not set
-- up yet." This file sets storage up deterministically instead:
--
--   storage bucket  broadcasts (public read, so every listener's
--                   device can fetch clips + latest.json)
--   public.broadcasts  one row per sent broadcast (the system record:
--                   clip path, voice preset, length, sender, time)
--
-- What stays the same after this runs:
--   - Sending is still owner-only (the API routes check the keeper's
--     email server-side; the table policies below are a second lock).
--   - Delivery still polls latest.json (no websockets, no Realtime);
--     the table is the record and history, latest.json is the live
--     pointer every open page polls.
--   - Uploads still go through service-role signed URLs minted by
--     /api/broadcasts/upload-url, so no client storage insert/update/
--     delete policies are needed.
--
-- Idempotent: safe to run twice (if not exists / on conflict do
-- nothing / drop policy if exists throughout).

-- ============================================================ broadcasts table
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  audio_path text not null,              -- clips/<owner-id>/<nonce>.webm|mp4
  audio_url text not null,               -- public storage URL listeners play
  preset text not null default 'original',
  duration_ms integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists broadcasts_created_at_idx
  on public.broadcasts (created_at desc);

alter table public.broadcasts enable row level security;

-- Announcements are meant for every user: anyone may read the record.
drop policy if exists "broadcasts public read" on public.broadcasts;
create policy "broadcasts public read"
  on public.broadcasts for select
  using (true);

-- Direct client writes stay owner-only (the publish route writes through
-- the service role, which bypasses RLS; this policy is a second lock).
drop policy if exists "broadcasts owner insert" on public.broadcasts;
create policy "broadcasts owner insert"
  on public.broadcasts for insert
  to authenticated
  with check (auth.uid() = created_by);

-- ============================================================ storage bucket
insert into storage.buckets (id, name, public)
values ('broadcasts', 'broadcasts', true)
on conflict (id) do nothing;

-- Public read: clips and latest.json are meant for every listener's
-- device, on every page of the site.
drop policy if exists "broadcasts public read" on storage.objects;
create policy "broadcasts public read"
  on storage.objects for select
  using (bucket_id = 'broadcasts');

-- Uploads happen through service-role signed URLs minted by
-- /api/broadcasts/upload-url (owner-verified server-side), so no client
-- insert/update/delete storage policies are needed.
