-- supabase/migrations/20261004_spotify_search_playlist.sql
-- "YOUR SEARCH PLAYLIST" — per-account storage of Spotify tracks the user
-- searched and played (or explicitly added) in the radio's My Spotify panel.
--
-- Model:
--   spotify_search_tracks — one row per (user, Spotify track). Stores only
--   Spotify catalog references (track id + display metadata): no tokens,
--   no credentials, nothing sensitive.
--
-- Access: owner-only. All API writes go through the service-role key after
-- verifying the caller's Supabase session; RLS is the second layer.
--
-- STATUS: NOT EXECUTED. Clean copy for Merlin/Gemini review — green light
-- required before running. Idempotent: safe to run more than once (never
-- run two copies concurrently).

create table if not exists public.spotify_search_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  spotify_track_id text not null,
  title text not null default '',
  artist text not null default '',
  album_art text not null default '',
  added_at timestamptz not null default now(),
  unique (user_id, spotify_track_id)
);

create index if not exists spotify_search_tracks_user_added_idx
  on public.spotify_search_tracks (user_id, added_at desc);

alter table public.spotify_search_tracks enable row level security;

-- Idempotent policy refresh: drop-then-create so re-runs stay clean.
drop policy if exists spotify_search_tracks_owner_read on public.spotify_search_tracks;
create policy spotify_search_tracks_owner_read
  on public.spotify_search_tracks for select
  using (auth.uid() = user_id);

drop policy if exists spotify_search_tracks_owner_insert on public.spotify_search_tracks;
create policy spotify_search_tracks_owner_insert
  on public.spotify_search_tracks for insert
  with check (auth.uid() = user_id);

drop policy if exists spotify_search_tracks_owner_delete on public.spotify_search_tracks;
create policy spotify_search_tracks_owner_delete
  on public.spotify_search_tracks for delete
  using (auth.uid() = user_id);
