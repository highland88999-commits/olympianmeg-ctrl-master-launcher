-- supabase/midi-library.sql
-- MAESTRO universal MIDI library (2026-09-30, Merlin's direction).
--
-- Every MIDI used in Maestro is added here. Entries are contributed by all
-- users and readable by all users — the one deliberately universal table
-- (leaderboards-style exception to the account-scoped rule).
-- Deduped by file hash: the same file can only ever appear once.
--
-- Fold into the consolidated SQL at the end (per the one-prompt law).

-- ---------------------------------------------------------------- table ---
create table if not exists public.midi_library (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  artist        text,
  source_url    text,
  storage_path  text        not null,
  file_hash     text        not null unique,
  file_size     integer     not null,
  duration_sec  numeric     not null,
  track_count   integer     not null,
  note_count    integer     not null,
  contributed_by uuid       references auth.users (id) on delete set null,
  use_count     integer     not null default 1,
  created_at    timestamptz not null default now()
);

create index if not exists midi_library_title_idx on public.midi_library (title);
create index if not exists midi_library_use_count_idx on public.midi_library (use_count desc);

alter table public.midi_library enable row level security;

-- Universal availability: everyone reads everything.
drop policy if exists midi_library_public_read on public.midi_library;
create policy midi_library_public_read
  on public.midi_library for select
  using (true);

-- Any signed-in user can contribute an entry. Bumps and deletes are
-- service-role only (via the /api/midi routes).
drop policy if exists midi_library_contrib_insert on public.midi_library;
create policy midi_library_contrib_insert
  on public.midi_library for insert
  with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------- storage -------
insert into storage.buckets (id, name, public)
values ('midi-library', 'midi-library', true)
on conflict (id) do nothing;

drop policy if exists midi_library_bucket_public_read on storage.objects;
create policy midi_library_bucket_public_read
  on storage.objects for select
  using (bucket_id = 'midi-library');
