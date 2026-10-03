-- supabase/connect.sql
-- STRIPE CONNECT: payouts for the in-house affiliate program AND
-- PerSymphony performer payouts (Merlin's order, 2026-10-03).
--
-- Model:
--   - One Express connected account per user (connect_accounts, keyed by
--     user_id). Onboarding status: none -> pending -> ready.
--   - Payouts are MANUAL ONLY: Merlin triggers POST /api/connect/payout-run.
--     No cron, no automatic transfers, ever.
--   - Dry-run by default: lists who would be paid. confirm:true executes:
--     one Stripe Transfer per payee (idempotent on idempotency_key), then
--     affiliate commission rows flip to 'paid'; performer payouts are
--     recorded in connect_payouts (unpaid = ledger total - paid payouts).
--   - Threshold: wallets >= $20 (2000c) with a ready Connect account.
--
-- Run ONLY after Merlin's explicit green light (standing Supabase workflow).

-- ============================================================ connect accounts
create table if not exists public.connect_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text unique,
  onboarding_status text not null default 'none'
    check (onboarding_status in ('none', 'pending', 'ready')),
  connect_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================ payout history
-- One row per executed payout (per payee per run). The idempotency_key
-- makes retries safe: a repeated payout-run never double-pays.
create table if not exists public.connect_payouts (
  id uuid primary key default gen_random_uuid(),
  payee_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('affiliate', 'performer')),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'cad',
  stripe_transfer_id text,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists connect_payouts_payee_idx
  on public.connect_payouts (payee_user_id);

-- ============================================================ RLS
-- No public policies on either table: every read/write goes through
-- service-role API routes scoped server-side to the logged-in user
-- (or to Merlin for the payout-run). The no-leak rule: no user ever
-- sees another user's payout account or history.
alter table public.connect_accounts enable row level security;
alter table public.connect_payouts enable row level security;
