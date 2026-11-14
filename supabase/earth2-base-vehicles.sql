-- supabase/earth2-base-vehicles.sql
-- *** STAGED ONLY — DO NOT RUN until Merlin green-lights it ***
-- (SQL hard gate: clean copy -> his green light -> execute.)
--
-- EARTH 2 — BASE VEHICLES (Merlin, 2026-11-13): the server mirror
-- of lib/earth2/base-vehicles.js — a VTOL Scout (plane) and a
-- Lamborghini Aventador (Lambo) on each base:
--   Merlin  (olympiannexus@gmail.com)  — home base E2-0619
--   Devan   (fishstart@hotmail.com)    — base E2-0719
--
-- One vehicle per SLOT: the key is (parcel_id, vehicle_slot), so
-- a parcel can hold both a plane and a Lambo. The slot is the
-- vehicle slug. The device ledger (earth2:vehicles:v1) is the live
-- assignment until this runs — the scene seeds the same four
-- machines on entry — and after it runs the server rows merge in
-- on entry (server wins).
--
-- Parking spots are parcel-centre offsets, dry ground inside the
-- 28 m parcel (verified in code: parcelCenterWorld + heightAt):
--   E2-0619 VTOL  (-182, -356) heading 0 (north, rolling takeoff)
--   E2-0619 Lambo (-174, -344) heading PI/2 (east)
--   E2-0719 VTOL  (-182, -300) heading 0 (north, rolling takeoff)
--   E2-0719 Lambo (-174, -288) heading PI/2 (east)
--
-- Ownership is the land title, as always (Merlin, 2026-11-01):
-- owner_email here is stamped from the earth2_parcels title, and
-- only the title holder may board. If the land ever changes
-- hands, the title decides and this assignment is re-pointed.

create table if not exists public.earth2_parcel_vehicles (
  parcel_id text not null,
  vehicle_slot text not null,
  owner_email text not null,
  vehicle_slug text not null,
  vehicle_name text,
  vehicle_source text,
  x double precision not null,
  z double precision not null,
  heading double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (parcel_id, vehicle_slot)
);

alter table public.earth2_parcel_vehicles enable row level security;
-- No client policies: the parcel-vehicles route reads/writes
-- through the service-role client only (owner-gated in code).

insert into public.earth2_parcel_vehicles
  (parcel_id, vehicle_slot, owner_email, vehicle_slug, vehicle_name, vehicle_source, x, z, heading, updated_at)
values
  ('E2-0619', 'vtol', 'olympiannexus@gmail.com', 'vtol', 'VTOL Scout', 'earth2', -182, -356, 0, now()),
  ('E2-0619', 'earth1:wedge-supercar', 'olympiannexus@gmail.com', 'earth1:wedge-supercar', 'Lamborghini Aventador', 'earth', -174, -344, 1.5707963267948966, now()),
  ('E2-0719', 'vtol', 'fishstart@hotmail.com', 'vtol', 'VTOL Scout', 'earth2', -182, -300, 0, now()),
  ('E2-0719', 'earth1:wedge-supercar', 'fishstart@hotmail.com', 'earth1:wedge-supercar', 'Lamborghini Aventador', 'earth', -174, -288, 1.5707963267948966, now())
on conflict (parcel_id, vehicle_slot) do update set
  owner_email = excluded.owner_email,
  vehicle_slug = excluded.vehicle_slug,
  vehicle_name = excluded.vehicle_name,
  vehicle_source = excluded.vehicle_source,
  x = excluded.x,
  z = excluded.z,
  heading = excluded.heading,
  updated_at = now();

-- Verify: expect exactly these four rows.
select parcel_id, vehicle_slot, owner_email, vehicle_slug, x, z, heading
from public.earth2_parcel_vehicles
where parcel_id in ('E2-0619', 'E2-0719')
order by parcel_id, vehicle_slot;
