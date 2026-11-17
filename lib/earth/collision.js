// lib/earth/collision.js — solid object collision for hub Earth street view.
//
// Pure math, no DOM, no THREE. Circle colliders for single-placement
// assets (buildings, landmarks, walls, oil rigs, props). The walker and
// bike both check before moving; blocked movement slides or stops.
//
// Model:
// - Each single-placement asset gets a circle collider at its lat/lon.
// - Collider radius = max(asset.scaleM / 2, 1.0) DISPLAY metres
//   (minimum 1m) — the rendered footprint is ~scaleM display
//   metres wide (displayScaleFor, lib/earth/placements.js), so
//   the number is the display radius, not a real-Earth one.
// - Player radius = 0.5m (on foot), bike radius = 1.5m, car
//   radius = half its lengthM — all DISPLAY metres, the unit
//   the walker, bike and car all drive in (1° ≈ 60 display m
//   on the 55-unit globe; see the display-scale block below).
// - Haversine distance in DISPLAY metres for lat/lon proximity.
// - On bike: vegetation/props are pass-through, but mountains, large
//   structures, and small structures (oil rigs etc.) stay solid.

import { EARTH_ASSETS } from './assets.js';
import { isEarthObjectStaged } from './staged-objects.js';
import {
  getInteriors,
  interiorById,
  localOffsetsM,
  bearingDegOf,
  angleDiffDeg,
} from './interiors.js';

const EARTH_RADIUS_M = 6371000;

/** Haversine distance in REAL metres between two lat/lon points.
 *  Kept (unchanged) for callers that genuinely mean real Earth;
 *  collision itself does NOT use it — see haversineDisplayM. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Display scale — the unit split behind every distance in this file
// (Merlin's 55.9 s Muscle Car video, 2026-11-16; same bug as
// lib/earth/kart.js, same fix pattern, mirrored here)
//
// The walker, bike and car all drive in DISPLAY metres: the car
// steps lat/lon by (speed x dt x 3) display metres over the
// 55-unit globe, so one degree of lat/lon is ~60 display metres
// — NOT 111,320 real metres. checkCollision used to measure with
// haversineM (real Earth) while comparing against asset radii
// (scaleM/2 — the rendered footprint in display metres) and a
// display-metre player radius. A real-metre reading of a
// display-metre step is 1,855x too large, so the car essentially
// never collided: a 12 m building (radius 6 display m) at 10
// display m — 0.167° — read as 18,553 real m away, 2,800x past
// its 8.3 m trigger (radius + car radius). Only gigantic assets
// at point-blank ever fired (Fuji, scaleM 3,776: radius 1,888
// real m needs the car within 1.02 display m of its centre).
//
// The fix lives HERE, in this file only: haversineM itself is
// NOT touched (lib/earth/interiors.js mirrors its formula, and
// other readers mean real metres). Distances in this file are
// display metres, measured by haversineDisplayM. The radius
// numbers keep their values and now mean display metres.
// ---------------------------------------------------------------------------

/** Display metres per degree of lat/lon on the 55-unit globe —
 *  same formula as lib/earth/kart.js (TERRAIN_RADIUS 55,
 *  DISPLAY_UNITS_PER_METRE 0.016), values inlined so this pure
 *  module stays THREE-free (lib/terrain.js imports three). */
export const DISPLAY_M_PER_DEGREE = ((2 * Math.PI * 55) / 360) / 0.016;
/** Real (haversine) metres per display metre — the 1,855x split. */
export const HAVERSINE_M_PER_DISPLAY_M = 111320 / DISPLAY_M_PER_DEGREE;

/** Great-circle distance between two lat/lon points, in DISPLAY
 *  metres — the unit the walker, bike and car drive in.
 *  haversineM (real Earth) scaled by the display/real
 *  circumference ratio. */
export function haversineDisplayM(lat1, lon1, lat2, lon2) {
  return haversineM(lat1, lon1, lat2, lon2) / HAVERSINE_M_PER_DISPLAY_M;
}

/**
 * Build the collider list from single-placement assets.
 * Returns [{ lat, lon, radiusM, id, category, name }].
 * Categories 'building', 'landmark', 'prop' are solid.
 * 'terrain' singles (mountains, rock formations) are solid.
 */
export function buildColliders() {
  const out = [];
  const seen = new Set();
  for (const a of EARTH_ASSETS) {
    // Earth 1 simplification (2026-10-26): staged objects are
    // de-wired from the scene, so their colliders go too —
    // otherwise invisible walls would stand where visible
    // objects used to be. The Redwater spawn farm clones are
    // visual-only and never had colliders; gating their asset
    // ids here removes only the original farm-kit singles.
    if (isEarthObjectStaged(a.id)) continue;
    const p = a.placement || {};
    if (p.mode !== 'single' || p.lat == null || p.lon == null) continue;
    const cat = a.category || 'prop';
    // All single-placement categories are solid (buildings, landmarks,
    // props like walls/oil rigs, terrain features like mountains)
    const radiusM = Math.max((a.scaleM || 2) / 2, 1.0);
    const entry = {
      lat: p.lat,
      lon: p.lon,
      radiusM,
      id: a.id,
      category: cat,
      name: a.name || a.id,
    };
    // Interiors (Merlin, 2026-10-22): an enterable construct's
    // collider carries its door — the wall band stays solid
    // everywhere except the door sector (see checkCollision).
    const interior = interiorById(a.id);
    if (interior) {
      entry.door = {
        bearingDeg: interior.doorBearingDeg,
        widthM: interior.doorWidthM,
        wallM: interior.wallM,
        interiorId: interior.id,
      };
    }
    seen.add(a.id);
    out.push(entry);
  }
  // Anchor-resolved interiors (the farmstead, the prairie towers):
  // their manifest rows carry a region anchor, not exact lat/lon,
  // so the loop above skipped them — they had NO collider at all.
  // The interiors registry resolves their positions the same way
  // placementsFor() does, so their colliders (with doors) land
  // exactly where the models render.
  for (const interior of getInteriors()) {
    if (seen.has(interior.id)) continue;
    // Staged interiors (their asset ids are staged) publish no
    // collider either — their rooms are inert with the scene
    // layer unmounted.
    if (isEarthObjectStaged(interior.id)) continue;
    const entry = {
      lat: interior.lat,
      lon: interior.lon,
      radiusM: interior.radiusM,
      id: interior.id,
      category: interior.category,
      name: interior.name,
      door: {
        bearingDeg: interior.doorBearingDeg,
        widthM: interior.doorWidthM,
        wallM: interior.wallM,
        interiorId: interior.id,
      },
    };
    seen.add(interior.id);
    out.push(entry);
  }
  return out;
}

