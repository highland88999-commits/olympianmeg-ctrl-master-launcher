-- supabase/gold.sql
-- GOLD — the in-house credit economy ledger.
-- Run in the Supabase SQL editor. Idempotent.
--
-- Gold is store credit: earned by playing (Liquid Gold mining) and by spending
-- time in the app (engagement heartbeat), spent as dollars-off at checkout.
-- Gold can NEVER be bought, cashed out, transferred, or converted to crypto —
-- there is no cash-out path by design.
--
-- Write model: the ledger is append-only. ALL mutations go through the
-- gold_apply() function below, called with the service-role key from server
-- API routes. Clients can read their own balance/ledger; they can never
-- write. Every mutation carries an idempotency key (unique) and a reason.

-- One row per mutation. delta > 0 = credit, delta < 0 = debit.
create table if not exists public.gold_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  idempotency_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gold_ledger_user_idx on public.gold_ledger (user_id, created_at desc);
create index if not exists gold_ledger_reason_idx on public.gold_ledger (user_id, reason, created_at desc);

-- Current balance per user, maintained by gold_apply(). Read model for the UI.
create table if not exists public.gold_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.gold_ledger enable row level security;
alter table public.gold_balances enable row level security;

-- Clients read their own rows. No client insert/update/delete policies exist
-- on purpose: mutations happen server-side with the service-role key.
drop policy if exists gold_ledger_owner_read on public.gold_ledger;
create policy gold_ledger_owner_read
  on public.gold_ledger for select
  using (auth.uid() = user_id);

drop policy if exists gold_balances_owner_read on public.gold_balances;
create policy gold_balances_owner_read
  on public.gold_balances for select
  using (auth.uid() = user_id);

-- The single write path. Serializes per user (row lock), enforces:
--   1. idempotency: an existing idempotency_key returns the original row,
--      nothing is applied twice;
--   2. no negative balances: debits that would go below zero are refused;
--   3. optional daily cap for a reason group ('engagement' / 'mining'):
--      reason LIKE '<group>:%' sums for the current UTC day must stay under
--      the limit.
-- Returns one row: (entry_id, balance_after, was_duplicate, capped, insufficient).
create or replace function public.gold_apply(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb,
  p_cap_group text default null,
  p_cap_limit integer default null
)
returns table (
  entry_id uuid,
  balance_after integer,
  was_duplicate boolean,
  capped boolean,
  insufficient boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.gold_ledger%rowtype;
  v_balance integer := 0;
  v_capped_sum integer := 0;
  v_new_id uuid;
  v_new_balance integer;
begin
  if p_delta = 0 then
    raise exception 'gold delta cannot be zero';
  end if;

  -- 1. Idempotency: key already seen -> return the original entry.
  select * into v_existing
  from public.gold_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after, true, false, false;
    return;
  end if;

  -- Lock the user's balance row for this transaction (create it if missing).
  insert into public.gold_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance into v_balance
  from public.gold_balances
  where user_id = p_user_id
  for update;

  -- 2. Daily cap for the reason group (counts today's positive deltas only).
  if p_cap_group is not null and p_cap_limit is not null and p_delta > 0 then
    select coalesce(sum(delta), 0) into v_capped_sum
    from public.gold_ledger
    where user_id = p_user_id
      and reason like p_cap_group || ':%'
      and created_at >= date_trunc('day', now());
    if v_capped_sum + p_delta > p_cap_limit then
      return query select null::uuid, v_balance, false, true, false;
      return;
    end if;
  end if;

  -- 3. No negative balances.
  v_new_balance := v_balance + p_delta;
  if v_new_balance < 0 then
    return query select null::uuid, v_balance, false, false, true;
    return;
  end if;

  v_new_id := gen_random_uuid();
  insert into public.gold_ledger (id, user_id, delta, balance_after, reason, idempotency_key, meta)
  values (v_new_id, p_user_id, p_delta, v_new_balance, p_reason, p_idempotency_key, coalesce(p_meta, '{}'::jsonb));

  update public.gold_balances
  set balance = v_new_balance, updated_at = now()
  where user_id = p_user_id;

  return query select v_new_id, v_new_balance, false, false, false;
end;
$$;

-- Retention notes (for Merlin, when this folds into the final consolidation):
-- * The ledger is the audit trail for real money-off value. Keep it.
-- * If the table ever grows unwieldy, archive (don't delete) rows older than
--   24 months to cold storage; balances are unaffected (gold_balances holds
--   the current truth).
-- * No PII lives here beyond user_id — safe under the same policy as the
--   other module tables.
