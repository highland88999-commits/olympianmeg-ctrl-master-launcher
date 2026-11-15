-- supabase/souls.sql
-- SOULS — the underworld currency (Merlin, 2026-11-15, green-lit
-- purposes list, tranche 1: the design spine), as a real
-- server-side balance in the gold/aether economy's style.
--
-- *** NOT RUN *** — staged only, like supabase/aether.sql was
-- before it ran. Executes when Merlin gives the SQL green light.
-- Until it runs, the afterlife routes answer setupRequired and the
-- forge/guide actions pause honestly — nothing is fake-credited
-- and no soul is fake-banked.
--
-- WHY A SERVER LEDGER: Dutchman souls are device-local only (the
-- Flying Dutchman's ghost-voyage backpack, localStorage key
-- 'ghost-voyage-backpack-v1' — no server copy exists). A forge
-- cannot consume server-side souls it cannot see. This file creates
-- the canonical server store; the device-local Dutchman count
-- reconciles INTO it (reason 'souls:reconcile', one idempotency key
-- per device + nonce, so a lost response retries to the original
-- row instead of crediting twice). Mega souls are NOT reconciled
-- in tranche 1 — plain souls only.
--
-- Write model mirrors supabase/aether.sql exactly: the ledger is
-- append-only, ALL mutations go through soul_apply() with the
-- service-role key from server API routes, every mutation carries
-- an idempotency key and a reason, debits never take a balance
-- negative. soul_forge() does the Lake of Fire conversion (1 soul
-- -> 1 aether) atomically: the soul debit and the aether credit
-- land in ONE transaction, so a capped forge never eats a soul and
-- a failed soul debit never mints free aether. The forge honours
-- the SAME 40/day aether cap as the gold refinery: its credits
-- carry reason 'refinery:forge' in the 'refinery' cap group, so
-- gold-refined and soul-forged aether share one 40/day bucket.
-- (supabase/aether.sql must be live for soul_forge() — it ran
-- Nov 13 ~22:16. If it is ever missing, soul_forge() raises and
-- the route answers setupRequired.)

-- One row per mutation. delta > 0 = credit, delta < 0 = debit.
create table if not exists public.soul_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  idempotency_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists soul_ledger_user_idx on public.soul_ledger (user_id, created_at desc);
create index if not exists soul_ledger_reason_idx on public.soul_ledger (user_id, reason, created_at desc);

-- Current balance per user + the rebirth point, maintained by
-- soul_apply() / soul_set_respawn(). Read model for the UI.
create table if not exists public.soul_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  respawn_realm text,
  respawn_attuned_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.soul_ledger enable row level security;
alter table public.soul_balances enable row level security;

-- Clients read their own rows. No client insert/update/delete policies
-- exist on purpose: mutations happen server-side with the service-role key.
drop policy if exists soul_ledger_owner_read on public.soul_ledger;
create policy soul_ledger_owner_read
  on public.soul_ledger for select
  using (auth.uid() = user_id);

drop policy if exists soul_balances_owner_read on public.soul_balances;
create policy soul_balances_owner_read
  on public.soul_balances for select
  using (auth.uid() = user_id);

