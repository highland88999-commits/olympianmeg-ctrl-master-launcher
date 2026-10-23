// lib/earth2/museum.js
// EARTH 2 — THE ROYAL TYRRELL MUSEUM & JOHN HAMMOND (Merlin,
// 2026-10-22): "a model of the Royal Tyrrell Museum… this will
// live in the equivalent of Drumheller. Users can hunt dinosaurs,
// when a dinosaur dies, it drops fossils. Users bring fossils to
// John Hammond at the museum in exchange for either gold or
// aether" — and occasionally he hands over a weapon instead
// (the exchange engine is lib/earth2/hammond.js; the fossils
// themselves are lib/earth2/fossils.js).
//
// THE SITE — Earth 2's Drumheller is where Drumheller is. The
// parcel grid carries Earth's own coordinates (Athens, Everest
// and the castle all sit at their real lat/lon), so the museum
// stands on the parcel containing the REAL Royal Tyrrell Museum's
// coordinates — 51.4792° N, 112.7897° W, in Midland Provincial
// Park just outside Drumheller, Alberta, in the badlands of the
// Red Deer River valley. That parcel (E2-0510) and its north and
// south neighbours are the museum grounds, designated in
// lib/earth2/parcels.js on the castle's terms: Free Commons
// forever, never ownable — and protected in lib/earth2/building.js:
// never buildable, even by a title holder. A public institution
// on public land; nobody can buy the ground under it, and no rent
// ever applies there (Free Commons short-circuit the rent engine).
//
// The Tripo model (museum + parking lot, Merlin's amendment) and
// Hammond's rigged figure land through the foundry pipeline like
// every Earth 2 cast member; this module is the data they mount
// onto — the site, the grounds, and where the founder stands.

import {
  MUSEUM_NAME,
  MUSEUM_PARCEL_ID,
  museumParcel,
  museumGroundsParcels,
  isMuseumParcel,
  isMuseumSiteParcel,
} from './parcels.js';
import { parcelCenterWorld, heightAt } from './world.js';

export { MUSEUM_NAME, MUSEUM_PARCEL_ID };

/** The town the museum serves — Earth 2's Drumheller. */
export const MUSEUM_TOWN = 'Drumheller';

/** The real-world coordinates the site was designated by: the
 *  Royal Tyrrell Museum, Midland Provincial Park, Alberta. */
export const MUSEUM_COORDS = Object.freeze({ lat: 51.4792, lon: -112.7897 });

/** The museum site: the institution, its parcel, its grounds. */
export const MUSEUM_SITE = Object.freeze({
  name: MUSEUM_NAME,
  town: MUSEUM_TOWN,
  parcelId: MUSEUM_PARCEL_ID,
  coords: MUSEUM_COORDS,
  // Public ground, on the castle's terms (see the header): the
  // grounds can never be owned, listed, rented or built on.
  kind: 'commons',
  ownable: false,
  protected: true,
});

/** The site parcel itself (a parcels.js parcel object). */
export function museumSiteParcel() {
  return museumParcel();
}

/** The grounds: site parcel + its north and south neighbours. */
export function museumGrounds() {
  return museumGroundsParcels();
}

/** The grounds' parcel ids, in index order. */
export function museumGroundsIds() {
  return museumGroundsParcels().map((p) => p.id);
}

/** True for the museum's site parcel itself. */
export function isMuseumSite(parcel) {
  return isMuseumSiteParcel(parcel);
}

/** True for any parcel of the museum grounds. */
export function isMuseumGrounds(parcel) {
  return isMuseumParcel(parcel);
}

// ── John Hammond ─────────────────────────────────────────────────
// The founder keeps his counter at the museum. The stand point is
// the site parcel's centre stepped toward its south edge — the
// entrance side, where the parking lot sits in the build — on the
// real terrain height. The mounting phase seats his rigged figure
// here and confirms the facing against the model's measured
// forward axis, the same discipline the Bay's cast follows.
const site = museumParcel();
const siteCenter = parcelCenterWorld(site);
const standX = siteCenter.x;
const standZ = siteCenter.z + 8;
const HAMMOND_STAND = Object.freeze({
  x: standX,
  z: standZ,
  y: heightAt(standX, standZ),
});

export const HAMMOND_NPC = Object.freeze({
  id: 'john-hammond',
  name: 'John Hammond',
  role: 'Founder of the Royal Tyrrell Museum',
  exchange: 'Fossils for gold or aether — his choice of surprise, occasionally a weapon',
  parcelId: MUSEUM_PARCEL_ID,
  stand: HAMMOND_STAND,
  // Faces the entrance and the parking lot (south, +z); the
  // mounting phase confirms against the rig's forward axis.
  heading: Math.PI,
});

/** Where the fossil exchange anchors in the world — Hammond's
 *  counter, at his stand point on the museum grounds. */
export const MUSEUM_EXCHANGE_POINT = Object.freeze({
  parcelId: MUSEUM_PARCEL_ID,
  x: HAMMOND_STAND.x,
  z: HAMMOND_STAND.z,
  y: HAMMOND_STAND.y,
});
