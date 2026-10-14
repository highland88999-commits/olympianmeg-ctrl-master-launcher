-- supabase/migrations/20261013_profile_character.sql
--
-- PROFILE CHARACTER ON IDENTITY (generated characters in profiles)
-- ================================================================
-- *** AWAITS MERLIN'S EXPLICIT GREEN LIGHT — DO NOT RUN THIS YET. ***
-- Per Merlin's rule, all Supabase SQL runs only on his explicit go.
-- Hand him this file first (as a clean copy), he reviews/approves via
-- Gemini, then the coordinator executes and reports back.
--
-- What this does:
--   public.user_profiles  adds profile_character_id (TEXT, NULL
--                         allowed) — the platform character (Olympus
--                         3D generator roster, lib/characters/roster.js)
--                         the user has set as their profile character,
--                         stored on their PERSONAL row (type =
--                         'personal'). NULL means "no character set".
--                         The value is a roster id such as
--                         'q001-freddy-krueger'; roster membership is
--                         enforced in the application (PATCH
--                         /api/profiles/me rejects unknown ids), and
--                         the CHECK below mirrors the id shape.
--
-- Why (Merlin, 2026-10-13): "all characters made should be able to
-- be used by users in their profiles." The /profile Characters
-- section and the public Agora profile both read this one field.
--
-- Defensive reads: until this migration runs, application code reads
-- profile_character_id as "optional" — PATCH /api/profiles/me writes
-- it separately and tolerates the missing-column error (42703 /
-- PGRST204), the public GET /api/profiles/:id/character answers null,
-- and the profile page falls back to the pick stored in localStorage
-- on the user's device (same pattern as preferred_language).

alter table public.user_profiles
  add column if not exists profile_character_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_profile_character_id_chk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_profile_character_id_chk
      check (profile_character_id is null or profile_character_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
end $$;
