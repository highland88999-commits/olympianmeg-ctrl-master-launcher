-- 20261007_bug_reports.sql
-- User-submitted bug reports, filed from the launcher's "Report a bug" button.
-- These land in the database so Muse can see and act on them.
-- Companion to client_errors (automatic crash logging); bug_reports are for
-- "something's wrong" that the auto-logger didn't catch.
-- DO NOT EXECUTE without Merlin's explicit green light.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  page_url text not null default '',
  description text not null default '',
  steps text not null default '',
  user_agent text not null default '',
  viewport text not null default '',
  status text not null default 'open' check (status in ('open', 'in-progress', 'fixed', 'wont-fix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bug_reports_status_idx on public.bug_reports (status);
create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);

-- Keep updated_at honest.
create or replace function public.bug_reports_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bug_reports_touch_trigger on public.bug_reports;
create trigger bug_reports_touch_trigger
  before update on public.bug_reports
  for each row execute function public.bug_reports_touch();

alter table public.bug_reports enable row level security;

-- Anyone (signed in or not) can file a report. The API route uses the
-- service-role client, so these policies mainly guard direct table access.
drop policy if exists bug_reports_insert_any on public.bug_reports;
create policy bug_reports_insert_any
  on public.bug_reports for insert
  with check (true);

-- Reads and updates stay server-side (service role). No public select/update.
drop policy if exists bug_reports_no_public_read on public.bug_reports;
create policy bug_reports_no_public_read
  on public.bug_reports for select
  using (false);
