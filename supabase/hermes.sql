-- supabase/hermes.sql
-- HERMES paid link directory.
-- Run in the Supabase SQL editor. Idempotent.

create table if not exists public.hermes_links (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  url text not null check (char_length(url) between 1 and 2048),
  root_domain text not null,
  category text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'approved', 'rejected', 'expired')),
  stripe_session_id text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  expires_at timestamptz
);

create unique index if not exists hermes_links_root_domain_once
  on public.hermes_links (root_domain)
  where payment_status in ('pending', 'approved');

create index if not exists hermes_links_status_idx on public.hermes_links (payment_status);
create index if not exists hermes_links_category_idx on public.hermes_links (category);

alter table public.hermes_links enable row level security;

-- Public: read approved, unexpired listings only. No inserts/updates/deletes from the client.
drop policy if exists hermes_links_public_read on public.hermes_links;
create policy hermes_links_public_read
  on public.hermes_links for select
  using (payment_status = 'approved' and (expires_at is null or expires_at > now()));

-- Writes happen server-side with the service-role key (checkout, webhook, cron).
-- No client write policies by design.
