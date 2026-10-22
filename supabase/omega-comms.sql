-- supabase/omega-comms.sql
-- OMEGA COMMS — tables for /omega-comms, the Communications Array
-- ported from Merlin's Communications-Array repo.
--
-- *** NOT RUN *** — this file is staged only. It executes when
-- Merlin gives the SQL green light, like journal.sql / earth2.sql.
-- Until it runs, /omega-comms shows its setup-pending state and
-- nothing is fake-sent.
--
-- What this creates (shapes mirror the source repo's queries):
--   global_chat    one network-wide feed per repo_id namespace
--   p2p_chat       direct messages (sender -> receiver, read_at receipt)
--   squads         named group chats, joined by sharing the squad id
--   squad_members  membership rows (unique per squad+user)
--   squad_chat     messages inside a squad
--
-- Identity: sender_id / receiver_id / leader_id / user_id are
-- auth.users ids — the same sign-in as the rest of Olympus.
-- Display usernames live in public.profiles and are resolved by
-- the client; they are NOT duplicated here.
--
-- repo_id namespaces the comms space (the source ran one space per
-- ecosystem node). Olympus writes the constant 'olympus'.

-- ============================================================ global_chat
create table if not exists public.global_chat (
  id uuid primary key default gen_random_uuid(),
  repo_id text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  app_name text,
  origin_url text,
  created_at timestamptz not null default now()
);

create index if not exists global_chat_repo_time_idx
  on public.global_chat (repo_id, created_at);

-- ============================================================ p2p_chat
create table if not exists public.p2p_chat (
  id uuid primary key default gen_random_uuid(),
  repo_id text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  app_name text,
  origin_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists p2p_chat_repo_pair_idx
  on public.p2p_chat (repo_id, sender_id, receiver_id, created_at);
create index if not exists p2p_chat_receiver_idx
  on public.p2p_chat (receiver_id, created_at);

-- ============================================================ squads
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  repo_id text not null,
  name text not null check (char_length(name) between 1 and 120),
  leader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists squads_repo_idx on public.squads (repo_id);

-- ============================================================ squad_members
create table if not exists public.squad_members (
  squad_id uuid not null references public.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create index if not exists squad_members_user_idx
  on public.squad_members (user_id);

-- ============================================================ squad_chat
create table if not exists public.squad_chat (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  app_name text,
  origin_url text,
  created_at timestamptz not null default now()
);

create index if not exists squad_chat_squad_time_idx
  on public.squad_chat (squad_id, created_at);

-- ============================================================ RLS
alter table public.global_chat enable row level security;
alter table public.p2p_chat enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_chat enable row level security;

-- Global feed: any signed-in user reads; you can only post as yourself.
drop policy if exists "global_chat read" on public.global_chat;
create policy "global_chat read"
  on public.global_chat for select
  to authenticated using (true);

drop policy if exists "global_chat insert own" on public.global_chat;
create policy "global_chat insert own"
  on public.global_chat for insert
  to authenticated with check (sender_id = auth.uid());

-- Direct messages: only the two parties can read; send only as
-- yourself; the receiver may update (the read receipt stamps read_at).
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

-- Squads: signed-in users can look a squad up by id (join flow) and
-- create squads they lead.
drop policy if exists "squads read" on public.squads;
create policy "squads read"
  on public.squads for select
  to authenticated using (true);

drop policy if exists "squads insert own" on public.squads;
create policy "squads insert own"
  on public.squads for insert
  to authenticated with check (leader_id = auth.uid());

-- Memberships: you see your own rows (the feeds only ever ask for
-- "my squads") and you can only add yourself.
drop policy if exists "squad_members read own" on public.squad_members;
create policy "squad_members read own"
  on public.squad_members for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "squad_members insert own" on public.squad_members;
create policy "squad_members insert own"
  on public.squad_members for insert
  to authenticated with check (user_id = auth.uid());

-- Squad messages: members only, both ways. The subquery reads
-- squad_members under its own owner policy, so it resolves to
-- "squads I belong to" without recursion.
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

-- ============================================================ Realtime
-- The feeds subscribe to postgres_changes; the chat tables must be
-- in the supabase_realtime publication.
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
