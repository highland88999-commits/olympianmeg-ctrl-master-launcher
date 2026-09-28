-- supabase/luge.sql
-- LUGE: Complete Arsenal ownership, Stripe idempotency, hoodie redemptions.
-- Run in the Supabase SQL editor. Idempotent.

-- Which premium sleds each user owns (granted by the Stripe webhook).
create table if not exists public.luge_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  sled_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, sled_id)
);
create index if not exists luge_inventory_user_idx on public.luge_inventory (user_id);

-- Processed Stripe events, so webhook retries never double-grant.
create table if not exists public.luge_stripe_events (
  stripe_event_id text primary key,
  created_at timestamptz not null default now()
);

-- One hoodie redemption per user.
create table if not exists public.luge_redemptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

alter table public.luge_inventory enable row level security;
alter table public.luge_stripe_events enable row level security;
alter table public.luge_redemptions enable row level security;

-- Users can read their own inventory and redemption. No client writes —
-- grants and redemptions happen server-side with the service-role key
-- (checkout webhook, claim API).
drop policy if exists luge_inventory_owner_read on public.luge_inventory;
create policy luge_inventory_owner_read
  on public.luge_inventory for select
  using (auth.uid() = user_id);

drop policy if exists luge_redemptions_owner_read on public.luge_redemptions;
create policy luge_redemptions_owner_read
  on public.luge_redemptions for select
  using (auth.uid() = user_id);

-- luge_stripe_events: no client access at all (webhook-only table).
