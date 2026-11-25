-- supabase/mars2-outposts.sql — Per-user Mars 2 outposts.
--
-- GREEN-LIT Nov 25, 2026 — Merlin: "Use supabase." Run in the
-- Supabase SQL Editor (Project Settings → SQL Editor, project
-- pjslctbyigtapvblbjao), the same way monopoly_rooms was run live
-- Nov 3. Cost: $0 — one small table, no new service, no new plan.
--
-- What it stores: one row per user — their own ARES outpost site on
-- Mars 2 (x, z in world metres). Nothing else. No tokens, no
-- personal data beyond the user id (which Supabase already holds).
--
-- What it enables: every user who enters Mars 2 gets their own
-- outpost, placed randomly in the annulus 120–1200 m from the origin
-- (outside the shared home region), never closer than 80 m to
-- another user's outpost — so no two outpost areas ever overlap.
-- First visit allocates the spot; later visits reuse it.
--
-- Before this runs: the API routes answer 503 with a plain-English
-- message, and Mars 2 falls back to the one shared seeded outpost
-- exactly as today — the game still loads, nothing breaks.
--
-- RLS: authenticated users may READ their own row and the rows of
-- their accepted friends (the compass needs friends' markers).
-- Nobody writes through RLS — no INSERT/UPDATE/DELETE policies, so
-- allocation happens only through the SECURITY DEFINER function
-- below, called by the API routes with the service-role key.
-- Clients never touch this table except through those routes.

create table if not exists public.mars2_outposts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  x double precision not null,
  z double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mars2_outposts enable row level security;

-- Read your own outpost.
create policy "own outpost readable"
  on public.mars2_outposts for select
  to authenticated
  using (user_id = auth.uid());

-- Read the outposts of your accepted friends (the compass needs
-- their markers). Blocked / pending / declined pairs see nothing.
create policy "friends outposts readable"
  on public.mars2_outposts for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = mars2_outposts.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = mars2_outposts.user_id)
        )
    )
  );

-- No INSERT / UPDATE / DELETE policies: nobody writes through RLS.
-- Allocation runs only inside allocate_mars2_outpost below
-- (SECURITY DEFINER, called by the API routes with the
-- service-role key), so the check-and-insert stays atomic.

-- Allocate (or return) one user's outpost. SECURITY DEFINER so the
-- check-and-insert is atomic: an advisory lock serialises
-- allocations, so two users racing for the same ground cannot both
-- win it. Returns the site plus whether this call created it.
create or replace function public.allocate_mars2_outpost(p_user_id uuid)
returns table (x double precision, z double precision, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_x double precision;
  v_z double precision;
  v_r double precision;
  v_a double precision;
  v_tries int := 0;
begin
  -- Already placed: hand the same site back, every visit.
  select o.x, o.z into v_x, v_z
  from public.mars2_outposts o
  where o.user_id = p_user_id;
  if found then
    return query select v_x, v_z, false;
    return;
  end if;

  -- One allocator at a time: no two users can claim the same spot.
  perform pg_advisory_xact_lock(20261125);

  -- Re-check inside the lock (a racing call may have placed it).
  select o.x, o.z into v_x, v_z
  from public.mars2_outposts o
  where o.user_id = p_user_id;
  if found then
    return query select v_x, v_z, false;
    return;
  end if;

  -- Random spot in the annulus, clear of every other outpost by
  -- 80 m (two 40 m areas never overlap). Uniform over area.
  loop
    v_tries := v_tries + 1;
    if v_tries > 100 then
      raise exception 'mars2 outpost annulus is full';
    end if;
    v_a := random() * 2 * pi();
    v_r := sqrt(random() * (1200 * 1200 - 120 * 120) + 120 * 120);
    v_x := cos(v_a) * v_r;
    v_z := sin(v_a) * v_r;
    if not exists (
      select 1 from public.mars2_outposts o
      where (o.x - v_x) * (o.x - v_x) + (o.z - v_z) * (o.z - v_z) < 80 * 80
    ) then
      exit;
    end if;
  end loop;

  insert into public.mars2_outposts (user_id, x, z)
  values (p_user_id, v_x, v_z);
  return query select v_x, v_z, true;
end;
$$;
