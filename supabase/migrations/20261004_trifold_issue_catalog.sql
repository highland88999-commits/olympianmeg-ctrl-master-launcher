-- supabase/migrations/20261004_trifold_issue_catalog.sql
-- TRIFOLD follow-up: issue-numbered catalog + editor designation.
--
-- * issue_number: public-facing Issue #1, #2, ... Assigned at publish
--   time (max+1), unique. The archive browses issues; each issue opens
--   to its three parts. One issue per week, no orphans.
-- * buddy_user_id: the Supabase auth user ID allowed to edit. Set once
--   (by Merlin or via TRIFOLD_EDITOR_USER_ID env bootstrap). All edit
--   routes check the caller's user ID against this server-side.

alter table public.trifold_editions
  add column if not exists issue_number int;

-- Backfill any existing published rows (none expected yet) then enforce.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trifold_editions_issue_number_key'
  ) then
    alter table public.trifold_editions
      add constraint trifold_editions_issue_number_key unique (issue_number);
  end if;
end $$;

alter table public.trifold_settings
  add column if not exists buddy_user_id text not null default '';
