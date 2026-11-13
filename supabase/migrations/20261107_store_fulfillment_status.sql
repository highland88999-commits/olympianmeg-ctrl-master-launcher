-- 20261107_store_fulfillment_status.sql
-- Fulfillment observability for public.store_orders.
--
-- RUN VIA MERLIN'S GREEN-LIGHT SQL SEQUENCE (Supabase dashboard SQL
-- Editor) before the fulfillment wiring deploy goes live. The webhook
-- code degrades safely until this runs: the new-column writes are
-- best-effort and swallowed, and the printful_order_id idempotency guard
-- uses pre-existing columns only. Without this migration there is no
-- queryable awaiting_address / failed / draft_only state — the order is
-- still fulfilled, but the hold/failure reasons live only in logs.
--
-- fulfillment_status values:
--   awaiting_address  paid, but no usable shipping address on file
--                     (gold-paid orders; card orders with an incomplete
--                     address). NEVER submitted to Printful in this state.
--   failed            variant resolution or Printful submission failed;
--                     status stays 'paid'; see fulfillment_error.
--   draft_only        Printful draft created, confirm failed; the draft
--                     waits in the Printful dashboard for manual
--                     confirmation; printful_order_id holds the draft id.
--   fulfilled         Printful confirmed the order (status is also
--                     flipped to 'fulfilled', fulfilled_at set).
--   NULL              not yet attempted.

alter table public.store_orders
  add column if not exists fulfillment_status text,
  add column if not exists fulfillment_error text;

create index if not exists store_orders_fulfillment_idx
  on public.store_orders (fulfillment_status);

comment on column public.store_orders.fulfillment_status is
  'Printful fulfillment state: awaiting_address | failed | draft_only | fulfilled (null = not yet attempted). Written best-effort by the store webhook and gold checkout.';
comment on column public.store_orders.fulfillment_error is
  'Last fulfillment failure / hold reason (plain text). Never contains secrets.';
