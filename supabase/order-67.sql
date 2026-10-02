-- ORDER 67 — holographic P2P calls.
-- Run this in the Supabase SQL editor (dashboard). One step: widen the
-- oasis_rooms game check so 'order-67' rooms can be created. Additive and
-- safe to re-run; existing games are preserved.
--
-- Until this runs, hosting a call fails honestly with a check-violation
-- error and the app says so instead of crashing.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'oasis_rooms_game_check'
  ) then
    alter table public.oasis_rooms drop constraint oasis_rooms_game_check;
  end if;
end $$;

alter table public.oasis_rooms
  add constraint oasis_rooms_game_check
  check (game in ('chess', 'basketball', 'colosseum', 'battleship', 'luge', 'order-67'));
