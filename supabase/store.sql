-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- Store orders (merchandise / apparel). Folds into the final consolidated
-- SQL once the Takeout mining freeze lifts (per Merlin's directive: one
-- structured prompt, not per-module). Until then:
--   - the checkout route records 'pending_payment' best-effort (anon key,
--     RLS below); a missing table is caught and never fails a checkout;
--   - the Stripe webhook flips pending -> paid with the service role and
--     acknowledges gracefully while this table is missing;
--   - the UI settles on the webhook, never on client claims.
--
-- Fulfillment: Printful comes later. The shipping address collected at
-- Stripe Checkout is stored in `shipping` (jsonb) for that step, and the
-- Printful order id goes in `printful_order_id` when fulfillment runs.
-- ============================================================================

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  stripe_session_id text unique,
  product_name text,
  price_id text,
  amount_cents int,
  currency text not null default 'cad',
  size text,
  shipping jsonb,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'fulfilled', 'refunded', 'cancelled')),
  printful_order_id text,
  customer_notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz
);

create index if not exists store_orders_session_idx
  on public.store_orders (stripe_session_id);
create index if not exists store_orders_status_idx
  on public.store_orders (status);

-- RLS: anyone can insert a pending order (guest checkout); only the
-- service role may mark orders paid (the webhook). Reads stay
-- service-side — buyers don't list this table.
alter table public.store_orders enable row level security;

drop policy if exists store_orders_insert_pending on public.store_orders;
create policy store_orders_insert_pending
  on public.store_orders for insert
  to anon, authenticated
  with check (status = 'pending_payment');
