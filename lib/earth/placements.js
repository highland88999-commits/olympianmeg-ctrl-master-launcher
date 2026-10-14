// lib/earth/placements.js — pure placement math for generated Earth
// assets (TERRAFORM_PLAN.md §6). No DOM, no THREE: headless-testable,
// same discipline as lib/geo.js / lib/terrain.js.
//
// Every placement is grounded on the REAL terrain: the surface radius
// at a lat/lon is TERRAIN_RADIUS + displacementForHeight(sampleHeight)
// over the earth-topology heightmap, the position comes from
// latLonToVec3, and the asset stands upright along the sphere normal.
// Tripo models are origin-centred and height-normalized, so the
// grounded origin is raised along the normal by half the asset's
// world height. World height uses true scale (scaleM metres on a
// 6,371 km planet); VISIBILITY_EXAGGERATION is the scene layer's LOD
// concern, not this module's — placements stay honest.
import { latLonToVec3, EARTH_RADIUS } from '../geo.js';
import {
  sampleHeight,
  displacementForHeight,
  TERRAIN_RADIUS,
} from '../terrain.js';

export const METRES_PER_HUB_UNIT = 6371000 / EARTH_RADIUS;

/** Surface radius (hub units) of the displaced terrain at lat/lon. */
export function surfaceRadiusAt(heightData, w, h, lat, lon) {
  const u = (lon + 180) / 360;
  const v = (lat + 90) / 180;
  return TERRAIN_RADIUS + displacementForHeight(
    sampleHeight(heightData, w, h, u, v));
}

/** Grounded transform for one asset standing at lat/lon.
 *  asset: bridge entry (nativeSize, scaleM, scaleFactor).
 *  Returns { position, normal, worldHeight, scaleFactor } where
 *  position is the model's origin (its centre) with its base resting
 *  on the terrain surface. */
export function groundedPlacement(asset, heightData, w, h, lat, lon) {
  const r = surfaceRadiusAt(heightData, w, h, lat, lon);
  const pos = latLonToVec3(lat, lon, r);
  const mag = Math.hypot(pos.x, pos.y, pos.z);
  const normal = { x: pos.x / mag, y: pos.y / mag, z: pos.z / mag };
  const worldHeight = asset.scaleM / METRES_PER_HUB_UNIT;
  return {
    position: {
      x: pos.x + (normal.x * worldHeight) / 2,
      y: pos.y + (normal.y * worldHeight) / 2,
      z: pos.z + (normal.z * worldHeight) / 2,
    },
    surfacePoint: pos,
    normal,
    worldHeight,
    surfaceRadius: r,
    scaleFactor: asset.scaleFactor,
  };
}

/** Display placement for the scene layer. True-scale assets are
 *  invisible on a 55-unit globe (a 22 m pine is 0.00019 units), so the
 *  scene renders them at a fixed exaggeration — DISPLAY_UNITS_PER_
 *  METRE hub units per real metre — while placementsFor() stays at
 *  honest true scale. Grounding math is identical: origin raised
 *  along the normal by half the DISPLAY height. */
export const DISPLAY_UNITS_PER_METRE = 0.016;

export function displayPlacement(asset, heightData, w, h, lat, lon,
                                 unitsPerMetre = DISPLAY_UNITS_PER_METRE) {
  const g = groundedPlacement(asset, heightData, w, h, lat, lon);
  const displayHeight = asset.scaleM * unitsPerMetre;
  return {
    ...g,
    displayHeight,
    displayScale: displayHeight / asset.nativeSize[1],
    position: {
      x: g.surfacePoint.x + (g.normal.x * displayHeight) / 2,
      y: g.surfacePoint.y + (g.normal.y * displayHeight) / 2,
      z: g.surfacePoint.z + (g.normal.z * displayHeight) / 2,
    },
  };
}

/** Extract the machine anchor ("anchor 50.0,-86.0") from a queue
 *  region string, or null. Anchors are how scatter/segment/farm
 *  placements get coordinates before surveyed siting exists. */
