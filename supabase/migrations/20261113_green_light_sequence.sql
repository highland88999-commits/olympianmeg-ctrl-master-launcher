-- 20261113_green_light_sequence.sql
-- GREEN-LIGHT SQL SEQUENCE — Nov 13, 2026 (Merlin's go-ahead to run it).
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this WHOLE file
-- -> Run. One paste, sections run in order. Every statement is
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE), so re-running it is
-- safe — nothing is created twice and nothing already live is touched.
--
-- WHAT IT COVERS (each section traces to code that reads/writes it):
--   A. public.store_orders — the store's order table (checkout inserts
--      'pending_payment'; the Stripe webhook flips pending -> paid).
--      From supabase/store.sql. The table may already be live; this
--      is harmless if so.
--   B. Fulfillment columns on store_orders — fulfillment_status +
--      fulfillment_error, written best-effort by the store webhook and
--      gold checkout. From supabase/migrations/20261107_store_
--      fulfillment_status.sql (the file stays the canonical copy).
--   C. public.account_state + merge_account_preferences() — the
--      per-account UI-state store behind /api/ui-state (backpack,
--      portal progress, Muse FAB, Concourse positions). The merge
--      function lives in supabase/ui-state.sql; the table itself had
--      no CREATE TABLE anywhere in the repo, so it is created here.
--   D. public.crocodile_swamp_leaderboard — the global top-10 board
--      for Crocodile Swamp. From supabase/crocodile-swamp.sql. The
--      leaderboard route answers 503 (offline) until this exists.
--   E. (SEPARATE PASTE) supabase/omega-comms-reconcile.sql — the
--      comms tables' gentle adapt. Already green-lit Oct 23, safe to
--      re-run. Run it as its own paste after this file.
--
-- NOT in this file (separate project): the Shared Muse Workspace
-- accounts table (~/workspace/shared-workspace-site/supabase/
-- shared_workspace_accounts.sql) runs in the workspace's OWN
-- Supabase project, never in the Olympus one.
--
-- DO NOT RUN in any project other than the Olympus production
-- project (pjslctbyigtapvblbjao).

-- ============================================================ A. store_orders
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  stripe_session_id text unique,
  product_name text,
  price_id text,
  amount_cents int,
  currency text not null default 'cad',
  size text,
  printful_product_id text,
  printful_variant_id text,
  shipping jsonb,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'fulfilled', 'refunded', 'cancelled')),
  printful_order_id text,
  customer_notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz
);

create index if not exists store_orders_session_idx
  on public.store_orders (stripe_session_id);
create index if not exists store_orders_status_idx
  on public.store_orders (status);

-- RLS: anyone can insert a pending order (guest checkout); only the
-- service role may mark orders paid (the webhook). Reads stay
-- service-side — buyers don't list this table.
alter table public.store_orders enable row level security;

drop policy if exists store_orders_insert_pending on public.store_orders;
create policy store_orders_insert_pending
  on public.store_orders for insert
  to anon, authenticated
  with check (status = 'pending_payment');

-- ============================================== B. fulfillment columns (20261107)
-- fulfillment_status values:
--   awaiting_address  paid, but no usable shipping address on file
--                     (gold-paid orders; card orders with an incomplete
--                     address). NEVER submitted to Printful in this state.
--   failed            variant resolution or Printful submission failed;
--                     status stays 'paid'; see fulfillment_error.
--   draft_only        Printful draft created, confirm failed; the draft
--                     waits in the Printful dashboard for manual
--                     confirmation; printful_order_id holds the draft id.
--   fulfilled         Printful confirmed the order (status is also
--                     flipped to 'fulfilled', fulfilled_at set).
--   NULL              not yet attempted.

alter table public.store_orders
  add column if not exists fulfillment_status text,
  add column if not exists fulfillment_error text;

create index if not exists store_orders_fulfillment_idx
  on public.store_orders (fulfillment_status);

comment on column public.store_orders.fulfillment_status is
  'Printful fulfillment state: awaiting_address | failed | draft_only | fulfilled (null = not yet attempted). Written best-effort by the store webhook and gold checkout.';
comment on column public.store_orders.fulfillment_error is
  'Last fulfillment failure / hold reason (plain text). Never contains secrets.';

-- ============================================ C. account_state + merge function
-- /api/ui-state stores one row per user; preferences is a jsonb map
-- (backpack, portal-progress, muse_fab, concourse_*, ...). All reads
-- and writes go through the service role in the route — no client
-- policy is created on purpose.

create table if not exists public.account_state (
  user_id uuid primary key,
  preferences jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.account_state enable row level security;

-- Merge a patch into the account's preferences atomically (other keys
-- are never clobbered). Copied from supabase/ui-state.sql.
CREATE OR REPLACE FUNCTION public.merge_account_preferences(p_user_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object';
  END IF;
  INSERT INTO public.account_state(user_id, preferences, state, updated_at)
  VALUES (p_user_id, p_patch, '{}'::jsonb, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preferences = public.account_state.preferences || EXCLUDED.preferences,
    updated_at = now();
  SELECT preferences INTO v_prefs FROM public.account_state WHERE user_id = p_user_id;
  RETURN v_prefs;
END
$$;

-- ============================================ D. crocodile_swamp_leaderboard
-- Crocodile Swamp global leaderboard: how long you survived and how
-- far you travelled before the crocodile ate you. Same global-board
-- exception as Neon Void and Starblood: everyone reads the same top-10.
-- Sanity is enforced twice: CHECK constraints here and validateScore()
-- in /api/crocodile-swamp/leaderboard.

create table if not exists public.crocodile_swamp_leaderboard (
  id          uuid        primary key default gen_random_uuid(),
  username    text        not null check (char_length(username) between 1 and 24),
  score       integer     not null check (score >= 0 and score <= 10000000),
  seconds     integer     not null default 0 check (seconds >= 0 and seconds <= 86400),
  distance_m  integer     not null default 0 check (distance_m >= 0 and distance_m <= 1000000),
  created_at  timestamptz not null default now()
);

create index if not exists crocodile_swamp_leaderboard_score_idx
  on public.crocodile_swamp_leaderboard (score desc, created_at asc);

alter table public.crocodile_swamp_leaderboard enable row level security;

-- Universal read: the whole world sees the same board.
drop policy if exists crocodile_swamp_leaderboard_public_read on public.crocodile_swamp_leaderboard;
create policy crocodile_swamp_leaderboard_public_read
  on public.crocodile_swamp_leaderboard for select
  using (true);

-- Open insert of sane rows only — the CHECK constraints above reject
-- anything a real run cannot produce. Writes go through the API route
-- (service role), which validates again before inserting.
drop policy if exists crocodile_swamp_leaderboard_open_insert on public.crocodile_swamp_leaderboard;
create policy crocodile_swamp_leaderboard_open_insert
  on public.crocodile_swamp_leaderboard for insert
  with check (true);

-- Updates and deletes stay service-role only (no policy = denied).

-- ============================================================ E. separate paste
-- After this file, run supabase/omega-comms-reconcile.sql as its own
-- paste (already green-lit Oct 23; idempotent, safe to re-run). It
-- adapts the comms tables (p2p_chat, squad_chat, squads) to the
-- columns the app writes.
