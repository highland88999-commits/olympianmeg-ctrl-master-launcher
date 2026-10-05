-- supabase/migrations/20261004_oracle.sql
-- ORACLE — the program-request system (2026-10-04).
--
-- Users petition for new pocket-universe programs: title, description,
-- god-category, and the bounty THEY set (what they'll pay to have it built).
-- Merlin reviews a private queue (approve / decline / mark built).
-- Every transaction on a requested program carries a flat $1.00 platform
-- fee to Merlin, settled through the in-house wallet ledger
-- (see 20261004_wallet_ledger.sql -> lib/oracle/server.js#chargeOracleFee).
--
-- Tables:
--   oracle_requests  one row per petition: status pending -> approved |
--                    declined -> built (built carries program_slug, the live
--                    route of the finished program).
--                    origin: 'web' (site form) or 'muse-chat' (filed by Muse
--                    from a chat conversation, with requester_contact).
--                    The review-queue artifact files chat requests directly.
--
-- Money rules: bounty_cents >= 0 (a $0 bounty = a free idea, allowed).
-- RLS: the public catalog (approved/built) is readable by everyone —
-- no login wall to browse. Owners read/insert their own rows.
-- Review writes go through the service-role API only.
--
-- Idempotent: every statement guarded. NOT EXECUTED — Merlin green-lights
-- SQL separately.

-- ---------------------------------------------------------------- requests
create table if not exists public.oracle_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  god_category text not null default 'ATHENA',
  bounty_cents int not null default 0 check (bounty_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'built')),
  reviewer_note text not null default '',
  program_slug text not null default '',
  origin text not null default 'web'
    check (origin in ('web', 'muse-chat')),
  requester_contact text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists oracle_requests_status_time_idx
  on public.oracle_requests (status, created_at desc);
create index if not exists oracle_requests_user_idx
  on public.oracle_requests (user_id);

-- Keep updated_at honest without trusting writers.
drop trigger if exists oracle_requests_touch_updated_at on public.oracle_requests;
create or replace function public.oracle_requests_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger oracle_requests_touch_updated_at
  before update on public.oracle_requests
  for each row execute function public.oracle_requests_touch_updated_at();

-- ---------------------------------------------------------------------- RLS
alter table public.oracle_requests enable row level security;

-- Public catalog: approved + built requests are readable by everyone
-- (anon included) — no login wall to browse.
drop policy if exists oracle_requests_public_catalog on public.oracle_requests;
create policy oracle_requests_public_catalog
  on public.oracle_requests for select
  to anon, authenticated
  using (status in ('approved', 'built'));

-- Owners read their own requests at any status.
drop policy if exists oracle_requests_read_own on public.oracle_requests;
create policy oracle_requests_read_own
  on public.oracle_requests for select
  to authenticated
  using (auth.uid() = user_id);

-- Signed-in users submit their own requests only.
drop policy if exists oracle_requests_insert_own on public.oracle_requests;
create policy oracle_requests_insert_own
  on public.oracle_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No update/delete policies for anon/authenticated: review actions go
-- through the Merlin-gated service-role API routes only.
