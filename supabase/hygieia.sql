-- supabase/hygieia.sql — HYGIEIA (/hygieia): programmable health reminders.
--
-- QUEUED — DO NOT RUN DIRECTLY. This file is executed by the coordinator
-- through the frozen consolidated SQL prompt (Supabase SQL editor).
--
-- What it stores
--   reminder_items: one row per reminder, per user. Schedules are once,
--   daily, or weekly (chosen days). `days` uses JS getDay() numbering:
--   0 = Sunday … 6 = Saturday — the client (lib/hygieia/schedule.js)
--   normalises to the same convention before writing.
--
-- What it does NOT touch
--   user_steps (step history) is created by supabase/steps.sql — a parallel
--   workstream. The Hygieia dashboard READS that table; it is not redefined
--   here. Running this file twice is safe: CREATE TABLE IF NOT EXISTS plus
--   DROP POLICY IF EXISTS before every CREATE POLICY.
--
-- Privacy design
--   - RLS on reminder_items, owner-only: a signed-in user can only ever
--     read, insert, update, or delete their own rows (auth.uid() = user_id).
--   - Push delivery is NOT implemented here or anywhere yet: reminders
--     show in-app until the mobile phase (see lib/hygieia/notify.ts).

create table if not exists public.reminder_items (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  title         text        not null,
  schedule_type text        not null check (schedule_type in ('once', 'daily', 'weekly')),
  remind_time   time,
  days          smallint[],
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.reminder_items is
  'HYGIEIA reminders: per-user programmable reminders (once/daily/weekly). Owner-only access via RLS. In-app display only — phone push arrives with the mobile phase.';

comment on column public.reminder_items.days is
  'Weekly schedule only. JS getDay() numbering: 0=Sunday … 6=Saturday. NULL for once/daily.';

create index if not exists reminder_items_user_idx
  on public.reminder_items (user_id, enabled, created_at desc);

alter table public.reminder_items enable row level security;

-- Owner-only policies: you can read/write your own reminders, nothing else.
drop policy if exists "reminder_items: owner can read" on public.reminder_items;
create policy "reminder_items: owner can read"
  on public.reminder_items for select
  using (auth.uid() = user_id);

drop policy if exists "reminder_items: owner can insert" on public.reminder_items;
create policy "reminder_items: owner can insert"
  on public.reminder_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "reminder_items: owner can update" on public.reminder_items;
create policy "reminder_items: owner can update"
  on public.reminder_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reminder_items: owner can delete" on public.reminder_items;
create policy "reminder_items: owner can delete"
  on public.reminder_items for delete
  using (auth.uid() = user_id);
