-- supabase/migrations/20261017_shakepay_payouts.sql
-- Shakepay BTC payout leg: settings toggles, BTC recipient fields, send ids, fund orders.
-- CLEAN COPY for Merlin's review. DO NOT EXECUTE without his explicit green light.
--
-- What it adds:
--   payout_settings    — Shakepay master kill-switch + per-queue toggles + fund target
--                        (ALL default OFF/false — Merlin flips them only after explicit approval)
--   payout_recipients  — btc_address + shakepay_reference (method 'btc_shakepay')
--   wallet_withdrawals — shakepay_send_id (send idempotency) + payout_method 'btc_shakepay'
--   shakepay_fund_orders — platform BTC buy orders (the FUND queue's ledger)
--
-- Note: Shakepay publishes no public business API as of 2026-10-17. The
-- application code treats every Shakepay endpoint as ASSUMED (see
-- lib/payouts/shakepay.js); this schema only stores our side of the flow.

alter table public.payout_settings
  add column if not exists shakepay_enabled boolean not null default false,
  add column if not exists shakepay_approved boolean not null default false,
  add column if not exists shakepay_approved_at timestamptz,
  add column if not exists shakepay_approved_by text,
  add column if not exists shakepay_send_enabled boolean not null default false,
  add column if not exists shakepay_fund_enabled boolean not null default false,
  add column if not exists shakepay_confirm_enabled boolean not null default false,
  add column if not exists shakepay_env text not null default 'sandbox',
  add column if not exists shakepay_fund_target_sats bigint not null default 10000000,
  add column if not exists shakepay_confirmations_required int not null default 3;

alter table public.payout_recipients
  add column if not exists btc_address text,
  add column if not exists shakepay_reference text;

alter table public.wallet_withdrawals
  add column if not exists shakepay_send_id text;

create table if not exists public.shakepay_fund_orders (
  id uuid primary key default gen_random_uuid(),
  shakepay_order_id text,
  cad_cents integer not null,
  sats_expected bigint,
  status text not null default 'open',
  idempotency_key text unique,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shakepay_fund_orders_status_idx
  on public.shakepay_fund_orders (status, created_at desc);

alter table public.shakepay_fund_orders enable row level security;
-- shakepay_fund_orders: service_role only, no public policy (same as payout_settings).
