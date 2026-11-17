-- supabase/keepsake-video.sql
-- KEEPSAKE ROUND 2 — video keepsakes (Nov 17, 2026).
--
-- GREEN LIGHT: Merlin said YES Nov 17, 2026 ~12:43 —
-- "run the video table addition when it's staged." This migration ONLY
-- is green-lit. Nothing else in this file touches RLS or policies:
-- the existing policies are column-agnostic, so no policy changes.
--
-- Adds media_type ('image' | 'video', default 'image') and
-- duration_sec (seconds, null for photos) to public.keepsake_globes.
-- Idempotent: safe to run twice. STAGED ONLY — run it in the Supabase
-- SQL Editor (project pjslctbyigtapvblbjao, account
-- olympiannexus@gmail.com). The app code is migration-tolerant: until
-- this runs, saves retry without the new columns (stashing both values
-- in the palette JSONB) and reads fall back the same way — nothing 500s.
--
-- Verification queries (run after the migration):
--   1. select column_name, data_type, column_default
--        from information_schema.columns
--        where table_schema = 'public'
--          and table_name = 'keepsake_globes'
--          and column_name in ('media_type', 'duration_sec');
--      -- expect two rows: media_type text default 'image',
--      -- duration_sec numeric with no default.
--   2. select id, title, media_type, duration_sec
--        from public.keepsake_globes
--        order by created_at desc limit 5;
--      -- expect the columns present; existing rows read media_type
--      -- 'image' and duration_sec null.

alter table public.keepsake_globes
  add column if not exists media_type text not null default 'image';

alter table public.keepsake_globes
  add column if not exists duration_sec numeric;
