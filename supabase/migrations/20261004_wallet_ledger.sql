-- supabase/migrations/20261004_wallet_ledger.sql
-- Unified in-house wallet ledger (2026-10-04).
--
-- Every user gets one wallet on their account. Programs pay cuts INTO it
-- (replaces per-program Stripe Connect for earnings); users spend it
-- in-ecosystem or withdraw it to their bank (Stripe rail, Merlin releases).
--
-- Tables:
--   wallets              one row per user: balance_cents, held_cents, currency
--   wallet_transactions  every movement, ALWAYS timestamped (created_at),
--                        reference UNIQUE for idempotency (no double-credit)
--   wallet_withdrawals   cash-out requests: requested -> processing ->
--                        completed | failed | canceled. destination_label
--                        carries last4/label ONLY — never full details.
--
-- Money rules enforced here:
--   * balance_cents / held_cents never negative (check constraints)
--   * available = balance_cents - held_cents (computed in code)
--   * RLS: users SELECT only their own rows; all writes service-role only
--
-- Idempotent: every statement guarded. NOT EXECUTED — Merlin green-lights
-- SQL separately.
--
-- NOTE: wallets.user_id references public.user_profiles(id); in this
-- project user_profiles.id IS the auth user id, so auth.uid() = user_id
-- holds for the RLS policies below.

-- ---------------------------------------------------------------- wallets
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id) on delete cascade,
  balance_cents int not null default 0 check (balance_cents >= 0),
  held_cents int not null default 0 check (held_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallets_user_id_idx on public.wallets (user_id);

-- Keep updated_at honest without trusting writers.
drop trigger if exists wallets_touch_updated_at on public.wallets;
create or replace function public.wallets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger wallets_touch_updated_at
  before update on public.wallets
  for each row execute function public.wallets_touch_updated_at();

-- ------------------------------------------------------ wallet_transactions
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null check (kind in ('credit', 'debit')),
  amount_cents int not null check (amount_cents > 0),
  program text not null default '',
  reason text not null default '',
  reference text unique,
  balance_after_cents int not null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_user_time_idx
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_program_idx
  on public.wallet_transactions (program);

-- ------------------------------------------------------- wallet_withdrawals
create table if not exists public.wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'completed', 'failed', 'canceled')),
  destination_label text not null default '',
  stripe_transfer_id text,
  note text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists wallet_withdrawals_status_time_idx
  on public.wallet_withdrawals (status, created_at desc);
create index if not exists wallet_withdrawals_user_idx
  on public.wallet_withdrawals (user_id);

-- ---------------------------------------------------------------------- RLS
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_withdrawals enable row level security;

-- Users read ONLY their own rows. No insert/update/delete policies for
-- anon/authenticated: writes go through the service-role API routes only.
drop policy if exists wallets_read_own on public.wallets;
create policy wallets_read_own
  on public.wallets for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists wallet_transactions_read_own on public.wallet_transactions;
create policy wallet_transactions_read_own
  on public.wallet_transactions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists wallet_withdrawals_read_own on public.wallet_withdrawals;
create policy wallet_withdrawals_read_own
  on public.wallet_withdrawals for select to authenticated
  using (auth.uid() = user_id);
