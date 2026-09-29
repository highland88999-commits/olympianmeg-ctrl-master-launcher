-- supabase/spotify.sql
-- SPOTIFY "MY SPOTIFY" SOURCE — OAuth tokens + per-user radio source preference.
-- Run in the Supabase SQL editor. Idempotent. DO NOT run twice concurrently.
--
-- Model:
--   spotify_tokens     — one row per user. Access + refresh tokens live ONLY
--                         here; the browser never sees the refresh token.
--                         All writes go through the service-role key in the
--                         /api/spotify/* server routes.
--   radio_source_prefs — the user's playback source choice: 'nexus' (house
--                         station, default) or 'my-spotify'. Plain preference,
--                         so the owner may read/write their own row.
--
-- Queue note for Merlin: this file is standalone NOW, but the standing
-- directive folds all per-module SQL into the frozen consolidated prompt at
-- the end of the project. Keep it in that list.

-- ---------------------------------------------------------------- tokens --
create table if not exists public.spotify_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null default '',
  -- Cached account info (refreshed at each connect): used to detect Premium
  -- honestly before attempting Web Playback SDK playback.
  display_name text,
  product text, -- 'premium' | 'free' | 'open' | 'unknown'
  updated_at timestamptz not null default now()
);

alter table public.spotify_tokens enable row level security;

-- Owner can READ their own row (the panel shows account name/plan).
-- No client insert/update/delete policies on purpose: every write happens
-- server-side with the service-role key in /api/spotify/*.
drop policy if exists spotify_tokens_owner_read on public.spotify_tokens;
create policy spotify_tokens_owner_read
  on public.spotify_tokens for select
  using (auth.uid() = user_id);

-- ------------------------------------------------- source preference --
create table if not exists public.radio_source_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  source text not null default 'nexus'
    check (source in ('nexus', 'my-spotify')),
  updated_at timestamptz not null default now()
);

alter table public.radio_source_prefs enable row level security;

-- It's just a preference — the owner may read and write their own row.
drop policy if exists radio_source_prefs_owner_read on public.radio_source_prefs;
create policy radio_source_prefs_owner_read
  on public.radio_source_prefs for select
  using (auth.uid() = user_id);

drop policy if exists radio_source_prefs_owner_write on public.radio_source_prefs;
create policy radio_source_prefs_owner_write
  on public.radio_source_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists radio_source_prefs_owner_update on public.radio_source_prefs;
create policy radio_source_prefs_owner_update
  on public.radio_source_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
