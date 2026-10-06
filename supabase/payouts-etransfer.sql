-- supabase/payouts-etransfer.sql
-- E-transfer payout system: recipients, audit log, settings.
-- CLEAN COPY for Merlin's review. DO NOT EXECUTE without his explicit green light.
--
-- What it adds:
--   payout_recipients  — per-user Interac destination (email + legal name), the KYC record
--   payout_audit_log   — every payout state change, timestamped, forever
--   payout_settings    — master kill-switch + compliance checklist (all default OFF/false)
--   wallet_withdrawals — payout_method ('stripe_connect' | 'interac') + Wise transfer/quote ids

create table if not exists public.payout_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'interac',
  interac_email text not null,
  legal_name text not null,
  wise_recipient_id bigint,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, method)
);

create table if not exists public.payout_audit_log (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid references public.wallet_withdrawals(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payout_audit_log_withdrawal_idx
  on public.payout_audit_log (withdrawal_id, created_at desc);

create table if not exists public.payout_settings (
  id int primary key default 1,
  etransfer_enabled boolean not null default false,
  etransfer_approved boolean not null default false,
  etransfer_approved_at timestamptz,
  etransfer_approved_by text,
  wise_env text not null default 'sandbox',
  wise_profile_id text,
  -- Compliance checklist. Merlin checks these off; the legal ones need counsel.
  compliance_wise_kyb_complete boolean not null default false,
  compliance_fintrac_reviewed boolean not null default false,
  compliance_rpaa_registered boolean not null default false,
  compliance_counsel_reviewed boolean not null default false,
  compliance_terms_updated boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint payout_settings_singleton check (id = 1)
);
insert into public.payout_settings (id) values (1) on conflict (id) do nothing;

alter table public.wallet_withdrawals
  add column if not exists payout_method text not null default 'stripe_connect',
  add column if not exists wise_transfer_id bigint,
  add column if not exists wise_quote_id text;

alter table public.payout_recipients enable row level security;
alter table public.payout_audit_log enable row level security;
alter table public.payout_settings enable row level security;

drop policy if exists payout_recipients_owner on public.payout_recipients;
create policy payout_recipients_owner on public.payout_recipients
  for select using (auth.uid() = user_id);

drop policy if exists payout_audit_log_owner on public.payout_audit_log;
create policy payout_audit_log_owner on public.payout_audit_log
  for select using (auth.uid() = user_id);
-- payout_settings: service_role only, no public policy.
