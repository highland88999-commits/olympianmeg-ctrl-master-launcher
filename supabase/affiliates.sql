-- supabase/affiliates.sql
-- IN-HOUSE AFFILIATE PROGRAM (replaces impact.com brand-side fees).
--
-- Model (Merlin):
--   - Any signed-in user becomes an affiliate and gets a referral link/code.
--   - Attribution is by NEW USER SIGNUP: ?ref=CODE binds server-side at
--     account creation (aff_referrals), permanently. First binding wins.
--   - Commission = 10% of whatever the HOUSE earns on the purchase:
--       tickets -> house 10% of net -> affiliate 1% of net (90/9/1)
--       store / hermes / luge / gallery / fortress / world-engine /
--         persephone -> house 100% of net -> affiliate 10% of net
--       art -> house 0% today -> no commission (hook ready for later)
--   - No self-referral commission. $20 minimum payout threshold.
--   - v1: LEDGER ONLY. No payouts are created anywhere here.
--
-- Run in the Supabase SQL editor ONLY after Merlin's explicit green light
-- (standing Supabase workflow). Webhook affiliate hooks no-op safely until
-- these tables exist.

-- ============================================================ affiliate codes
create table if not exists public.aff_codes (
  code text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================ referrals (signup-bound attribution)
create table if not exists public.aff_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referred_email text not null default '',
  code_used text not null default '',
  created_at timestamptz not null default now(),
  -- No self-referral, ever.
  constraint aff_no_self_referral check (affiliate_user_id <> referred_user_id)
);
create index if not exists aff_referrals_affiliate_idx on public.aff_referrals (affiliate_user_id);
create index if not exists aff_referrals_email_idx on public.aff_referrals (referred_email);

-- ============================================================ product costs (true COGS)
-- Deterministic per-variant fulfillment costs, in the surface's currency.
-- Store: Printful v2 catalog prices (currency=CAD) — item base cost only;
-- order-level shipping is NOT included (flagged, varies per order).
-- A cost row is the single source of truth at webhook time. If a purchase
-- arrives for a product_key with no cost row, its commission goes to
-- 'pending_cost' (never silently accrued on the inflated base) and is
-- finalized by POST /api/affiliates/finalize-costs once the cost lands.
create table if not exists public.aff_product_costs (
  surface text not null,
  product_key text not null,
  cost_cents int not null check (cost_cents >= 0),
  currency text not null default 'CAD',
  source text not null default '',
  updated_at timestamptz not null default now(),
  primary key (surface, product_key)
);

-- ============================================================ commission ledger (surface-agnostic)
create table if not exists public.aff_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_id text not null,
  product_key text,
  purchase_net_cents int not null check (purchase_net_cents >= 0),
  house_margin_cents int not null check (house_margin_cents >= 0),
  commission_cents int not null check (commission_cents >= 0),
  status text not null default 'accrued'
    check (status in ('accrued', 'pending_cost', 'paid')),
  created_at timestamptz not null default now(),
  -- Idempotency: one commission per purchase per surface, forever.
  unique (source, source_id)
);
create index if not exists aff_commissions_affiliate_idx on public.aff_commissions (affiliate_user_id);
create index if not exists aff_commissions_status_idx on public.aff_commissions (status);

-- ============================================================ RLS
alter table public.aff_codes enable row level security;
alter table public.aff_referrals enable row level security;
alter table public.aff_commissions enable row level security;

-- Codes: a user reads their own code. Writes are service-role only.
drop policy if exists "aff_codes own read" on public.aff_codes;
create policy "aff_codes own read"
  on public.aff_codes for select
  using (auth.uid() = user_id);

-- Referrals: a user reads rows where they are the affiliate OR the referred.
-- Writes are service-role only (the bind API route).
drop policy if exists "aff_referrals own read" on public.aff_referrals;
create policy "aff_referrals own read"
  on public.aff_referrals for select
  using (auth.uid() = affiliate_user_id or auth.uid() = referred_user_id);

-- Commissions: NO public policies. Service-role API routes only.
-- The affiliate dashboard reads through /api/affiliates/overview, scoped
-- to the logged-in user server-side.

alter table public.aff_product_costs enable row level security;
-- Product costs: NO public policies. Service-role only (webhook lookups
-- and the Merlin-gated cost sync route).
