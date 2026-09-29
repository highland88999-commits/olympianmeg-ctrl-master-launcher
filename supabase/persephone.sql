-- ============================================================================
-- DRAFT — DO NOT RUN YET.
--
-- PERSEPHONE ticket orders. Folds into the final consolidated SQL once the
-- Takeout mining freeze lifts (per Merlin's directive: one structured
-- prompt, not per-module). Until then:
--   - the checkout route records 'pending_payment' best-effort (anon key,
--     RLS below); a missing table is caught and never fails a checkout;
--   - the Stripe webhook flips pending -> paid with the service role;
--   - the UI settles on the webhook, never on client claims.
-- ============================================================================

create table if not exists public.persephone_orders (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null check (ticket_id in ('ga', 'front', 'vip')),
  qty int not null check (qty >= 1 and qty <= 8),
  total_cents int not null check (total_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'refunded', 'cancelled')),
  stripe_session_id text,
  amount_paid_cents int,
  customer_notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists persephone_orders_session_idx
  on public.persephone_orders (stripe_session_id);
create index if not exists persephone_orders_status_idx
  on public.persephone_orders (status);

-- RLS: anyone can insert a pending order (guest checkout); only the
-- service role may mark orders paid (the webhook). Reads stay
-- service-side — ticket holders don't list this table.
alter table public.persephone_orders enable row level security;

drop policy if exists persephone_orders_insert_pending on public.persephone_orders;
create policy persephone_orders_insert_pending
  on public.persephone_orders for insert
  to anon, authenticated
  with check (status = 'pending_payment');
