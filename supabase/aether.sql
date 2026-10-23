-- supabase/aether.sql
-- AETHER — the platform's true currency (Merlin, 2026-10-22), as a real
-- server-side balance in the gold economy's style.
--
-- *** NOT RUN *** — staged only, like supabase/refinery.sql. Executes
-- when Merlin gives the SQL green light. Until it runs, the aether
-- routes answer setupRequired and the refinery's aether conversions
-- pause honestly — nothing is fake-credited.
--
-- Until now aether existed only as local counters: Earth 1's interior
-- pickups (lib/earth/aether.js, a collected-set in localStorage) and
-- Earth 2's Dracula's Exchange tally (lib/earth2/blood-sacs.js, also
-- local). This file creates the canonical server store those surfaces
-- can unify onto later (a separate step — not part of this file).
--
-- Write model mirrors supabase/gold.sql exactly: the ledger is
-- append-only, ALL mutations go through aether_apply() with the
-- service-role key from server API routes, every mutation carries an
-- idempotency key and a reason, debits never take a balance negative,
-- and an optional per-day cap can be enforced per reason group
-- (reason LIKE '<group>:%').

-- One row per mutation. delta > 0 = credit, delta < 0 = debit.
create table if not exists public.aether_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  idempotency_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists aether_ledger_user_idx on public.aether_ledger (user_id, created_at desc);
create index if not exists aether_ledger_reason_idx on public.aether_ledger (user_id, reason, created_at desc);

-- Current balance per user, maintained by aether_apply(). Read model for the UI.
create table if not exists public.aether_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.aether_ledger enable row level security;
alter table public.aether_balances enable row level security;

-- Clients read their own rows. No client insert/update/delete policies
-- exist on purpose: mutations happen server-side with the service-role key.
drop policy if exists aether_ledger_owner_read on public.aether_ledger;
create policy aether_ledger_owner_read
  on public.aether_ledger for select
  using (auth.uid() = user_id);

drop policy if exists aether_balances_owner_read on public.aether_balances;
create policy aether_balances_owner_read
  on public.aether_balances for select
  using (auth.uid() = user_id);

-- The single write path. Serializes per user (row lock), enforces:
--   1. idempotency: an existing idempotency_key returns the original row;
--   2. no negative balances;
--   3. optional daily cap for a reason group: reason LIKE '<group>:%'
--      sums for the current UTC day must stay under the limit.
-- Returns one row: (entry_id, balance_after, was_duplicate, capped, insufficient).
create or replace function public.aether_apply(
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
  v_existing public.aether_ledger%rowtype;
  v_balance integer := 0;
  v_capped_sum integer := 0;
  v_new_id uuid;
  v_new_balance integer;
begin
  if p_delta = 0 then
    raise exception 'aether delta cannot be zero';
  end if;

  -- 1. Idempotency: key already seen -> return the original entry.
  select * into v_existing
  from public.aether_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after, true, false, false;
    return;
  end if;

  -- Lock the user's balance row for this transaction (create it if missing).
  insert into public.aether_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance into v_balance
  from public.aether_balances
  where user_id = p_user_id
  for update;

  -- 2. Daily cap for the reason group (counts today's positive deltas only).
  if p_cap_group is not null and p_cap_limit is not null and p_delta > 0 then
    select coalesce(sum(delta), 0) into v_capped_sum
    from public.aether_ledger
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
  insert into public.aether_ledger (id, user_id, delta, balance_after, reason, idempotency_key, meta)
  values (v_new_id, p_user_id, p_delta, v_new_balance, p_reason, p_idempotency_key, coalesce(p_meta, '{}'::jsonb));

  update public.aether_balances
  set balance = v_new_balance, updated_at = now()
  where user_id = p_user_id;

  return query select v_new_id, v_new_balance, false, false, false;
end;
$$;
