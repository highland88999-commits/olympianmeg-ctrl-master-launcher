-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- Fortress of Solitude storage tiers + share links. Folds into the final
-- consolidated SQL once the Takeout mining freeze lifts (per Merlin's
-- directive: one structured prompt, not per-module). Until then:
--   - the checkout route fails honestly when a tier has no Stripe price;
--   - the Stripe webhook upserts fortress_quotas with the service role
--     (tier, quota_bytes, Stripe ids — never resetting used_bytes);
--   - the share API uses the service role for public token verification;
--   - the UI treats a missing quota row as the free 1 GB tier.
-- ============================================================================

-- Per-user vault storage accounting. quota_bytes is the allowance,
-- used_bytes is what's actually stored (incremented on every successful
-- store, decremented on every delete, never below zero). Only the server
-- (webhook / quota API, service role) writes this table.
create table if not exists public.fortress_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free'
    check (tier in ('free', '50gb', '250gb', '1tb', '5tb')),
  quota_bytes bigint not null default 1000000000
    check (quota_bytes > 0),
  used_bytes bigint not null default 0
    check (used_bytes >= 0),
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Time-limited bearer share links into a vault file. Tokens are random
-- UUIDs, verified (with expiry) by the public share endpoint.
create table if not exists public.fortress_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists fortress_shares_token_idx
  on public.fortress_shares (token);
create index if not exists fortress_shares_owner_idx
  on public.fortress_shares (owner_id);

-- RLS: quotas are read-only for their owner (only the webhook / server
-- writes); shares are owner-only (the public endpoint verifies tokens
-- server-side with the service role, never through RLS).
alter table public.fortress_quotas enable row level security;
alter table public.fortress_shares enable row level security;

drop policy if exists fortress_quotas_owner_read on public.fortress_quotas;
create policy fortress_quotas_owner_read
  on public.fortress_quotas for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists fortress_shares_owner_select on public.fortress_shares;
create policy fortress_shares_owner_select
  on public.fortress_shares for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists fortress_shares_owner_insert on public.fortress_shares;
create policy fortress_shares_owner_insert
  on public.fortress_shares for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists fortress_shares_owner_delete on public.fortress_shares;
create policy fortress_shares_owner_delete
  on public.fortress_shares for delete
  to authenticated
  using (auth.uid() = owner_id);
