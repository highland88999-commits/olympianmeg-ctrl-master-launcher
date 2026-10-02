-- supabase/profile-video.sql — profile background video preset.
--
-- WHAT: adds `background_video` (text, nullable) to public.user_profiles.
-- The public profile page (/u/<username>) renders it as a full-page ambient
-- video background when set; empty string or NULL means "none".
--
-- Values are whitelisted to preset paths in lib/profiles/validation.js
-- (BACKGROUND_VIDEO_PRESETS), so profiles can never hotlink arbitrary URLs.
--
-- RLS: no policy change needed. Writes go through PATCH /api/profiles/me,
-- which authenticates the user and updates via the service-role client
-- (owner-only by construction). Public reads already select * under the
-- existing public-read policy.
--
-- RUN: paste into the Supabase dashboard SQL editor and run. Idempotent —
-- safe to run more than once.

alter table public.user_profiles
  add column if not exists background_video text;

comment on column public.user_profiles.background_video is
  'Preset background video for the public profile page. NULL/empty = none. Values whitelisted in lib/profiles/validation.js (BACKGROUND_VIDEO_PRESETS).';
