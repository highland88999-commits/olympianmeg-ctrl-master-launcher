-- ============================================================================
-- REFERRAL SYSTEM — inbound inquiry requests for /referral-system.
--
-- QUEUED — DO NOT RUN DIRECTLY. This file is executed by the coordinator
-- through the frozen consolidated SQL prompt (Supabase SQL editor).
--
-- What it stores
--   referral_inquiries: one row per inquiry sent from the "Request this
--   build" form on the referral-system pricing slide. The $3,500 CAD figure
--   on that page is an example pricing sketch, not a product for sale — the
--   inquiry is a request for a real quote, and pricing_context records which
--   sketch the visitor was looking at.
--
-- Access design
--   - RLS on. The form is public (no sign-in on the page), so the anon role
--     may INSERT only. There is deliberately no SELECT policy for anon or
--     authenticated: inquiries are read by the operator through the
--     service role / dashboard only.
--   - Until this migration runs, the page detects the missing table
--     (Postgres 42P01) and queues the inquiry on the visitor's device with
--     an honest "saved on this device" note plus a mailto fallback — it
--     never claims the inquiry was sent when it wasn't.
-- ============================================================================

create table if not exists public.referral_inquiries (
  id uuid not null primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  company text check (company is null or char_length(company) <= 160),
  message text not null check (char_length(message) between 1 and 4000),
  pricing_context text not null default 'example-model-3500-cad',
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'archived')),
  created_at timestamptz not null default now()
);

comment on table public.referral_inquiries is
  'Inbound quote requests from /referral-system. Public insert only; no public read. The page treats the $3,500 CAD figure as an example sketch — inquiries ask for a real quote.';

alter table public.referral_inquiries enable row level security;

-- Public contact form: anyone may insert, nobody may read through the API.
drop policy if exists "referral_inquiries: anyone can insert" on public.referral_inquiries;
create policy "referral_inquiries: anyone can insert"
  on public.referral_inquiries for insert
  with check (true);

-- Tighten the API surface: revoke direct reads/writes from anon/authenticated
-- so rows are only visible to the service role (operator dashboard).
revoke all on public.referral_inquiries from anon, authenticated;
grant insert on public.referral_inquiries to anon, authenticated;
