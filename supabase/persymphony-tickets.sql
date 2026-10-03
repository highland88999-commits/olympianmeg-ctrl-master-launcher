-- supabase/persymphony-tickets.sql
-- PERSYMPHONY TICKETS: performers sell tickets to viewers, in-house.
--
-- Business model (Merlin):
--   - Performers set their own ticket prices; tickets are distributed by the
--     performer (shareable links) and by the platform (marketplace listing).
--   - Sales happen outside the house (no login required to buy) and in-house
--     via performer profiles on olympusverse.com.
--   - Viewers provide their ticket number at entry; the gate validates it.
--   - Platform fee: 10% of performer NET profit per show.
--     v1: net profit = ticket revenue - Stripe processing fees.
--     Performer keeps 90%. LEDGER ONLY in v1 — no payouts (Stripe Connect
--     Express is a later phase, do not build it here).
--
-- Any performance type is allowed (free text: music, comedy, theater, dance,
-- livestream, talk, anything). Venue types: physical / virtual / livestream /
-- hybrid. Ticketing, pricing, distribution, and the 10%-of-net ledger work
-- identically across all venue types; only the entry payload adapts.
--
-- Run this in the Supabase SQL editor ONLY after Merlin's explicit green light
-- (standing Supabase workflow). The API routes answer with an honest 503
-- until these tables exist.

-- ============================================================ performers
create table if not exists public.ps_performers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists ps_performers_user_idx on public.ps_performers (user_id);

-- ============================================================ shows
create table if not exists public.ps_shows (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.ps_performers(id) on delete cascade,
  title text not null,
  description text not null default '',
  performance_type text not null default 'music',
  starts_at timestamptz not null,
  venue_type text not null check (venue_type in ('physical', 'virtual', 'livestream', 'hybrid')),
  venue_name text not null default '',
  venue_address text not null default '',
  venue_capacity int,
  arena_id text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'live', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ps_shows_performer_idx on public.ps_shows (performer_id);
create index if not exists ps_shows_status_idx on public.ps_shows (status);
create index if not exists ps_shows_starts_idx on public.ps_shows (starts_at);

-- ============================================================ show secrets (service-role only)
-- stream_url is NEVER publicly readable; revealed only after ticket validation.
create table if not exists public.ps_show_secrets (
  show_id uuid primary key references public.ps_shows(id) on delete cascade,
  stream_url text not null default ''
);

-- ============================================================ ticket tiers
create table if not exists public.ps_ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.ps_shows(id) on delete cascade,
  name text not null,
  price_cents int not null check (price_cents >= 0),
  quantity int not null check (quantity > 0),
  sold_count int not null default 0 check (sold_count >= 0),
  created_at timestamptz not null default now(),
  constraint ps_tier_no_oversell check (sold_count <= quantity)
);
create index if not exists ps_tiers_show_idx on public.ps_ticket_tiers (show_id);

-- ============================================================ tickets
create table if not exists public.ps_tickets (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.ps_shows(id) on delete cascade,
  tier_id uuid not null references public.ps_ticket_tiers(id) on delete restrict,
  ticket_number text not null unique,
  buyer_name text not null default '',
  buyer_email text not null default '',
  buyer_user_id uuid references auth.users(id) on delete set null,
  stripe_session_id text not null,
  amount_cents int not null check (amount_cents >= 0),
  stripe_fee_cents int not null default 0 check (stripe_fee_cents >= 0),
  status text not null default 'valid' check (status in ('valid', 'redeemed', 'refunded')),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ps_tickets_show_idx on public.ps_tickets (show_id);
create index if not exists ps_tickets_number_idx on public.ps_tickets (ticket_number);
create index if not exists ps_tickets_session_idx on public.ps_tickets (stripe_session_id);
create index if not exists ps_tickets_tier_idx on public.ps_tickets (tier_id);

-- ============================================================ RLS
alter table public.ps_performers enable row level security;
alter table public.ps_shows enable row level security;
alter table public.ps_show_secrets enable row level security;
alter table public.ps_ticket_tiers enable row level security;
alter table public.ps_tickets enable row level security;

-- Performer profiles are public (in-house profiles).
drop policy if exists "ps_performers public read" on public.ps_performers;
create policy "ps_performers public read"
  on public.ps_performers for select using (true);

-- Shows: public read for published/live/ended. Drafts/cancelled stay hidden.
drop policy if exists "ps_shows public read" on public.ps_shows;
create policy "ps_shows public read"
  on public.ps_shows for select
  using (status in ('published', 'live', 'ended'));

-- Tiers: public read when the parent show is public.
drop policy if exists "ps_tiers public read" on public.ps_ticket_tiers;
create policy "ps_tiers public read"
  on public.ps_ticket_tiers for select
  using (exists (
    select 1 from public.ps_shows s
    where s.id = ps_ticket_tiers.show_id
      and s.status in ('published', 'live', 'ended')
  ));

-- Secrets: NO public policies at all. Service-role API routes only.
-- Tickets: NO public policies at all. Service-role API routes only.
-- (Buyers often have no account; the API validates and the anon key sees nothing.)
