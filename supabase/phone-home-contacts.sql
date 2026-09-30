-- ============================================================================
-- PHONE HOME — per-user contacts list (name + phone number) for /phone-home.
--
-- QUEUED FOR EXECUTION — the coordinator runs this (no dashboard access at
-- the authoring depth). Safe to fold into the final consolidated SQL: it
-- uses CREATE TABLE IF NOT EXISTS and drops policies before recreating.
--
-- Purpose: the original ET-Phone-Home GlassCombsApp had a contacts list;
-- the launcher's /phone-home gets one here. Each row belongs to exactly
-- one user (auth.users id); RLS is strictly owner-only, matching the other
-- /phone-home tables (advisory_dismissals, user_steps).
--
-- Client behavior (app/phone-home/contacts-tab.tsx): cloud CRUD first.
-- Until this migration runs, the client detects the missing table
-- (Postgres 42P01) and shows a plain "Contacts arrive with the next
-- database update." note — no crash, no error dump. Unrelated failures
-- (network, auth) show an honest offline note with a retry.
-- ============================================================================

create table if not exists public.phone_home_contacts (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone_number text not null check (char_length(phone_number) >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.phone_home_contacts is
  'Per-user contacts for /phone-home tap-to-call. Owner-only RLS; rows follow auth.users on delete.';

alter table public.phone_home_contacts enable row level security;

-- Strictly owner-only: a user reads/writes only their own contacts.
drop policy if exists "phone_home_contacts owner read" on public.phone_home_contacts;
create policy "phone_home_contacts owner read"
  on public.phone_home_contacts
  for select
  using (auth.uid() = user_id);

drop policy if exists "phone_home_contacts owner insert" on public.phone_home_contacts;
create policy "phone_home_contacts owner insert"
  on public.phone_home_contacts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "phone_home_contacts owner update" on public.phone_home_contacts;
create policy "phone_home_contacts owner update"
  on public.phone_home_contacts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "phone_home_contacts owner delete" on public.phone_home_contacts;
create policy "phone_home_contacts owner delete"
  on public.phone_home_contacts
  for delete
  using (auth.uid() = user_id);
