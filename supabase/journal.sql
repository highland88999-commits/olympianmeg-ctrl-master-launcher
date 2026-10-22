-- supabase/journal.sql — JOURNAL (/journal): per-user journal entries.
--
-- QUEUED — DO NOT RUN DIRECTLY. Like every migration in this folder it
-- waits for Merlin's explicit green light, then runs through the
-- Supabase SQL editor. Until it runs, /api/journal answers with an
-- honest setup-pending state and the page says setup is pending —
-- nothing is ever fake-saved.
--
-- What it stores
--   journal_entries: one row per entry, per user. Timestamps are the
--   DATABASE's job: created_at defaults to now() at insert and the API
--   never accepts a client-supplied timestamp; updated_at defaults to
--   now() and is bumped by the API on every edit. Entries list newest
--   -> oldest by default (the (user_id, created_at desc) index below
--   serves exactly that read).
--
-- Privacy design
--   - RLS on journal_entries, owner-only: a signed-in user can only
--     ever read, insert, update, or delete their own rows
--     (auth.uid() = user_id). The API additionally scopes every query
--     with an explicit user_id filter (defence in depth — the service
--     client bypasses RLS, the scoping does not).

create table if not exists public.journal_entries (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  title      text,
  body       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.journal_entries is
  'JOURNAL entries: per-user, auto-timestamped by the database, listed newest first. Owner-only access via RLS plus explicit user_id scoping in the API.';

create index if not exists journal_entries_user_created_idx
  on public.journal_entries (user_id, created_at desc);

alter table public.journal_entries enable row level security;

-- Owner-only policies: you can read/write your own entries, nothing else.
drop policy if exists "journal_entries: owner can read" on public.journal_entries;
create policy "journal_entries: owner can read"
  on public.journal_entries for select
  using (auth.uid() = user_id);

drop policy if exists "journal_entries: owner can insert" on public.journal_entries;
create policy "journal_entries: owner can insert"
  on public.journal_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "journal_entries: owner can update" on public.journal_entries;
create policy "journal_entries: owner can update"
  on public.journal_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "journal_entries: owner can delete" on public.journal_entries;
create policy "journal_entries: owner can delete"
  on public.journal_entries for delete
  using (auth.uid() = user_id);
