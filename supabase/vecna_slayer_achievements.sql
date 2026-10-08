-- Vecna Slayer achievements (Hawkins: Hunt For Vecna)
-- Tracks every Vecna kill globally and awards milestone achievements:
--   kill #1        -> 'first'   (1st Vecna Slayer)
--   kill #100      -> '100th'   (100th Vecna Slayer)
--   kill #1000     -> '1000th'  (1000th Vecna Slayer)
--   kill #1000000  -> 't-1000'  (1,000,000th Vecna Slayer T-1000)
-- Each milestone carries a unique collectible video prompt the slayer can keep or sell.
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

-- Global kill counter (race-safe)
create sequence if not exists public.vecna_kill_seq start 1;

-- Every recorded Vecna kill
create table if not exists public.vecna_kills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kill_number bigint not null unique,
  created_at timestamptz not null default now()
);
create index if not exists vecna_kills_user_idx on public.vecna_kills (user_id);
create index if not exists vecna_kills_number_idx on public.vecna_kills (kill_number);

-- Milestone achievements (one row per milestone, ever)
create table if not exists public.vecna_slayer_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  milestone text not null check (milestone in ('first', '100th', '1000th', 't-1000')),
  kill_number bigint not null,
  video_prompt text not null,
  status text not null default 'held' check (status in ('held', 'listed', 'sold', 'transferred')),
  awarded_at timestamptz not null default now(),
  unique (milestone)
);
create index if not exists vecna_milestones_user_idx on public.vecna_slayer_milestones (user_id);

-- RLS: service role (used by the API) bypasses; users can read own kills
-- and everyone can read the milestone leaderboard.
alter table public.vecna_kills enable row level security;
alter table public.vecna_slayer_milestones enable row level security;

drop policy if exists vecna_kills_read_own on public.vecna_kills;
create policy vecna_kills_read_own on public.vecna_kills
  for select using (auth.uid() = user_id);

drop policy if exists vecna_milestones_read_all on public.vecna_slayer_milestones;
create policy vecna_milestones_read_all on public.vecna_slayer_milestones
  for select using (true);

-- Atomic kill recorder: next global kill number, insert kill, award the
-- milestone (once, ever — unique_violation means someone else holds it).
-- p_prompts: jsonb map of milestone key -> video prompt text.
create or replace function public.record_vecna_kill(
  p_user_id uuid, p_prompts jsonb
)
returns table (kill_number bigint, awarded_milestone text)
language plpgsql security definer as $$
declare
  n bigint;
  mk text := null;
begin
  n := nextval('public.vecna_kill_seq');
  insert into public.vecna_kills (user_id, kill_number) values (p_user_id, n);
  case n
    when 1 then mk := 'first';
    when 100 then mk := '100th';
    when 1000 then mk := '1000th';
    when 1000000 then mk := 't-1000';
    else mk := null;
  end case;
  if mk is not null then
    begin
      insert into public.vecna_slayer_milestones (user_id, milestone, kill_number, video_prompt)
      values (p_user_id, mk, n, p_prompts ->> mk);
      return query select n, mk;
    exception when unique_violation then
      return query select n, null::text;
    end;
  else
    return query select n, null::text;
  end if;
end $$;
