-- supabase/earth-rendered-cells.sql
-- Permanent rendered Earth: the global coverage registry (Merlin's design 2026-10-20).
--
-- Rules:
--   * Every Earth lens sheet a user's client finishes building records its
--     cell here. What is rendered becomes permanent FOR ALL USERS: on load,
--     clients merge this global key set with their device record
--     (lib/earth/lens-cache.js — the cell keys are deliberately identical:
--     "<preset>:z<zoom>:<gridLeft>:<gridTop>"), so device records backfill
--     into the global map unchanged.
--   * Coverage math: street cells at z12 with a 16-tile grid ->
--     (4096/16)^2 = 65,536 possible cells; overlook cells at z8 with an
--     8-tile grid -> (256/8)^2 = 1,024. Total 66,560 cells.
--   * When coverage reaches 100%, each user gets a one-time "oblivion
--     shrink" on their first load after full mapping (the per-user seen
--     flag lives in account preferences / localStorage, not here).
--     What comes after — "post oblivion" — is Merlin's parked decision.
--   * Public can READ the registry (the coverage counter is a community
--     progress number). Writes happen only through the service-role API
--     route calling mark_earth_cell_rendered(); no direct client writes.
--
-- NOTE: run only with Merlin's explicit green light (standing Supabase rule).

-- ------------------------------------------------- coverage registry --
create table if not exists public.earth_rendered_cells (
  cell_key text primary key,
  first_rendered_by uuid,
  first_rendered_at timestamptz not null default now(),
  last_rendered_at timestamptz not null default now(),
  render_count integer not null default 1
);
create index if not exists earth_rendered_cells_first_idx
  on public.earth_rendered_cells (first_rendered_at);

alter table public.earth_rendered_cells enable row level security;

-- Public can read the registry (the map filling in is part of the show).
drop policy if exists "earth_rendered_cells public read" on public.earth_rendered_cells;
create policy "earth_rendered_cells public read"
  on public.earth_rendered_cells
  for select
  using (true);

-- No client writes: only the service-role API route mutates this table.

-- ------------------------------------------------- atomic mark RPC --
-- Records one rendered cell. Idempotent: a new cell inserts (returns
-- is_new = true); a repeat render just bumps render_count and
-- last_rendered_at, keeping the original first renderer.
-- Returns one row: (is_new boolean, total_rendered integer).
create or replace function public.mark_earth_cell_rendered(p_cell_key text, p_user_id uuid)
returns table (is_new boolean, total_rendered integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_new boolean := false;
  v_total integer;
begin
  -- Only well-formed cell keys from the two lens presets are accepted:
  -- "<street|overlook>:z<zoom>:<gridLeft>:<gridTop>".
  if p_cell_key is null or p_cell_key !~ '^(street|overlook):z[0-9]{1,2}:[0-9]+:[0-9]+$' then
    select count(*) into v_total from public.earth_rendered_cells;
    return query select false, v_total;
    return;
  end if;

  insert into public.earth_rendered_cells (cell_key, first_rendered_by)
  values (p_cell_key, p_user_id)
  on conflict (cell_key) do nothing;
  v_is_new := found;

  if not v_is_new then
    update public.earth_rendered_cells
       set render_count = render_count + 1,
           last_rendered_at = now()
     where cell_key = p_cell_key;
  end if;

  select count(*) into v_total from public.earth_rendered_cells;
  return query select v_is_new, v_total;
end;
$$;

-- Only the service role should execute the mark function directly.
revoke all on function public.mark_earth_cell_rendered(text, uuid) from public, anon, authenticated;

-- ------------------------------------------------- coverage RPC --
-- The community progress number: rendered vs possible, per preset and
-- overall, plus the fully-mapped flag the oblivion event keys on.
-- Returns one row.
create or replace function public.earth_coverage()
returns table (
  street_rendered integer,
  street_total integer,
  overlook_rendered integer,
  overlook_total integer,
  total_rendered integer,
  total_cells integer,
  percent numeric,
  fully_mapped boolean
)
language sql
stable
as $$
  select
    (select count(*)::integer from public.earth_rendered_cells where cell_key like 'street:%'),
    65536,
    (select count(*)::integer from public.earth_rendered_cells where cell_key like 'overlook:%'),
    1024,
    (select count(*)::integer from public.earth_rendered_cells),
    66560,
    round((select count(*) from public.earth_rendered_cells) * 100.0 / 66560, 4),
    (select count(*) from public.earth_rendered_cells) >= 66560;
$$;

-- Coverage is public information (same as the read policy above).
grant execute on function public.earth_coverage() to anon, authenticated;
