-- supabase/migrations/20261004_tiktok_handle.sql
--
-- TIKTOK HANDLE ON IDENTITY (Live Recordings, Part 1)
-- ==================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first (as a clean copy), he reviews/approves via
-- Gemini, then the coordinator executes and reports back.
--
-- What this does:
--   public.user_profiles  adds tiktok_handle (TEXT, NULL allowed) — the
--                         user's bare TikTok handle on their PERSONAL row
--                         (type = 'personal'). NULL means "not set".
--                         CHECK constraint mirrors the client regex
--                         ^[A-Za-z0-9._]{1,24}$ (one optional leading @ is
--                         stripped client-side before write).
--
-- Table note (2026-10-04): the application code (lib/profiles/ensure.js,
-- app/api/profiles/*) reads/writes public.user_profiles, and the live DB
-- carries user_profiles columns (e.g. background_video was added there).
-- supabase/profiles.sql still documents the older public.profiles shape —
-- that file is stale relative to the live database. This migration targets
-- the table the code actually uses: public.user_profiles. Reconciling
-- profiles.sql is a separate cleanup for Merlin/Gemini review.
-- The handle lives only on the personal row; the application enforces
-- that (never send it with type = 'business').
--
-- Defensive reads: until this migration runs, application code must read
-- tiktok_handle as "optional" — selects without the column simply omit
-- the key, and no write may assume the column exists (the PATCH API
-- catches the missing-column error and saves the rest of the profile
-- without it).

alter table public.user_profiles
  add column if not exists tiktok_handle text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_tiktok_handle_chk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_tiktok_handle_chk
      check (tiktok_handle is null or tiktok_handle ~ '^[A-Za-z0-9._]{1,24}$');
  end if;
end $$;
