// lib/earth2/base-vehicles.js
// EARTH 2 — BASE VEHICLES (Merlin, 2026-11-13): a plane and a
// Lambo parked on each base — Merlin's (olympiannexus@gmail.com,
// home base E2-0619) and Devan's (fishstart@hotmail.com, E2-0719).
//
// The assignment is data, not a purchase: Merlin ordered the
// machines onto the two bases directly. They ride the same device
// ledger as every buyer-chosen parcel vehicle (earth2:vehicles:v1)
// under slotted keys (lib/earth2/vehicles.js parcelVehicleId with
// a slot — one vehicle per slot, so a parcel can hold both a plane
// and a Lambo). The scene seeds them on entry (seedBaseVehicleStates
// below); the seed never overwrites a key that already exists, so
// a machine driven away stays where its driver left it, and the
// owner's own re-pick is never clobbered.
//
// Ownership is the land title, as always (Merlin, 2026-11-01): a
// parcel vehicle belongs to the parcel's title holder — only the
// holder may board (the scene's parcelVehicleIsMine gate). The
// owner_email here is a record of whose base it is, not a second
// ownership system: if the land ever changes hands, the title
// decides, and this assignment should be re-pointed.
//
// The server mirror is supabase/earth2-base-vehicles.sql (staged,
// NOT RUN — needs Merlin's green light): the same four rows in
// earth2_parcel_vehicles, keyed (parcel_id, vehicle_slot). Until
// it runs, this module + the device ledger are the assignment.
//
// Pure — no Supabase, no DOM.

import { parcelById } from './parcels.js';
import { parcelCenterWorld, heightAt, WATER_Y } from './world.js';
import { PARCEL_SHRINK_SCALE } from './parcel-shrink.js';
import { parcelVehicleId, modelSpec } from './vehicles.js';
import { EARTH2_GUEST_EMAIL, POC_OWNER_PARCEL_ID, POC_GUEST_PARCEL_ID } from './access.js';
import { OWNER_EMAIL } from '../owner.js';

/**
 * Merlin's home base: his first-acquired parcel (the POC grant,
 * lib/earth2/access.js — the one definition of the grants).
 */
export const MERLIN_BASE_PARCEL_ID = POC_OWNER_PARCEL_ID;
export const MERLIN_EMAIL = OWNER_EMAIL;

/**
 * Devan's base: the POC guest parcel. The guest email lives ONLY
 * in lib/earth2/access.js (isolation law) — it is imported here,
 * never copied.
 */
export const DEVAN_BASE_PARCEL_ID = POC_GUEST_PARCEL_ID;
export const DEVAN_EMAIL = EARTH2_GUEST_EMAIL;

/** The plane: Earth 2's VTOL Scout — the fleet's only flying machine. */
export const BASE_PLANE_SLUG = 'vtol';
/** The Lambo: Earth 1's Lamborghini Aventador, bridged onto Earth 2 land. */
export const BASE_LAMBO_SLUG = 'earth1:wedge-supercar';

/**
 * The assignments, one entry per base. Each vehicle parks at a
 * fixed offset from the parcel centre (dry ground, inside the
 * 28 m parcel — verified by tests/earth2-base-package.test.mjs):
 * the VTOL 6 m north of centre facing north (her rolling runway
 * takeoff runs out over open Commons), the Lambo 8 m east and
 * 6 m south of centre facing east.
 */
export const BASE_VEHICLE_ASSIGNMENTS = Object.freeze([
  Object.freeze({
    parcelId: MERLIN_BASE_PARCEL_ID,
    ownerEmail: MERLIN_EMAIL,
    ownerName: 'Merlin',
    vehicles: Object.freeze([
      Object.freeze({ slot: BASE_PLANE_SLUG, slug: BASE_PLANE_SLUG, name: 'VTOL Scout', offsetX: 0, offsetZ: -6, heading: 0 }),
      Object.freeze({ slot: BASE_LAMBO_SLUG, slug: BASE_LAMBO_SLUG, name: 'Lamborghini Aventador', offsetX: 8, offsetZ: 6, heading: Math.PI / 2 }),
    ]),
  }),
  Object.freeze({
    parcelId: DEVAN_BASE_PARCEL_ID,
    ownerEmail: DEVAN_EMAIL,
    ownerName: 'Devan',
    vehicles: Object.freeze([
      Object.freeze({ slot: BASE_PLANE_SLUG, slug: BASE_PLANE_SLUG, name: 'VTOL Scout', offsetX: 0, offsetZ: -6, heading: 0 }),
      Object.freeze({ slot: BASE_LAMBO_SLUG, slug: BASE_LAMBO_SLUG, name: 'Lamborghini Aventador', offsetX: 8, offsetZ: 6, heading: Math.PI / 2 }),
    ]),
  }),
]);

/** The parking spot for one assigned vehicle: { x, z, heading }. */
export function baseVehicleSpot(parcelId, vehicle) {
  const parcel = parcelById(parcelId);
  if (!parcel || !vehicle) return null;
  const c = parcelCenterWorld(parcel);
  return {
    x: c.x + (vehicle.offsetX || 0),
    z: c.z + (vehicle.offsetZ || 0),
    heading: vehicle.heading || 0,
  };
}

/**
 * The four assigned machines as ledger states, keyed by slotted
 * parcel-vehicle id: { [id]: { slug, parcelId, x, z, heading,
 * speed, alt, integrity, wrecked, awaySince } }. A spot whose
 * ground is not dry is skipped honestly (never parks a machine
 * in water). Only slugs the drive model knows (modelSpec) are
 * included — an unknown slug never reaches the scene.
 * MINIATURE (Merlin, 2026-11-14): the bases are owned parcels,
 * so their machines park miniature — the stored spot is the
 * miniature spot (parcel center + offset * 0.25), stamped
 * miniature: true, so the machine renders as a little model on
 * the base from the first entry, no migration needed.
 */
export function baseVehicleStates() {
  const out = {};
  for (const base of BASE_VEHICLE_ASSIGNMENTS) {
    for (const v of base.vehicles) {
      if (!modelSpec(v.slug)) continue;
      const spot = baseVehicleSpot(base.parcelId, v);
      if (!spot) continue;
      if (heightAt(spot.x, spot.z) <= WATER_Y) continue;
      const parcel = parcelById(base.parcelId);
      const c = parcel ? parcelCenterWorld(parcel) : { x: spot.x, z: spot.z };
      out[parcelVehicleId(base.parcelId, v.slot)] = {
        slug: v.slug,
        parcelId: base.parcelId,
        x: c.x + (spot.x - c.x) * PARCEL_SHRINK_SCALE,
        z: c.z + (spot.z - c.z) * PARCEL_SHRINK_SCALE,
        heading: spot.heading,
        speed: 0,
        alt: 0,
        integrity: 100,
        wrecked: false,
        awaySince: null,
        miniature: true,
      };
    }
  }
  return out;
}

/**
 * Seed the assigned machines into a vehicle-state map (the
 * scene's ledger on entry). Keys that already exist are NEVER
 * overwritten — a driven-away machine keeps its driver's spot,
 * and an owner's own choice stands. Returns the input map
 * unchanged when nothing is missing.
 */
export function seedBaseVehicleStates(states) {
  const seeded = baseVehicleStates();
  const keys = Object.keys(seeded);
  if (!keys.length) return states;
  let missing = false;
  for (const k of keys) {
    if (!states || !states[k]) { missing = true; break; }
  }
  if (!missing) return states;
  const out = { ...(states || {}) };
  for (const k of keys) {
    if (!out[k]) out[k] = seeded[k];
  }
  return out;
}
