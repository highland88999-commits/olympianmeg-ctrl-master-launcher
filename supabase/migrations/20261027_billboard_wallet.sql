-- supabase/migrations/20261027_billboard_wallet.sql
-- Billboard user requests + CAD wallet credit + subscriptions (Merlin, 2026-10-27).
--
-- HOW TO RUN (Merlin's step, dashboard only — code never runs this):
--   Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Until this runs, the request flow, wallet credit, and subscriptions
-- honestly answer "not set up yet" instead of erroring. The owner
-- manager's own migration (20261027_billboard_ads.sql) is separate;
-- either file can run first.
--
-- TABLES:
-- - wallet_credit_balances: CAD stored value per user. SEPARATE from
--   the earnings wallet (`wallets`) and from gold/aether — never mixed,
--   never converted. Pays for services inside Olympus; never cashed out.
-- - wallet_credit_transactions: every load/spend, idempotent on
--   `reference` (the double-credit guard).
-- - billboard_requests: user-submitted ad requests (pending ->
--   approved/rejected -> subscribed). The review artifact reads these
--   through the token-gated feed route, never directly.
-- - billboard_subscriptions: monthly wallet-credit subscriptions.
--   price_cents is snapshotted at purchase for the receipt; renewals
--   charge the PERMANENT price constant in lib/billboards/pricing.js
--   ($10 rotating / $25 solo CAD, permanent — not a launch price).
--   Paused subscriptions still hold their satellite for the ownership
--   cap (active + paused count; only cancelled frees it).

create table if not exists public.wallet_credit_balances (
  user_id uuid primary key,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  currency text not null default 'cad',
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('load', 'spend')),
  amount_cents integer not null check (amount_cents > 0),
  gross_cents integer not null check (gross_cents >= 0),
  stripe_fee_cents integer not null default 0 check (stripe_fee_cents >= 0),
  reference text not null unique,
  reason text not null default '',
  balance_after_cents integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.billboard_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requester_email text not null default '',
  company_name text not null check (char_length(company_name) between 1 and 80),
  link_url text not null check (char_length(link_url) between 1 and 2048),
  creative_type text not null check (creative_type in ('image', 'video')),
  creative_url text not null,
  plan text not null check (plan in ('rotating', 'solo')),
  preferred_number integer check (preferred_number between 1 and 44),
  assigned_number integer check (assigned_number between 1 and 44),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'subscribed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.billboard_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  plan text not null check (plan in ('rotating', 'solo')),
  billboard_number integer not null check (billboard_number between 1 and 44),
  company_name text not null,
  link_url text not null,
  creative_type text not null check (creative_type in ('image', 'video')),
  creative_url text not null,
  price_cents integer not null check (price_cents > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_credit_balances enable row level security;
alter table public.wallet_credit_transactions enable row level security;
alter table public.billboard_requests enable row level security;
alter table public.billboard_subscriptions enable row level security;

-- Nobody reads or writes these rows through RLS directly; the app
-- touches them only via service-role routes (same pattern as the
-- billboard_queue table). No select/insert/update/delete policies are
-- granted on purpose.

-- SETTLED PRICE RULE (Merlin, 2026-10-27): base $10 rotating / $25
-- solo CAD, with EXACTLY ONE override — at 1,000,000 registered users
-- prices become $50 rotating / $200 solo. Advance notice fires at
-- 990,000 registered users (in-app pop-up + email, with opt-out).
--
-- - billboard_price_state: single row (id 1) written ONLY by the daily
--   price-check cron from a verified Auth count. tier = 'million' at
--   >= 1,000,000, else 'base'. Purchase/renewal routes read this row;
--   they never count users inline and never trust a client tier claim.
-- - billboard_price_notices: one row per advertiser, claimed BEFORE
--   the email sends, so the notice fires exactly once per advertiser
--   even across retries. email_status: 'sent' | 'failed' |
--   'not_configured' (RESEND_API_KEY unset — retried on later runs).
--   acknowledged_at: set when the advertiser taps "Keep my ads" in the
--   pop-up (or cancels — cancellation also ends the pop-up, since the
--   subscription is gone).

create table if not exists public.billboard_price_state (
  id integer primary key,
  registered_users integer not null default 0 check (registered_users >= 0),
  tier text not null default 'base' check (tier in ('base', 'million')),
  checked_at timestamptz not null default now()
);

create table if not exists public.billboard_price_notices (
  user_id uuid primary key,
  sent_at timestamptz not null default now(),
  user_count_at_notice integer not null,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed', 'not_configured')),
  email_error text not null default '',
  acknowledged_at timestamptz
);

alter table public.billboard_price_state enable row level security;
alter table public.billboard_price_notices enable row level security;
-- Same service-role-only pattern: no RLS policies on purpose.