export function anchorFromRegion(region) {
  if (!region) return null;
  const m = /anchor\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(region);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  // Fallback phrasing in the queue: "... Edmonton 53.55,-113.49" — a
  // trailing coordinate pair without the word 'anchor'. Take the
  // LAST pair in the string. No pair at all -> null (the asset is a
  // documented placement gap, never guessed).
  const pairs = [...region.matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)];
  if (!pairs.length) return null;
  const last = pairs[pairs.length - 1];
  return { lat: parseFloat(last[1]), lon: parseFloat(last[2]) };
}

/** Deterministic PRNG (mulberry32) seeded per asset id — scatter is
 *  stable across loads and identical for every visitor. */
export function seededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Placement list for one bridge asset.
 *  - single with lat/lon: one exact placement.
 *  - single without lat/lon (farm kit): one placement at the region
 *    anchor, nudged by the deterministic farm offset for its id so a
 *    farmstead composes instead of stacking.
 *  - instanced-scatter: `count` placements scattered within
 *    radiusDeg of the anchor, each grounded on its own sample.
 *  - segment-repeat: `count` placements along a line from the anchor
 *    (heading from the asset, default east), each grounded.
 *  Returns [] when the asset has neither coordinates nor an anchor —
 *  the scene layer skips it rather than placing it wrong. */
export function placementsFor(asset, heightData, w, h, opts = {}) {
  const p = asset.placement || {};
  const out = [];
  const push = (lat, lon, headingDeg) => {
    const g = opts.displayUnitsPerMetre
      ? displayPlacement(asset, heightData, w, h, lat, lon,
                         opts.displayUnitsPerMetre)
      : groundedPlacement(asset, heightData, w, h, lat, lon);
    out.push({ ...g, lat, lon, headingDeg: headingDeg ?? p.headingDeg ?? 0 });
  };

  if (p.mode === 'single' && p.lat != null && p.lon != null) {
    push(p.lat, p.lon, p.headingDeg);
    return out;
  }
  const anchor = anchorFromRegion(p.region);
  if (!anchor) return out;

  if (p.mode === 'single') {
    const off = FARM_OFFSETS[asset.id] || { dLat: 0, dLon: 0 };
    push(anchor.lat + off.dLat, anchor.lon + off.dLon, p.headingDeg);
    return out;
  }
  if (p.mode === 'instanced-scatter') {
    const count = opts.scatterCount ?? 48;
    const radiusDeg = opts.scatterRadiusDeg ?? 1.6;
    const rand = seededRandom(asset.id);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * radiusDeg;
      push(
        anchor.lat + Math.sin(a) * rr,
        anchor.lon + (Math.cos(a) * rr) / Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180)),
        Math.floor(rand() * 360),
      );
    }
    return out;
  }
  if (p.mode === 'segment-repeat') {
    const count = opts.segmentCount ?? 9;
    const stepDeg = opts.segmentStepDeg ?? 0.35;
    const heading = ((p.headingDeg ?? 90) * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const d = (i - (count - 1) / 2) * stepDeg;
      push(
        anchor.lat + Math.sin(heading) * d,
        anchor.lon + (Math.cos(heading) * d) / Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180)),
        p.headingDeg ?? 90,
      );
    }
    return out;
  }
  return out;
}

/** Farmstead composition: the Alberta farm kit shares one anchor;
 *  these small offsets (degrees, ~hundreds of metres) arrange the
 *  four pieces around it instead of stacking them on one point. */
export const FARM_OFFSETS = {
  'e021-red-gambrel-barn': { dLat: 0, dLon: 0 },
  'e022-grain-silo': { dLat: 0.004, dLon: 0.006 },
  'e023-prairie-farmhouse': { dLat: -0.006, dLon: 0.009 },
  'e024-farm-windmill': { dLat: 0.007, dLon: -0.008 },
};
