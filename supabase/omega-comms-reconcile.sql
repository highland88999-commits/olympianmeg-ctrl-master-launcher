-- supabase/omega-comms-reconcile.sql
-- OMEGA COMMS — GENTLE-ADAPT reconciliation (2026-10-23, Merlin's
-- "run all outstanding sql" green light).
--
-- Why this file exists: supabase/omega-comms.sql FAILED against this
-- project (ERROR 42703, column "repo_id" does not exist) because
-- Merlin's ORIGINAL Communications-Array backend tables already live
-- here: global_chat exists and matches; p2p_chat exists WITHOUT
-- repo_id / app_name / origin_url; squad_chat + squad_members exist
-- with squad_id as TEXT; squads does not exist at all. The staged
-- file assumed a blank project (create-if-not-exists no-ops, then
-- its p2p index hit the missing column).
--
-- Gentle adapt — adapt the port to the tables that exist, never
-- reshape them:
--   * p2p_chat / squad_chat gain only the columns the app writes
--     (repo_id, app_name, origin_url) — added if missing, existing
--     rows backfilled to the 'olympus' namespace.
--   * squads is created with a TEXT id, matching the TEXT squad_id
--     his existing squad_chat / squad_members already carry (the
--     reshape alternative — uuid everywhere — was NOT chosen).
--   * The squad_members -> squads foreign key (needed for the
--     PostgREST membership embed) is attempted inside a guarded
--     block: if pre-existing membership rows reference squads that
--     do not exist, the FK is skipped with a notice rather than
--     failing the run.
--   * RLS policies + realtime publication entries are the staged
--     file's own, applied verbatim (drop-if-exists + create).
--
-- Idempotent: safe to re-run. Contains ZERO backslashes by design.

-- ============================================================ p2p_chat: add the missing columns
alter table public.p2p_chat add column if not exists repo_id text;
alter table public.p2p_chat add column if not exists app_name text;
alter table public.p2p_chat add column if not exists origin_url text;
alter table public.p2p_chat add column if not exists read_at timestamptz;
alter table public.p2p_chat add column if not exists created_at timestamptz not null default now();

update public.p2p_chat set repo_id = 'olympus' where repo_id is null;
alter table public.p2p_chat alter column repo_id set default 'olympus';
alter table public.p2p_chat alter column repo_id set not null;

create index if not exists p2p_chat_repo_pair_idx
  on public.p2p_chat (repo_id, sender_id, receiver_id, created_at);
create index if not exists p2p_chat_receiver_idx
  on public.p2p_chat (receiver_id, created_at);

-- ============================================================ global_chat: already matches; ensure its index
create index if not exists global_chat_repo_time_idx
  on public.global_chat (repo_id, created_at);

-- ============================================================ squad_chat: add the columns the app writes
alter table public.squad_chat add column if not exists repo_id text;
alter table public.squad_chat add column if not exists app_name text;
alter table public.squad_chat add column if not exists origin_url text;
alter table public.squad_chat add column if not exists created_at timestamptz not null default now();

update public.squad_chat set repo_id = 'olympus' where repo_id is null;
alter table public.squad_chat alter column repo_id set default 'olympus';

create index if not exists squad_chat_squad_time_idx
  on public.squad_chat (squad_id, created_at);

-- ============================================================ squad_members: index on the user side
create index if not exists squad_members_user_idx
  on public.squad_members (user_id);

-- ============================================================ squads: create with a TEXT id (matches his tables)
create table if not exists public.squads (
  id text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  repo_id text not null default 'olympus',
  name text not null check (char_length(name) between 1 and 120),
  leader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists squads_repo_idx on public.squads (repo_id);

-- Membership embed FK (squad_members.squad_id -> squads.id), guarded:
-- pre-existing rows pointing at squads that never landed in this
-- project must not fail the run.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'squad_members_squad_id_fkey'
  ) then
    begin
      alter table public.squad_members
        add constraint squad_members_squad_id_fkey
        foreign key (squad_id) references public.squads(id) on delete cascade;
    exception when others then
      raise notice 'squad_members FK skipped: %', sqlerrm;
    end;
  end if;
end $$;

-- ============================================================ RLS (the staged file's policies, verbatim)
alter table public.global_chat enable row level security;
alter table public.p2p_chat enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_chat enable row level security;

drop policy if exists "global_chat read" on public.global_chat;
create policy "global_chat read"
  on public.global_chat for select
  to authenticated using (true);

drop policy if exists "global_chat insert own" on public.global_chat;
create policy "global_chat insert own"
  on public.global_chat for insert
  to authenticated with check (sender_id = auth.uid());

drop policy if exists "p2p_chat read parties" on public.p2p_chat;
create policy "p2p_chat read parties"
  on public.p2p_chat for select
  to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "p2p_chat insert own" on public.p2p_chat;
create policy "p2p_chat insert own"
  on public.p2p_chat for insert
  to authenticated with check (sender_id = auth.uid());

drop policy if exists "p2p_chat receipt update" on public.p2p_chat;
create policy "p2p_chat receipt update"
  on public.p2p_chat for update
  to authenticated using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());

drop policy if exists "p2p_chat delete parties" on public.p2p_chat;
create policy "p2p_chat delete parties"
  on public.p2p_chat for delete
  to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "squads read" on public.squads;
create policy "squads read"
  on public.squads for select
  to authenticated using (true);

drop policy if exists "squads insert own" on public.squads;
create policy "squads insert own"
  on public.squads for insert
  to authenticated with check (leader_id = auth.uid());

drop policy if exists "squad_members read own" on public.squad_members;
create policy "squad_members read own"
  on public.squad_members for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "squad_members insert own" on public.squad_members;
create policy "squad_members insert own"
  on public.squad_members for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "squad_chat read members" on public.squad_chat;
create policy "squad_chat read members"
  on public.squad_chat for select
  to authenticated using (
    squad_id in (select squad_id from public.squad_members where user_id = auth.uid())
  );

drop policy if exists "squad_chat insert members" on public.squad_chat;
create policy "squad_chat insert members"
  on public.squad_chat for insert
  to authenticated with check (
    sender_id = auth.uid()
    and squad_id in (select squad_id from public.squad_members where user_id = auth.uid())
  );

-- ============================================================ Realtime (guarded, as staged)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'global_chat') then
    alter publication supabase_realtime add table public.global_chat;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'p2p_chat') then
    alter publication supabase_realtime add table public.p2p_chat;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_chat') then
    alter publication supabase_realtime add table public.squad_chat;
  end if;
end $$;
