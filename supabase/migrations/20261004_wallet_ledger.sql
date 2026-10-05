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
--                        Fee transparency (Merlin's rule, 2026-10-04): user
--                        credits are NET of Stripe fees — the real fee is read
--                        from the charge's balance_transaction, never
--                        estimated. Merlin's platform fees stay whole.
--                        gross_cents        the earner's contractual gross share
--                        stripe_fee_cents   real Stripe fee deducted from it
--                        platform_fee_cents platform fee carved from this credit
--                        amount_cents (net) = max(0, gross - stripe - platform)
--                        enforced by wallet_transactions_fee_math_check below.
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

-- Transparent fee breakdown on every credit (Merlin's rule: user credits
-- are net of the REAL Stripe fee; platform fees to Merlin stay whole).
alter table public.wallet_transactions
  add column if not exists gross_cents int not null default 0;
alter table public.wallet_transactions
  add column if not exists stripe_fee_cents int not null default 0;
alter table public.wallet_transactions
  add column if not exists platform_fee_cents int not null default 0;

-- DB-level guard of the formula for credits:
--   amount_cents = max(0, gross_cents - stripe_fee_cents - platform_fee_cents)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass
      and conname = 'wallet_transactions_fee_math_check'
  ) then
    alter table public.wallet_transactions
      add constraint wallet_transactions_fee_math_check
      check (
        kind <> 'credit'
        or amount_cents = greatest(0, gross_cents - stripe_fee_cents - platform_fee_cents)
      );
  end if;
end $$;

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

-- ============================================================ Christmas
-- unlock ("doomsday") additions (2026-10-04). Wallets stay in an
-- ACCUMULATIVE state until Friday, December 11, 2026, 00:00
-- America/Edmonton (two weeks before Christmas) — 07:00 UTC, since
-- Edmonton is MST (UTC-7) in December. Then withdrawals unlock for all.
--
--   wallet_settings      global switches; withdrawals_locked_until seeds
--                        the lock timestamp (code falls back to the
--                        compiled constant if the row is missing — the
--                        lock is NEVER silently open).
--   payout_releases      Merlin's ONE explicit "release the Christmas
--                        queue". The autonomous payout queue processes
--                        itself only when at least one release row exists.
--                        One named confirmation -> autonomous run.
--   wallet_withdrawals   gains the 'paused-funds' status: the liquidity
--                        gate paused the queue honestly (platform Stripe
--                        balance short). The next run resumes automatically.
--   wallets              gains payout_destination (the user's Stripe
--                        Connect account id for autonomous payouts;
--                        label-only in the UI, full value service-side).

-- ------------------------------------------------------------- settings
create table if not exists public.wallet_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- No RLS policies: service-role only (users never read/write settings
-- directly; the public /api/wallet/lock route exposes the countdown).
alter table public.wallet_settings enable row level security;

insert into public.wallet_settings (key, value)
values ('withdrawals_locked_until', '2026-12-11T07:00:00Z')
on conflict (key) do nothing;

-- ------------------------------------------------------ payout releases
create table if not exists public.payout_releases (
  id uuid primary key default gen_random_uuid(),
  released_by_email text not null default '',
  note text not null default '',
  released_at timestamptz not null default now()
);

-- No RLS policies: service-role only (Merlin's release action + the cron).

-- --------------------------------- paused-funds status on withdrawals
-- The original migration used an inline check on status, so the
-- constraint name is auto-generated — drop ANY check mentioning status,
-- then re-add with the full lifecycle including 'paused-funds'.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.wallet_withdrawals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute 'alter table public.wallet_withdrawals drop constraint ' || quote_ident(c.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_withdrawals'::regclass
      and conname = 'wallet_withdrawals_status_check'
  ) then
    alter table public.wallet_withdrawals
      add constraint wallet_withdrawals_status_check
      check (status in ('requested', 'processing', 'completed', 'failed', 'canceled', 'paused-funds'));
  end if;
end $$;

-- ------------------------------------------------- payout destination
alter table public.wallets
  add column if not exists payout_destination text not null default '';
