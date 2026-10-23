// lib/earth2/airport.js
// EARTH 2 — TYRRELL FIELD, THE FIRST AIRPORT (Merlin's airport
// law, 2026-10-22): "airports exist ONLY on Free Commons parcels —
// public infrastructure on public land; one per country, seated
// at country-landmark parcels." The country network is the full
// vision; this first field (Vehicles Phase 1, 2026-10-23) serves
// the Cinder Grove landing ↔ Drumheller corridor, standing a
// short walk west of the Royal Tyrrell Museum it is named for.
//
// THE SITE — chosen by the data, on the castle's and the museum's
// terms (the designation lives in lib/earth2/parcels.js): a 2 × 2
// block of Free Commons (E2-0557, E2-0558, E2-0607, E2-0608 —
// Silent Shore / Verdant Steppe) plus its northern pair as the
// grounds (E2-0507, E2-0508). All six were already Free Commons
// under the interleave, so the 1,000 / 1,500 split is untouched.
// The block reads flat and dry off the world's own heightfield:
// heights 0.65–3.32 m, no water anywhere on it, its gentle fall
// running east–west — so the terminal rides the flat north–south
// axis, frontage along z, its face turned east toward the museum
// approach. It stands ~82 m from the museum grounds and ~602 m
// from the landing meadow: an easy walk from Hammond's counter,
// and beyond the stream load radius, so the field never sits
// resident at spawn (lib/earth2/streaming.js, the 'airport' unit).
// Protected in lib/earth2/building.js on the museum's terms:
// never ownable, never buildable, never rented — public ground.
//
// The terminal model and the fleet land through the foundry
// pipeline like every Earth 2 arrival; this module is the data
// they mount onto — the site, the grounds, the apron, and where
// each vehicle sleeps.

import {
  AIRPORT_NAME,
  AIRPORT_PARCEL_ID,
  airportParcel,
  airportCoreParcels,
  airportGroundsParcels,
  isAirportParcel,
  isAirportCoreParcel,
} from './parcels.js';
import { parcelCenterWorld, heightAt } from './world.js';

export { AIRPORT_NAME, AIRPORT_PARCEL_ID };

/** The town the field serves — Earth 2's Drumheller, like the
 *  museum it is named for. */
export const AIRPORT_TOWN = 'Drumheller';

/** The airfield site: the institution, its core, its grounds. */
export const AIRPORT_SITE = Object.freeze({
  name: AIRPORT_NAME,
  town: AIRPORT_TOWN,
  parcelId: AIRPORT_PARCEL_ID,
  // Public ground, on the castle's terms (see the header): the
  // grounds can never be owned, listed, rented or built on.
  kind: 'commons',
  ownable: false,
  protected: true,
});

/** The site's anchor parcel (the core block's north-west). */
export function airportSiteParcel() {
  return airportParcel();
}

/** The terminal's ground: the 2 × 2 core block. */
export function airportCore() {
  return airportCoreParcels();
}

/** The grounds: the core block plus its northern pair. */
export function airportGrounds() {
  return airportGroundsParcels();
}

/** The grounds' parcel ids, in index order. */
export function airportGroundsIds() {
  return airportGroundsParcels().map((p) => p.id);
}

/** True for a parcel of the airfield core block. */
export function isAirportCore(parcel) {
  return isAirportCoreParcel(parcel);
}

/** True for any parcel of the airfield grounds. */
export function isAirportGrounds(parcel) {
  return isAirportParcel(parcel);
}

// The terminal's seat: the core block's centre, grounded on the
// real terrain. The diorama's frontage (its wide axis) rides z —
// the block's flat axis — with its face turned east (+x) toward
// the museum approach; the mounting phase confirms the facing
// against the model on-device, the same discipline the museum
// mount follows.
const core = airportCoreParcels();
const c0 = parcelCenterWorld(core[0]);
const c3 = parcelCenterWorld(core[3]);
export const AIRPORT_CENTER = Object.freeze({
  x: (c0.x + c3.x) / 2,
  z: (c0.z + c3.z) / 2,
});
export const AIRPORT_HEADING = Math.PI / 2; // face east, frontage along z
export const AIRPORT_SEAT = Object.freeze({
  x: AIRPORT_CENTER.x,
  z: AIRPORT_CENTER.z,
  y: heightAt(AIRPORT_CENTER.x, AIRPORT_CENTER.z),
  heading: AIRPORT_HEADING,
  sink: 0.4,
});

// ── The apron & the fleet's parking ─────────────────────────────
// The fleet sleeps on the apron east of the terminal — the
// museum side, where arrivals walk in — in a row along z, each
// machine facing east like the field itself. A parking spot is
// a vehicle's home: it spawns there, and the drive logic
// (lib/earth2/vehicles.js) measures "put away" against it.
const APRON_X = AIRPORT_CENTER.x + 20; // 8 m clear of the terminal's east face

function parkingSpot(slug, z) {
  return Object.freeze({
    slug,
    x: APRON_X,
    z,
    y: heightAt(APRON_X, z),
    heading: Math.PI / 2, // facing east, out toward the approach
  });
}

export const AIRPORT_PARKING = Object.freeze([
  parkingSpot('vtol', AIRPORT_CENTER.z - 26),
  parkingSpot('scarab', AIRPORT_CENTER.z - 6),
  parkingSpot('rover', AIRPORT_CENTER.z + 12),
  parkingSpot('speed-bike', AIRPORT_CENTER.z + 26),
]);

/** One vehicle's home spot by slug, or null. */
export function airportParkingFor(slug) {
  return AIRPORT_PARKING.find((s) => s.slug === slug) || null;
}

/** Where a visitor stands to take the field in: the apron's east
 *  edge, facing the terminal and the fleet. */
export const AIRPORT_APRON = Object.freeze({
  parcelId: AIRPORT_PARCEL_ID,
  x: APRON_X + 6,
  z: AIRPORT_CENTER.z,
  y: heightAt(APRON_X + 6, AIRPORT_CENTER.z),
});
