-- ============================================================
-- Forge → Profile → Auction House → Backpack
-- CLEAN COPY FOR REVIEW — NOT EXECUTED
-- Date: 2026-10-06
--
-- What this does:
-- 1. world_engine_assets: user-chosen display names, listing flags,
--    and owner UPDATE policy (rename / list / delist from client).
-- 2. auction_listings: real listings created FROM profile assets.
--    Supports timed auctions, fixed buy-now, or both on one listing.
--    Payment: wallet balance OR Stripe (per-bid auth holds).
-- 3. auction_bids: every bid, wallet-held or Stripe-authorized.
-- 4. auction_sales: trophy/provenance record — winner gets the full
--    working item (generation_params re-renderable, backpack-ready)
--    PLUS this permanent record of the sale.
-- 5. backpack_items: items called into the game backpack from the
--    profile (weapons, objects, etc. for use in games like ENYO).
-- ============================================================

-- ------------------------------------------------- 1. asset upgrades --
alter table public.world_engine_assets
  add column if not exists display_name text,
  add column if not exists is_listed boolean not null default false,
  add column if not exists listing_type text not null default 'none'
    check (listing_type in ('none', 'auction', 'fixed', 'both')),
  add column if not exists starting_bid_cents integer check (starting_bid_cents is null or starting_bid_cents >= 0),
  add column if not exists buy_now_price_cents integer check (buy_now_price_cents is null or buy_now_price_cents >= 0);

-- Backfill display names from the auto-generated names.
update public.world_engine_assets
  set display_name = name
  where display_name is null;

alter table public.world_engine_assets
  alter column display_name set not null;

-- Owner UPDATE: rename, list, delist, price — client-side allowed.
drop policy if exists "world_engine_assets own update" on public.world_engine_assets;
create policy "world_engine_assets own update"
  on public.world_engine_assets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------- 2. auction listings --
create table if not exists public.auction_listings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.world_engine_assets (id) on delete cascade,
  seller_id uuid not null,
  category text not null,
  title text not null,
  description text,
  listing_type text not null default 'auction'
    check (listing_type in ('auction', 'fixed', 'both')),
  starting_bid_cents integer not null default 0 check (starting_bid_cents >= 0),
  buy_now_price_cents integer check (buy_now_price_cents is null or buy_now_price_cents >= 0),
  current_bid_cents integer not null default 0 check (current_bid_cents >= 0),
  current_bidder_id uuid,
  status text not null default 'live'
    check (status in ('live', 'sold', 'closed', 'cancelled')),
  ends_at timestamptz,          -- null = no timed end (fixed-price only)
  created_at timestamptz not null default now(),
  sold_at timestamptz
);

alter table public.auction_listings enable row level security;

-- Public can read LIVE listings only. Everything else is seller/private.
drop policy if exists "auction_listings public live read" on public.auction_listings;
create policy "auction_listings public live read"
  on public.auction_listings
  for select
  using (status = 'live');

drop policy if exists "auction_listings seller read" on public.auction_listings;
create policy "auction_listings seller read"
  on public.auction_listings
  for select
  using (auth.uid() = seller_id);

-- No client writes: all listing/bid/settle writes go through server API
-- routes using the service-role key (same pattern as HERMES listings).

-- ------------------------------------------------- 3. auction bids --
create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.auction_listings (id) on delete cascade,
  bidder_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  pay_method text not null default 'wallet'
    check (pay_method in ('wallet', 'stripe')),
  -- wallet: funds moved to held_cents at bid time.
  -- stripe: payment_intent id of the manual-capture authorization hold.
  stripe_payment_intent_id text,
  status text not null default 'active'
    check (status in ('active', 'outbid', 'won', 'refunded', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.auction_bids enable row level security;

-- Bidders see their own bids; public sees active bids on live listings
-- (so the bid history / current price is transparent).
drop policy if exists "auction_bids own read" on public.auction_bids;
create policy "auction_bids own read"
  on public.auction_bids
  for select
  using (auth.uid() = bidder_id);

drop policy if exists "auction_bids public live read" on public.auction_bids;
create policy "auction_bids public live read"
  on public.auction_bids
  for select
  using (
    status = 'active'
    and exists (
      select 1 from public.auction_listings l
      where l.id = auction_bids.listing_id and l.status = 'live'
    )
  );

-- No client writes: bids are placed via POST /api/auction/bid (server).

-- ------------------------------------------------- 4. sales / trophy records --
create table if not exists public.auction_sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.auction_listings (id) on delete set null,
  asset_id uuid not null references public.world_engine_assets (id) on delete set null,
  seller_id uuid not null,
  buyer_id uuid not null,
  sale_price_cents integer not null check (sale_price_cents > 0),
  sale_type text not null check (sale_type in ('auction', 'buy_now')),
  pay_method text not null check (pay_method in ('wallet', 'stripe')),
  platform_fee_cents integer not null default 100,   -- $1.00 to Merlin
  -- Snapshot of the item at sale time: the working params travel with the
  -- asset row itself (ownership transfer); this jsonb is the permanent
  -- provenance/trophy record even if the asset is later deleted.
  item_snapshot jsonb,
  created_at timestamptz not null default now()
);

alter table public.auction_sales enable row level security;

drop policy if exists "auction_sales parties read" on public.auction_sales;
create policy "auction_sales parties read"
  on public.auction_sales
  for select
  using (auth.uid() = seller_id or auth.uid() = buyer_id);

-- No client writes: created by POST /api/auction/settle (server).

-- ------------------------------------------------- 5. backpack --
create table if not exists public.backpack_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null references public.world_engine_assets (id) on delete cascade,
  slot text,                       -- e.g. 'primary', 'secondary', 'gadget' — game-defined
  equipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, asset_id)
);

alter table public.backpack_items enable row level security;

drop policy if exists "backpack_items own read" on public.backpack_items;
create policy "backpack_items own read"
  on public.backpack_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "backpack_items own insert" on public.backpack_items;
create policy "backpack_items own insert"
  on public.backpack_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "backpack_items own update" on public.backpack_items;
create policy "backpack_items own update"
  on public.backpack_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "backpack_items own delete" on public.backpack_items;
create policy "backpack_items own delete"
  on public.backpack_items
  for delete
  using (auth.uid() = user_id);

-- Helpful indexes
create index if not exists idx_auction_listings_status on public.auction_listings (status);
create index if not exists idx_auction_listings_live on public.auction_listings (status, ends_at) where status = 'live';
create index if not exists idx_auction_bids_listing on public.auction_bids (listing_id);
create index if not exists idx_backpack_user on public.backpack_items (user_id);
create index if not exists idx_assets_user_category on public.world_engine_assets (user_id, category);

-- 2026-10-06 follow-up: store the original forge prompt with each creation
-- so profiles can show it in an expandable "View prompt" section.
alter table public.world_engine_assets
  add column if not exists prompt text;
