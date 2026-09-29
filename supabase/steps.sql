-- supabase/steps.sql — Step counter for /phone-home.
--
-- QUEUED — DO NOT RUN DIRECTLY. This file is executed by the coordinator
-- through the frozen consolidated SQL prompt (Supabase SQL editor).
--
-- What it stores
--   user_steps: one row per user per calendar day. Today is entered by hand
--   in the app (phone health sync arrives with the mobile phase).
--   The (user_id, step_date) primary key makes re-logging the same day an
--   update, never a duplicate.
--
-- Privacy design
--   - RLS on user_steps, owner-only: a signed-in user can only ever read
--     or write their own rows (auth.uid() = user_id).
--   - global_step_totals is a VIEW, not a table — views cannot carry RLS,
--     so it is granted SELECT to authenticated users only, and it exposes
--     only two aggregate numbers: the summed total and a walker count.
--     No per-user rows, dates, or ids are visible through it.

create table if not exists public.user_steps (
  user_id     uuid         not null references auth.users (id) on delete cascade,
  step_date   date         not null,
  steps       integer      not null check (steps >= 0),
  updated_at  timestamptz  not null default now(),
  primary key (user_id, step_date)
);

comment on table public.user_steps is
  'Manual step entries for /phone-home: one row per user per day. Owner-only access via RLS; no currency, no tokens.';

alter table public.user_steps enable row level security;

-- Owner-only policies: you can read/write your own rows, nothing else.
drop policy if exists "user_steps: owner can read" on public.user_steps;
create policy "user_steps: owner can read"
  on public.user_steps for select
  using (auth.uid() = user_id);

drop policy if exists "user_steps: owner can insert" on public.user_steps;
create policy "user_steps: owner can insert"
  on public.user_steps for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_steps: owner can update" on public.user_steps;
create policy "user_steps: owner can update"
  on public.user_steps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Universal (global) totals: SUM only, no per-user data exposed.
-- RLS does not apply to views, so this is documented here and the view is
-- granted to authenticated users only — exactly the numbers the UI shows as
-- "Everyone's total — universal".
create or replace view public.global_step_totals as
  select
    coalesce(sum(steps), 0)            as total_steps,
    count(distinct user_id)           as walkers
  from public.user_steps;

comment on view public.global_step_totals is
  'Privacy: aggregate only — total step count and number of contributors. No per-user rows, dates, or identifiers are exposed.';

revoke all on public.global_step_totals from anon, public;
grant select on public.global_step_totals to authenticated;
