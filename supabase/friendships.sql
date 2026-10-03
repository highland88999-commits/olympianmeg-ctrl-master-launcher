-- supabase/friendships.sql
-- FRIENDSHIPS: the launcher's real friend graph (Order 67 calls, future games).
--
-- DELIVERED AS A CLEAN COPY — run this in the Supabase SQL editor (dashboard)
-- after Merlin's green light. Safe to re-run; existing rows are preserved.
-- Until this runs, friend requests stay notification-only and the friends API
-- answers with an honest error instead of crashing.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- One row per pair, either direction: A→B and B→A can never both exist.
create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists friendships_status_idx on public.friendships (status);

-- keep updated_at honest on every write
create or replace function public.friendships_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists friendships_touch_updated_at on public.friendships;
create trigger friendships_touch_updated_at
  before update on public.friendships
  for each row execute function public.friendships_touch_updated_at();

alter table public.friendships enable row level security;

-- Read: only a party to the row.
drop policy if exists "friendships party read" on public.friendships;
create policy "friendships party read"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Insert: only as yourself, as the requester. (The API routes use the
-- service-role client and enforce the same rule in code.)
drop policy if exists "friendships requester insert" on public.friendships;
create policy "friendships requester insert"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Update: the addressee answers a pending request (accept / decline).
drop policy if exists "friendships addressee update" on public.friendships;
create policy "friendships addressee update"
  on public.friendships for update
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id);

-- Delete: either party may remove the row (unfriend, withdraw a request).
drop policy if exists "friendships party delete" on public.friendships;
create policy "friendships party delete"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- UNIFICATION NOTE (2026-10-02): `friendships` is the single canonical friend
-- graph for the whole platform — Order 67, the hub notification bell, profile
-- pages, and battleship all read/write here via lib/friends.js + /api/friends/*.
-- The legacy `olympus_battleship_friends` table (0 live rows) is RETIRED: no
-- code references it anymore. It may be dropped once the unified code is live:
--   drop table if exists public.olympus_battleship_friends;
-- `ares_blocks` is unrelated (IP-based ARES security blocks, not user blocks)
-- and stays as-is.
