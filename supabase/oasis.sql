-- OASIS multiplayer rooms + profiles (Olympian Meg master launcher)
-- One room table for every PvP game (game slug column), grown from the
-- olympus_battleship_rooms pattern. Run this in the Supabase SQL editor.

-- ---------------------------------------------------------------- rooms --
create table if not exists public.oasis_rooms (
  id uuid primary key default gen_random_uuid(),
  game text not null
    check (game in ('chess', 'basketball', 'colosseum', 'battleship')),
  room_code text not null unique
    check (room_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  host_id uuid not null,
  player_ids jsonb not null default '[]'::jsonb,
  npc_ids jsonb not null default '[]'::jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  min_players integer not null default 2
    check (min_players >= 2),
  max_players integer not null default 2
    check (max_players >= min_players),
  -- turn-based transport (chess today; any turn-based game tomorrow):
  -- the single source of truth for live game state, polled by clients.
  current_turn text,
  last_move jsonb,
  full_state jsonb,
  resigned_by uuid,
  created_at timestamptz not null default now()
);

alter table public.oasis_rooms enable row level security;

-- Participants (host or a seated player) can read their rooms.
-- Codes are unguessable, so waiting rooms are also readable for joining:
-- a player can only join by knowing the exact 6-character code.
drop policy if exists "oasis_rooms readable for join" on public.oasis_rooms;
create policy "oasis_rooms readable for join"
  on public.oasis_rooms
  for select
  using (true);

-- Any signed-in player can host (create) a room.
drop policy if exists "oasis_rooms host create" on public.oasis_rooms;
create policy "oasis_rooms host create"
  on public.oasis_rooms
  for insert
  with check (auth.uid() = host_id);

-- Host or seated players can update (join, seat NPCs, change status).
drop policy if exists "oasis_rooms participant update" on public.oasis_rooms;
create policy "oasis_rooms participant update"
  on public.oasis_rooms
  for update
  using (
    auth.uid() = host_id
    or player_ids @> jsonb_build_array(auth.uid()::text)
  );

-- Only the host can delete (close) a room.
drop policy if exists "oasis_rooms host delete" on public.oasis_rooms;
create policy "oasis_rooms host delete"
  on public.oasis_rooms
  for delete
  using (auth.uid() = host_id);

create index if not exists oasis_rooms_code_idx on public.oasis_rooms (room_code);
create index if not exists oasis_rooms_game_status_idx on public.oasis_rooms (game, status);

-- ------------------------------------------------------------- profiles --
create table if not exists public.oasis_profiles (
  id uuid primary key,
  callsign text not null
    check (char_length(callsign) between 1 and 16),
  avatar text not null default 'nova',
  stats jsonb not null default '{}'::jsonb,
  boss_wins jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oasis_profiles enable row level security;

-- Callsigns are public (they appear on rosters and leaderboards).
drop policy if exists "oasis_profiles public read" on public.oasis_profiles;
create policy "oasis_profiles public read"
  on public.oasis_profiles
  for select
  using (true);

-- Players own their own identity row.
drop policy if exists "oasis_profiles owner write" on public.oasis_profiles;
create policy "oasis_profiles owner write"
  on public.oasis_profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "oasis_profiles owner update" on public.oasis_profiles;
create policy "oasis_profiles owner update"
  on public.oasis_profiles
  for update
  using (auth.uid() = id);
