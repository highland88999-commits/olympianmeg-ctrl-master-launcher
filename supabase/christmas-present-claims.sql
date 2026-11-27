-- supabase/christmas-present-claims.sql — Christmas presents (Merlin, Nov 27, 2026).
--
-- *** NOT RUN *** — STAGED — run in the Supabase SQL Editor (Project
-- Settings → SQL Editor, project pjslctbyigtapvblbjao), the same way
-- hub_baseball_flights was run live Nov 26. Cost: $0 — one small table,
-- no new service, no new plan. Needs Merlin's SQL green light, like
-- every migration.
--
-- What it stores: one row per claimed present — who opened it, which
-- season, which present. Twenty presents per season (present-00 …
-- present-19), 1 aether each, one per user. The PK (user_id, season,
-- present_id) is the second guard against double-claims; the aether
-- ledger idempotency key is the first.
--
-- Before this runs: the claim route answers 503 with setupRequired and
-- the client shows "presents open soon" — nothing is fake-credited.
-- NOTE: supabase/aether.sql is ALSO still *** NOT RUN *** — the aether
-- ledger itself must run before any present can pay out. Both files
-- need a dashboard run before payout.
--
-- RLS: a user may READ only their own claims (the client dims what
-- they already collected). Nobody writes through RLS — no
-- INSERT/UPDATE/DELETE policies, so claims are recorded only through
-- the API route with the service-role key. Clients never touch this
-- table except through that route.

create table if not exists public.christmas_present_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  season text not null,
  present_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, season, present_id)
);

alter table public.christmas_present_claims enable row level security;

-- A user reads only their own claims.
create policy "own claims readable"
  on public.christmas_present_claims for select
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policies: nobody writes through RLS.
-- Claims are recorded only by the API route (service-role key), so the
-- one-per-user-per-present rule is enforced in one place.
