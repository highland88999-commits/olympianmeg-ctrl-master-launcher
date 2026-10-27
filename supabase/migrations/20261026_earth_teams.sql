-- supabase/migrations/20261026_earth_teams.sql
-- Earth 1 OPTIONAL mapping teams + Oblivion Day prizes + team
-- garage (Merlin, 2026-10-26 evening orders).
--
-- HOW TO RUN (Merlin's step, dashboard only — code never runs this):
--   Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Until this runs, the teams routes answer "not ready" and nothing
-- errors; the Earth tracker and the global registry are unaffected.
--
-- TEAMS ARE OPTIONAL: solo players keep mapping and their ground
-- still counts toward the ONE global Earth total that triggers
-- Oblivion. Teams are the prize ladder layered on top.
--
-- SHAPE:
--   earth_teams
--     id           uuid PK — the team.
--     name         text — chosen by the creator, 1–40 chars
--                    (the route validates the shape; the CHECK
--                    below enforces the length as a backstop).
--     created_by   uuid — the creator's auth user id.
--     floor_finish text — garage floor finish id (this room's own
--                    catalog in lib/earth/teams.js; Fortress itself
--                    is untouched).
--     wall_finish  text — garage wall finish id.
--     created_at   timestamptz.
--   earth_team_members
--     team_id      uuid FK -> earth_teams (cascade on team delete).
--     user_id      uuid — one team per user: UNIQUE(user_id).
--     role         text — 'creator' or 'member'.
--     craft_id     text NULL — the member's current craft, reported
--                    by their own client from their craft pick; NULL
--                    means no craft parked yet (never a fake vehicle).
--     joined_at    timestamptz.
--     PK (team_id, user_id).
--   earth_oblivion_prizes
--     id               uuid PK.
--     event_id         text — one Oblivion event (e.g. a date slug).
--     team_id          uuid — the placed team (no FK: teams may be
--                        deleted after the event and the prize
--                        record must survive).
--     place            int — 1..5 (only the top 5 teams earn).
--     user_id          uuid — the prize winner.
--     aether_amount    int — 400 / 320 / 240 / 160 / 80 by place.
--     usd_cents        int — dollar-equivalent at grant time
--                        (400 aether = $10 = 1000 cents, etc.).
--     funded           boolean — false until Merlin loads the
--                        backing to Supabase; true once funded.
--     payout_status    text — 'pending_fintrac' until FINTRAC
--                        opens real-money payout, then 'paid'.
--     stripe_payout_id text NULL — the tracking piece that connects
--                        to Stripe when FINTRAC opens; NULL until then.
--     created_at       timestamptz — grant time.
--     paid_at          timestamptz NULL — payout time.
--     UNIQUE(event_id, user_id): one grant per user per event —
--     the foolproof part, together with the aether idempotency key
--     `oblivion-prize:{eventId}:{userId}` passed to creditAether.
--     A settlement re-run grants nothing twice.
--
-- TEAM CAP, race-safe: the route counts members before inserting,
-- AND the trigger below raises when a team would gain a 6th
-- member — two simultaneous joins cannot beat the route check.
--
-- PRIVACY: teams (names + finishes) are readable by any signed-in
-- user (standings need names). Team rosters are readable only by
-- that team's own members. Prize rows are readable only by their
-- own winner. All writes go through the service-role routes; no
-- write grants are given to authenticated users.

create table if not exists public.earth_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 1 and char_length(name) <= 40),
  created_by uuid not null,
  floor_finish text not null default 'concrete',
  wall_finish text not null default 'steel',
  created_at timestamptz not null default now()
);

create table if not exists public.earth_team_members (
  team_id uuid not null references public.earth_teams(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('creator', 'member')),
  craft_id text,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (user_id)
);

create table if not exists public.earth_oblivion_prizes (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  team_id uuid not null,
  place int not null check (place >= 1 and place <= 5),
  user_id uuid not null,
  aether_amount int not null check (aether_amount > 0),
  usd_cents int not null check (usd_cents >= 0),
  funded boolean not null default false,
  payout_status text not null default 'pending_fintrac'
    check (payout_status in ('pending_fintrac', 'paid')),
  stripe_payout_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (event_id, user_id)
);

-- Race-safe 5-member cap: a 6th insert is refused, not stored.
create or replace function public.earth_team_cap_check()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.earth_team_members
      where team_id = new.team_id) >= 5 then
    raise exception 'team % is full (max 5 members)', new.team_id;
  end if;
  return new;
end;
$$;

drop trigger if exists earth_team_cap_trigger on public.earth_team_members;
create trigger earth_team_cap_trigger
  before insert on public.earth_team_members
  for each row execute function public.earth_team_cap_check();

alter table public.earth_teams enable row level security;
alter table public.earth_team_members enable row level security;
alter table public.earth_oblivion_prizes enable row level security;

-- Teams: any signed-in user may read (standings need names).
drop policy if exists "earth_teams read" on public.earth_teams;
create policy "earth_teams read"
  on public.earth_teams for select
  to authenticated using (true);

-- Rosters: only the team's own members may read them.
drop policy if exists "earth_team_members own team read"
  on public.earth_team_members;
create policy "earth_team_members own team read"
  on public.earth_team_members for select
  to authenticated using (
    team_id in (
      select team_id from public.earth_team_members
      where user_id = auth.uid()
    )
  );

-- Prizes: only the winner may read their own prize rows.
drop policy if exists "earth_oblivion_prizes own read"
  on public.earth_oblivion_prizes;
create policy "earth_oblivion_prizes own read"
  on public.earth_oblivion_prizes for select
  to authenticated using (auth.uid() = user_id);

-- Writes go through the service-role routes only: no insert /
-- update / delete grants to authenticated on any of the three
-- tables (the service role bypasses RLS).
grant select on public.earth_teams to authenticated;
grant select on public.earth_team_members to authenticated;
grant select on public.earth_oblivion_prizes to authenticated;
