-- supabase/redwater.sql
-- Redwater quicksand journey: Earth's core gold bar claims (Merlin's spec 2026-10-17).
--
-- Rules:
--   * Only 5 gold bar collects GLOBALLY, ever, across all users.
--   * olympiannexus@gmail.com and olympianmeg@gmail.com are EXEMPT (can never collect).
--   * One collect per user (unique user_id).
--   * The atomic claim lives in claim_redwater_core() so concurrent requests
--     can never overshoot the global cap.
--
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

-- ------------------------------------------------- gold collect ledger --
create table if not exists public.redwater_gold_collects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  collected_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists redwater_gold_collects_collected_idx
  on public.redwater_gold_collects (collected_at);

alter table public.redwater_gold_collects enable row level security;

-- Public can read the ledger (the counter is part of the game: "3 of 5 claimed").
drop policy if exists "redwater_gold_collects public read" on public.redwater_gold_collects;
create policy "redwater_gold_collects public read"
  on public.redwater_gold_collects
  for select
  using (true);

-- No client writes: only the service-role claim route mutates this table.

-- ------------------------------------------------- atomic claim RPC --
-- Returns one row: (success boolean, reason text).
-- reason: 'collected' | 'exempt' | 'already_collected' | 'exhausted'
create or replace function public.claim_redwater_core(p_user_id uuid, p_user_email text)
returns table (success boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Exemptions: the makers never collect.
  if lower(coalesce(p_user_email, '')) in ('olympiannexus@gmail.com', 'olympianmeg@gmail.com') then
    return query select false, 'exempt'::text;
    return;
  end if;

  -- One collect per user.
  if exists (select 1 from public.redwater_gold_collects where user_id = p_user_id) then
    return query select false, 'already_collected'::text;
    return;
  end if;

  -- Global cap: 5 collects, ever. Lock the table for the count so two
  -- concurrent claims can't both slip under the cap.
  lock table public.redwater_gold_collects in share row exclusive mode;
  select count(*) into v_count from public.redwater_gold_collects;
  if v_count >= 5 then
    return query select false, 'exhausted'::text;
    return;
  end if;

  insert into public.redwater_gold_collects (user_id, user_email)
  values (p_user_id, p_user_email);

  return query select true, 'collected'::text;
end;
$$;

-- Only the service role should execute the claim function directly.
revoke all on function public.claim_redwater_core(uuid, text) from public, anon, authenticated;
