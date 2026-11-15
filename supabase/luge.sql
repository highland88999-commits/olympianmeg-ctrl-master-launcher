-- supabase/luge.sql
-- LUGE: Complete Arsenal ownership, Stripe idempotency, hoodie redemptions.
-- Run in the Supabase SQL editor. Idempotent.

-- Which premium sleds each user owns (granted by the Stripe webhook).
create table if not exists public.luge_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  sled_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, sled_id)
);
create index if not exists luge_inventory_user_idx on public.luge_inventory (user_id);

-- Processed Stripe events, so webhook retries never double-grant.
create table if not exists public.luge_stripe_events (
  stripe_event_id text primary key,
  created_at timestamptz not null default now()
);

-- One hoodie redemption per user.
create table if not exists public.luge_redemptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

alter table public.luge_inventory enable row level security;
alter table public.luge_stripe_events enable row level security;
alter table public.luge_redemptions enable row level security;

-- Users can read their own inventory and redemption. No client writes —
-- grants and redemptions happen server-side with the service-role key
-- (checkout webhook, claim API).
drop policy if exists luge_inventory_owner_read on public.luge_inventory;
create policy luge_inventory_owner_read
  on public.luge_inventory for select
  using (auth.uid() = user_id);

drop policy if exists luge_redemptions_owner_read on public.luge_redemptions;
create policy luge_redemptions_owner_read
  on public.luge_redemptions for select
  using (auth.uid() = user_id);

-- luge_stripe_events: no client access at all (webhook-only table).

-- ============================================================================
-- DRAFT (2026-09-29) — folds into the frozen consolidated SQL. DO NOT RUN YET.
--
-- Luge free-hoodie reward chain: complete ALL 20 courses AND own the Complete
-- Arsenal -> one FREE hoodie, redeemed through the store as a $0 order.
-- This reward is entirely separate from the Valkyrie referral program —
-- the two tracks never mix.
--
-- ANTI-BACKFILL RULE (Merlin 2026-09-29): only runs finished AFTER this
-- reward launches count. No historical completions are ever inserted or
-- inferred — the table starts empty and fills one legitimate run at a time.
-- ============================================================================

-- One row per course a rider legitimately finished. Rows are written
-- server-side only, by POST /api/luge/complete, which validates the run
-- against the game's physics (minimum possible run time), requires the
-- sled to be owned, and rejects anything a client flag alone claims.
create table if not exists public.luge_course_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id int not null check (course_id between 1 and 20),
  completed_at timestamptz not null default now(),
  run_seconds numeric,
  primary key (user_id, course_id)
);
create index if not exists luge_course_completions_user_idx
  on public.luge_course_completions (user_id);

-- Obstacle hits for the recorded run (Nov 14, 2026): the hit count rides
-- along on the same single row — never a second row. Staged, NOT RUN
-- (needs Merlin's green light like the rest of this file's draft half);
-- the API routes retry without the column until it lands, so recording
-- never breaks either way.
alter table public.luge_course_completions
  add column if not exists hits integer not null default 0 check (hits >= 0);

alter table public.luge_course_completions enable row level security;

-- Riders read their own completions. No client writes — inserts happen
-- server-side with the service-role key only.
drop policy if exists luge_course_completions_owner_read on public.luge_course_completions;
create policy luge_course_completions_owner_read
  on public.luge_course_completions for select
  using (auth.uid() = user_id);

-- The redemption now records which reward it was and points at the $0
-- store order it created. The primary key on user_id stays the
-- one-redemption-per-rider guard.
-- NOTE: store_order_id is a plain uuid on purpose — it references
-- store_orders(id) from supabase/store.sql without a hard FK, so the two
-- drafts can land in the consolidated SQL in either order.
alter table public.luge_redemptions
  add column if not exists reward text not null default 'luge_free_hoodie',
  add column if not exists size text,
  add column if not exists store_order_id uuid;
