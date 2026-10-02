-- supabase/rider-state.sql
-- rider_state: per-account hub TRON-bike persistence.
-- When the rider dismounts, the hub saves their dismount position (beside
-- the bike, not a default spawn point); spawn-to-bike reads it back so the
-- ride resumes exactly where it was left. One row per account.
--
-- Idempotent: safe to run more than once.

create table if not exists public.rider_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  z double precision not null,
  realm text not null default 'hub',
  updated_at timestamptz not null default now()
);

alter table public.rider_state enable row level security;

-- Owner-read only. There are deliberately NO client insert/update/delete
-- policies: writes go through the service-role API route
-- (app/api/rider/state/route.js), never from the client bundle.
drop policy if exists rider_state_owner_read on public.rider_state;
create policy rider_state_owner_read
  on public.rider_state
  for select
  using (auth.uid() = user_id);
