-- ============================================================================
-- VENUS WIFI — collective free-WiFi spots
-- Clean copy for Merlin's review. DO NOT RUN until he green-lights it.
-- Production project: pjslctbyigtapvblbjao (same as the rest of Olympus).
--
-- DESIGN NOTES (read before running):
-- * One row per real-world free/open network spot. Contributions pool here;
--   duplicates (same SSID within ~75 m) are merged by the API route, which
--   bumps `confirmations` and `last_confirmed` instead of inserting a twin.
-- * PRIVACY: `contributor_id` records WHO logged a spot (abuse control) and
--   must NEVER reach the public. That is enforced two ways at once:
--     1. RLS is ON and there is NO public SELECT policy on the base table —
--        anon/authenticated roles cannot read the table directly at all.
--     2. All reads the app makes go through the service-role API routes
--        (/api/venus-wifi/*), which select an explicit public column list
--        that omits contributor_id. Writes also go through the service
--        client after a Bearer-token auth check in the route.
--   (Chosen over a public view so there is exactly one read path — the API —
--   and the column list lives in one reviewed place: lib/venus-wifi/spots.js.)
-- * EXPIRY: spots whose last_confirmed is older than 12 months are treated
--   as gone: the API excludes them from radius reads and from the offline
--   snapshot. Rows are kept (history/abuse trail); nothing is deleted here.
-- * DEDUPE: merging is done in the API (nearest same-SSID row within 75 m),
--   because a pure unique index on rounded coordinates would split spots
--   that straddle a grid boundary. The grid index below is a supporting
--   lookup index for the merge query, not a uniqueness constraint.
-- ============================================================================

create table if not exists public.venus_wifi_spots (
  id             uuid primary key default gen_random_uuid(),
  ssid           text not null check (char_length(ssid) between 1 and 64),
  open_free      boolean not null default true,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  note           text check (char_length(note) <= 280),
  source         text not null default 'manual' check (source in ('manual', 'auto')),
  contributor_id uuid references auth.users (id) on delete set null,
  confirmations  integer not null default 1 check (confirmations >= 1),
  first_seen     timestamptz not null default now(),
  last_confirmed timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.venus_wifi_spots is
  'Venus WiFi collective free/open WiFi spots. contributor_id is private — never expose it publicly; all public reads go through /api/venus-wifi with an explicit column list.';

-- Merge/lookup support: same-SSID candidates near a point (API refines by
-- exact haversine <= 75 m). Grid cell ~ 0.0007 deg ~ 75 m at the equator.
create index if not exists venus_wifi_spots_ssid_grid_idx
  on public.venus_wifi_spots (lower(ssid), floor(lat / 0.0007), floor(lng / 0.0007));

-- Radius reads + snapshot: freshest/live spots first.
create index if not exists venus_wifi_spots_last_confirmed_idx
  on public.venus_wifi_spots (last_confirmed desc);

-- Keep updated_at honest on any write path.
create or replace function public.venus_wifi_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists venus_wifi_spots_touch on public.venus_wifi_spots;
create trigger venus_wifi_spots_touch
  before update on public.venus_wifi_spots
  for each row execute function public.venus_wifi_touch_updated_at();

-- RLS: locked down. No anon/authenticated policies at all — the only access
-- is the service role (which bypasses RLS) through the Venus WiFi API
-- routes, after the route's own auth checks for writes.
alter table public.venus_wifi_spots enable row level security;

-- (Intentionally no policies: deny-all for direct PostgREST access.
--  Public reads are served by GET /api/venus-wifi/spots and
--  GET /api/venus-wifi/snapshot with an explicit public column list.)