// Cached collider list (built once)
let _colliders = null;
export function getColliders() {
  if (!_colliders) _colliders = buildColliders();
  return _colliders;
}

/**
 * Publish colliders from the rendered placement layer (EarthAssets.jsx).
 * Merges scattered-instance colliders (trees, rocks) with the single-
 * placement list. Call after placements are computed.
 * Each entry: { lat, lon, radiusM, id, category, name }.
 */
export function publishColliders(list) {
  const base = buildColliders();
  const seen = new Set(base.map((c) => c.id + '@' + c.lat.toFixed(6) + ',' + c.lon.toFixed(6)));
  for (const c of list) {
    // Staged objects never re-enter through a published batch.
    if (isEarthObjectStaged(c.id)) continue;
    const key = c.id + '@' + c.lat.toFixed(6) + ',' + c.lon.toFixed(6);
    if (!seen.has(key)) {
      seen.add(key);
      base.push(c);
    }
  }
  _colliders = base;
}

/**
 * Check if a lat/lon position collides with any solid object.
 * Distances and radii are DISPLAY metres (see the display-scale
 * block above): a collider's radiusM is its display radius and
 * playerRadiusM is the caller's display radius (walker 0.5, car
 * half its lengthM).
 * @param {number} lat - latitude
 * @param {number} lon - longitude
 * @param {number} playerRadiusM - player/bike radius in display metres
 * @param {boolean} onBike - if true, vegetation is pass-through (not yet
 *   implemented for scatter; single-placement stays solid)
 * @returns {object|null} the collider hit, or null if clear
 */
export function checkCollision(lat, lon, playerRadiusM = 0.5, onBike = false) {
  const colliders = getColliders();
  for (const c of colliders) {
    // On bike: allow pass-through for vegetation (scatter not collidable yet,
    // so this is a no-op for now; single-placement stays solid per Merlin's rule:
    // "not mountains, large structure and small structures (like oil rigs)")
    if (onBike && c.category === 'vegetation') continue;
    const d = haversineDisplayM(lat, lon, c.lat, c.lon);
    if (c.door) {
      // Enterable construct (interiors system): three zones.
      // - Inside the wall band (d < radius - wall): the room
      //   itself — free movement, this collider never blocks.
      // - The wall band: solid EXCEPT the door sector, which
      //   passes both ways (position-based, so exit == entry and
      //   the walker can never be trapped).
      // - Outside the band (incl. the player-radius margin): free.
      // d, radiusM, wallM, door widthM and playerRadiusM are all
      // DISPLAY metres now. localOffsetsM below still returns
      // real-metre offsets (lib/earth/interiors.js), but only its
      // BEARING is used here — a direction, invariant under the
      // 1,855x rescale — so it needs no conversion.
      if (d < c.radiusM - c.door.wallM) continue;
      if (d >= c.radiusM + playerRadiusM) continue;
      const { eastM, northM } = localOffsetsM(c.lat, c.lon, lat, lon);
      const bearing = bearingDegOf(eastM, northM);
      const halfAngleDeg = (Math.asin(Math.min(1,
        (c.door.widthM / 2 + playerRadiusM) / Math.max(d, 0.5))) * 180) / Math.PI;
      if (angleDiffDeg(bearing, c.door.bearingDeg) <= halfAngleDeg) continue;
      return c;
    }
    if (d < c.radiusM + playerRadiusM) {
      return c;
    }
  }
  return null;
}

/**
 * Attempt to move from (lat, lon) to (newLat, newLon), blocking on collision.
 * Returns { lat, lon, blocked, hit } — blocked is true if movement was stopped.
 * Tries sliding: if direct path is blocked, tries lat-only and lon-only moves.
 */
export function moveWithCollision(lat, lon, newLat, newLon, playerRadiusM = 0.5, onBike = false) {
  // Direct move clear?
  if (!checkCollision(newLat, newLon, playerRadiusM, onBike)) {
    return { lat: newLat, lon: newLon, blocked: false, hit: null };
  }
  // Try sliding: lat-only
  if (!checkCollision(newLat, lon, playerRadiusM, onBike)) {
    return { lat: newLat, lon, blocked: true, hit: checkCollision(newLat, newLon, playerRadiusM, onBike) };
  }
  // Try sliding: lon-only
  if (!checkCollision(lat, newLon, playerRadiusM, onBike)) {
    return { lat, lon: newLon, blocked: true, hit: checkCollision(newLat, newLon, playerRadiusM, onBike) };
  }
  // Fully blocked
  return { lat, lon, blocked: true, hit: checkCollision(newLat, newLon, playerRadiusM, onBike) };
}
