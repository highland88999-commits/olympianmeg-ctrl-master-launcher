-- supabase/gallery.sql
-- GALLERY — download-credit ledger for the Museum pay-per-download gallery.
-- Run in the Supabase SQL editor. Idempotent.
--
-- Commerce model: C$1.00 = 10 download credits, 1 credit = 1 full-resolution
-- download ($0.10/image — Stripe's ~$0.50 minimum charge makes a literal
-- $0.10 charge impossible, hence credits). Credits are bought through
-- Stripe Checkout; the gallery webhook credits the account on
-- checkout.session.completed. Downloads are served through a signed,
-- expiring token after 1 credit is redeemed — no direct file URLs.
--
-- Write model: the ledger is append-only. ALL mutations go through the
-- gallery_credit_apply() function below, called with the service-role key
-- from server API routes. Clients can read their own balance/ledger; they
-- can never write. Every mutation carries an idempotency key (unique) and
-- a reason.

-- Current credit balance per user, maintained by gallery_credit_apply().
create table if not exists public.gallery_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- One row per mutation. delta > 0 = credit, delta < 0 = debit.
create table if not exists public.gallery_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  idempotency_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gallery_ledger_user_idx on public.gallery_ledger (user_id, created_at desc);

-- One row per redeemed download: the reuse license was granted with the
-- credit redemption. Tokens are verified server-side at download time.
create table if not exists public.gallery_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  item_title text,
  redeemed_at timestamptz not null default now(),
  license_version text not null default 'v1'
);
create index if not exists gallery_downloads_user_idx on public.gallery_downloads (user_id, redeemed_at desc);

alter table public.gallery_balances enable row level security;
alter table public.gallery_ledger enable row level security;
alter table public.gallery_downloads enable row level security;

-- Clients read their own rows. No client insert/update/delete policies exist
-- on purpose: mutations happen server-side with the service-role key.
drop policy if exists gallery_balances_owner_read on public.gallery_balances;
create policy gallery_balances_owner_read
  on public.gallery_balances for select
  using (auth.uid() = user_id);

drop policy if exists gallery_ledger_owner_read on public.gallery_ledger;
create policy gallery_ledger_owner_read
  on public.gallery_ledger for select
  using (auth.uid() = user_id);

drop policy if exists gallery_downloads_owner_read on public.gallery_downloads;
create policy gallery_downloads_owner_read
  on public.gallery_downloads for select
  using (auth.uid() = user_id);

-- The single write path. Serializes per user (row lock), enforces:
--   1. idempotency: an existing idempotency_key returns the original row,
--      nothing is applied twice (safe against Stripe webhook retries and
--      double-click redeems);
--   2. no negative balances: debits that would go below zero are refused
--      (insufficient = true, nothing written).
-- Returns one row: (entry_id, balance_after, was_duplicate, insufficient).
create or replace function public.gallery_credit_apply(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  entry_id uuid,
  balance_after integer,
  was_duplicate boolean,
  insufficient boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.gallery_ledger%rowtype;
  v_balance integer;
begin
  if p_delta = 0 then
    raise exception 'delta must be non-zero';
  end if;

  -- Lock the user's balance row (create if missing) so concurrent
  -- applies serialize instead of racing.
  insert into public.gallery_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select gb.balance into v_balance
  from public.gallery_balances gb
  where gb.user_id = p_user_id
  for update;

  -- Idempotency first: a repeated key is a no-op that reports the truth.
  select * into v_existing
  from public.gallery_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after, true, false;
    return;
  end if;

  if v_balance + p_delta < 0 then
    return query select null::uuid, v_balance, false, true;
    return;
  end if;

  v_balance := v_balance + p_delta;

  update public.gallery_balances
  set balance = v_balance, updated_at = now()
  where user_id = p_user_id;

  insert into public.gallery_ledger (user_id, delta, balance_after, reason, idempotency_key, meta)
  values (p_user_id, p_delta, v_balance, p_reason, p_idempotency_key, coalesce(p_meta, '{}'::jsonb))
  returning id into v_existing.id;

  return query select v_existing.id, v_balance, false, false;
end;
$$;
