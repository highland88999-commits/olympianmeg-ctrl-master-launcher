-- Olympus orders (Olympian Meg master launcher)
-- One table per program; all programs share the same Supabase project.
-- Run this in the Supabase SQL editor (or via migration tooling).

create table if not exists public.olympus_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null
    check (char_length(customer_name) between 1 and 80),
  customer_email text
    check (customer_email is null or char_length(customer_email) between 3 and 120),
  customer_notes text
    check (customer_notes is null or char_length(customer_notes) <= 500),
  items jsonb not null default '[]'::jsonb,
  total_cents integer not null
    check (total_cents >= 0 and total_cents <= 1000000),
  currency text not null default 'cad'
    check (currency in ('cad', 'usd')),
  status text not null default 'requested'
    check (status in ('requested', 'pending_payment', 'paid', 'fulfilled', 'cancelled')),
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table public.olympus_orders enable row level security;

-- Clients (including logged-out shoppers) may create order requests and
-- pending card-checkout records only. They can never mark an order 'paid'
-- or read anyone's orders; fulfillment happens in the Supabase dashboard.
drop policy if exists "olympus_orders public insert" on public.olympus_orders;
create policy "olympus_orders public insert"
  on public.olympus_orders
  for insert
  with check (status in ('requested', 'pending_payment'));

-- No public select / update / delete. (Dashboard access uses the service role.)

create index if not exists olympus_orders_created_idx
  on public.olympus_orders (created_at desc);
create index if not exists olympus_orders_status_idx
  on public.olympus_orders (status);