-- The single soul write path. Serializes per user (row lock),
-- enforces: 1. idempotency (an existing key returns the original
-- row); 2. no negative balances.
-- Returns one row: (entry_id, balance_after, was_duplicate, insufficient).
create or replace function public.soul_apply(
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
  v_existing public.soul_ledger%rowtype;
  v_balance integer := 0;
  v_new_id uuid;
  v_new_balance integer;
begin
  if p_delta = 0 then
    raise exception 'soul delta cannot be zero';
  end if;

  -- 1. Idempotency: key already seen -> return the original entry.
  select * into v_existing
  from public.soul_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.balance_after, true, false;
    return;
  end if;

  -- Lock the user's balance row for this transaction (create it if missing).
  insert into public.soul_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance into v_balance
  from public.soul_balances
  where user_id = p_user_id
  for update;

  -- 2. No negative balances.
  v_new_balance := v_balance + p_delta;
  if v_new_balance < 0 then
    return query select null::uuid, v_balance, false, true;
    return;
  end if;

  insert into public.soul_ledger (user_id, delta, balance_after, reason, idempotency_key, meta)
  values (p_user_id, p_delta, v_new_balance, p_reason, p_idempotency_key, p_meta)
  returning id into v_new_id;

  update public.soul_balances
  set balance = v_new_balance, updated_at = now()
  where user_id = p_user_id;

  return query select v_new_id, v_new_balance, false, false;
end;
$$;

-- THE LAKE OF FIRE, in one transaction: 1 soul -> 1 aether.
--   1. Idempotency on the forge key (a retried cast returns the
--      original result, never a second soul).
--   2. The soul balance must hold at least 1 (else insufficient —
--      nothing is written).
--   3. The shared 40/day aether cap: today's 'refinery:%' credits
--      (gold refinery + soul forge together) must stay under 40.
--      When the cap is spent, the forge answers capped and NOTHING
--      is written — the soul stays with its owner.
--   4. Otherwise the soul debit and the aether credit land together
--      (the aether leg goes through aether_apply() with the same
--      'refinery' cap group, so the cap is enforced twice over —
--      once by the check here, once by aether_apply itself).
-- Returns one row: (soul_balance_after, aether_balance_after,
-- was_duplicate, capped, insufficient).
create or replace function public.soul_forge(
  p_user_id uuid,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  soul_balance_after integer,
  aether_balance_after integer,
  was_duplicate boolean,
  capped boolean,
  insufficient boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.soul_ledger%rowtype;
  v_soul_balance integer := 0;
  v_aether_today integer := 0;
  v_aether_result record;
  v_soul_entry uuid;
begin
  -- 1. Idempotency: a retried cast returns the original outcome.
  select * into v_existing
  from public.soul_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    return query select
      v_existing.balance_after,
      (select balance from public.aether_balances where user_id = p_user_id),
      true, false, false;
    return;
  end if;

  -- Lock the user's soul row (create it if missing).
  insert into public.soul_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
  select balance into v_soul_balance
  from public.soul_balances
  where user_id = p_user_id
  for update;

  -- 2. A soul to cast?
  if v_soul_balance < 1 then
    return query select v_soul_balance, (select balance from public.aether_balances where user_id = p_user_id), false, false, true;
    return;
  end if;

  -- 3. The shared 40/day aether cap (gold refinery + soul forge).
  select coalesce(sum(delta), 0) into v_aether_today
  from public.aether_ledger
  where user_id = p_user_id
    and reason like 'refinery:%'
    and created_at >= date_trunc('day', now());
  if v_aether_today >= 40 then
    return query select v_soul_balance, (select balance from public.aether_balances where user_id = p_user_id), false, true, false;
    return;
  end if;

  -- 4. The aether leg first, through aether_apply() (same cap group,
  -- same limit — the cap is enforced twice over). A capped answer
  -- raises here so the whole transaction rolls back: the soul debit
  -- below never lands.
  select * into v_aether_result
  from public.aether_apply(
    p_user_id,
    1,
    'refinery:forge',
    p_idempotency_key,
    p_meta,
    'refinery',
    40
  );
  if v_aether_result.capped then
    raise exception 'aether daily cap reached';
  end if;
  if v_aether_result.insufficient then
    raise exception 'aether credit failed';
  end if;

  -- The soul debit (same idempotency key family — the ledger row
  -- carries the forge key, so step 1 finds it on retry).
  insert into public.soul_ledger (user_id, delta, balance_after, reason, idempotency_key, meta)
  values (p_user_id, -1, v_soul_balance - 1, 'forge:cast', p_idempotency_key, p_meta)
  returning id into v_soul_entry;

  update public.soul_balances
  set balance = v_soul_balance - 1, updated_at = now()
  where user_id = p_user_id;

  return query select v_soul_balance - 1, v_aether_result.balance_after, false, false, false;
end;
$$;

-- Record the player's rebirth point (the Wheel of Rebirth).
-- Upserts the profile row; never touches the soul balance.
-- Returns one row: (respawn_realm, respawn_attuned_at).
create or replace function public.soul_set_respawn(
  p_user_id uuid,
  p_realm text
)
returns table (
  respawn_realm text,
  respawn_attuned_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attuned timestamptz := now();
begin
  insert into public.soul_balances (user_id, balance, respawn_realm, respawn_attuned_at)
  values (p_user_id, 0, p_realm, v_attuned)
  on conflict (user_id) do update
    set respawn_realm = excluded.respawn_realm,
        respawn_attuned_at = excluded.respawn_attuned_at,
        updated_at = now();
  return query select p_realm, v_attuned;
end;
$$;
