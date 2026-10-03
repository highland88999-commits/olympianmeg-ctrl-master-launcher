-- supabase/profile-background-video.sql
-- Adds the background_video column to user_profiles.
--
-- The profile editor (app/u/[username]/edit/page.jsx) and the PATCH validator
-- (lib/profiles/validation.js) already read/write background_video, and the
-- public profile (app/u/[username]/page.jsx) already renders it — but the
-- column never existed, so every "Background video set" save failed at the
-- database and the preset never survived a reload. Applied live 2026-10-03.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS background_video TEXT;
