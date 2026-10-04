-- supabase/migrations/20261004_trifold.sql
-- TRIFOLD — weekly 3-part newsletter (Real / Ruin / Radiant).
--
-- Tables:
--   trifold_editions      — weekly issues: OG stories + two fictional takes
--   trifold_subscriptions — Stripe-backed subscribers (trial -> active)
--   trifold_settings      — single-row config: buddy email, AI provider +
--                           encrypted API key, newspaper rotation state
--
-- Security:
--   * Published editions are public-read (the archive is the product).
--   * Drafts are hidden from the public API (service-role only).
--   * Subscriptions + settings are deny-all for anon/authenticated;
--     only the service role touches them. The buddy's AI key is stored
--     AES-256-GCM encrypted (see lib/trifold/crypto.js) and is NEVER
--     returned by any API route.

create table if not exists public.trifold_editions (
  id uuid primary key default gen_random_uuid(),
  week_number int not null,
  newspaper_name text not null,
  newspaper_region text not null default '',
  newspaper_url text not null default '',
  og_stories jsonb not null default '[]'::jsonb,
  negative_fiction text not null default '',
  positive_fiction text not null default '',
  status text not null default 'draft' check (status in ('draft','review','published')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trifold_editions_status_idx on public.trifold_editions (status, published_at desc);

create table if not exists public.trifold_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trifold_settings (
  id int primary key check (id = 1),
  buddy_email text not null default '',
  ai_provider text not null default 'openai' check (ai_provider in ('openai','gemini','anthropic')),
  ai_api_key_enc text not null default '',
  rotation_index int not null default 0,
  rotation_log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.trifold_settings (id) values (1) on conflict (id) do nothing;

alter table public.trifold_editions enable row level security;
alter table public.trifold_subscriptions enable row level security;
alter table public.trifold_settings enable row level security;

-- Public can read published editions only.
drop policy if exists trifold_editions_public_read on public.trifold_editions;
create policy trifold_editions_public_read
  on public.trifold_editions for select
  using (status = 'published');

-- Subscriptions + settings: deny-all for anon/authenticated. Service role
-- bypasses RLS; all writes go through the service client in API routes.
drop policy if exists trifold_subscriptions_deny on public.trifold_subscriptions;
create policy trifold_subscriptions_deny
  on public.trifold_subscriptions for all
  using (false) with check (false);

drop policy if exists trifold_settings_deny on public.trifold_settings;
create policy trifold_settings_deny
  on public.trifold_settings for all
  using (false) with check (false);
