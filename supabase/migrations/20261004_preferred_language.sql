-- supabase/migrations/20261004_preferred_language.sql
--
-- PREFERRED LANGUAGE ON IDENTITY (in-app translation, both ways)
-- ==============================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first (as a clean copy), he reviews/approves via
-- Gemini, then the coordinator executes and reports back.
--
-- What this does:
--   public.user_profiles  adds preferred_language (TEXT, NOT NULL,
--                         DEFAULT 'en') — the user's chosen content
--                         language. English is the default everywhere
--                         (Merlin: "English should be the default language
--                         we display in").
--
-- Reconciliation note (guests vs signed-in):
--   Prior i18n work stored the chrome language in localStorage under
--   `nexus-language` (see lib/i18n/index.tsx). That stays the source of
--   truth for GUESTS. For signed-in users the profile column wins and
--   the app syncs it back to localStorage on save, so both stay aligned.
--   Application code must read preferred_language as "optional" until
--   this migration runs (missing-column 42703 tolerated, falls back to
--   localStorage, then 'en').
--
-- The language lives on the PERSONAL row (like tiktok_handle); the
-- application enforces that (never send it with type = 'business').

alter table public.user_profiles
  add column if not exists preferred_language text not null default 'en';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_preferred_language_chk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_preferred_language_chk
      check (preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
  end if;
end $$;
