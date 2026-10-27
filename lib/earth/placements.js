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
  TERRAIN_SEA_LEVEL,
  TERRAIN_ELEVATION_SCALE,
} from '../terrain.js';
// Street-level flat mode (Merlin, 2026-10-26): while roaming, the
// ground samplers return the constant sea-level radius instead of
// the heightmap displacement, so every street consumer agrees on
// one flat floor. Default OFF — orbit and all existing tests see
// the real terrain unchanged.
import { isStreetFlatActive } from './street-flat.js';

export const METRES_PER_HUB_UNIT = 6371000 / EARTH_RADIUS;

// Hub units per degree of arc on the globe surface (2πR / 360).
export const HUB_UNITS_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS) / 360;

/** Surface radius (hub units) of the displaced terrain at lat/lon.
 *  Flat mode: the constant sea-level radius — the whole street
 *  floor, everywhere, with no hills to pitch or bob over. */
export function surfaceRadiusAt(heightData, w, h, lat, lon) {
  if (isStreetFlatActive()) return TERRAIN_RADIUS;
  const u = (lon + 180) / 360;
  const v = (lat + 90) / 180;
  return TERRAIN_RADIUS + displacementForHeight(
    sampleHeight(heightData, w, h, u, v));
}

/** The fallback globe's sphere density on the street device
 *  (buildTerrainGeometry's mobile grid, lib/terrain.js: 96×72 —
 *  the desktop 160×120 grid deviates LESS, so clearing the coarse
 *  grid clears both). */
export const GLOBE_GRID_W = 96;
export const GLOBE_GRID_H = 72;

/** The globe's own rendered surface radius at lat/lon, as the
 *  coarse sphere actually draws it: the heightmap decimated onto
 *  the globe grid, bilinear-interpolated within the grid cell.
 *  (The true 3D facet plane sags at or below this radial estimate
 *  between vertices, so the estimate is the conservative one.)
 *  Anything that must never sink under the DRAWN world — ground
 *  drapes, camera clamps — rides the higher of this and the true
 *  sampled surface (round 3 put the street patch on it; round 4
 *  extends the same law to the camera clamps, Earth round-4
 *  defect 5). Lives here, the leaf module, so every consumer can
 *  import it without a cycle; lib/earth/street-patch.js re-exports
 *  it for its original callers. */
export function globeGridSurfaceRadius(heightData, w, h, lat, lon) {
  // Flat mode: the drawn globe is a smooth sphere (the globe
  // component morphs its geometry flat while roaming), so the
  // grid estimate is the same constant — a camera clamp reading
  // hill heights would float the lens over ground that is not
  // there.
  if (isStreetFlatActive()) return TERRAIN_RADIUS;
  const u = (lon + 180) / 360;
  const v = (lat + 90) / 180;
  const gu = Math.min(Math.max(u, 0), 1) * GLOBE_GRID_W;
  const gv = Math.min(Math.max(v, 0), 1) * GLOBE_GRID_H;
  const i0 = Math.min(Math.floor(gu), GLOBE_GRID_W - 1);
  const j0 = Math.min(Math.floor(gv), GLOBE_GRID_H - 1);
  const fu = gu - i0;
  const fv = gv - j0;
  const at = (i, j) => sampleHeight(
    heightData, w, h,
    Math.min(i, GLOBE_GRID_W) / GLOBE_GRID_W,
    Math.min(j, GLOBE_GRID_H) / GLOBE_GRID_H,
  );
  const hg = (at(i0, j0) * (1 - fu) + at(i0 + 1, j0) * fu) * (1 - fv)
    + (at(i0, j0 + 1) * (1 - fu) + at(i0 + 1, j0 + 1) * fu) * fv;
  return TERRAIN_RADIUS + (hg - TERRAIN_SEA_LEVEL) * TERRAIN_ELEVATION_SCALE;
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

// Display caps (Day 2 audit, earth-build/proof/street_audit_e3e4.md
// §4.2): before the caps, scaleM was trusted unbounded — the Fuji
// stratovolcano (scaleM 3,776) rendered 63 units wide, wider than
// the planet, and floated off its limb, and Table Mountain drew as
// a 35-unit slab. No placed asset may exceed 375 display metres of
// height (6.0 units) or 500 display metres of footprint (8.0
// units). scaleM stays honest — it still records the asset's real
// metres; only the display size is capped, here, in the one place
// every display placement flows through.
export const DISPLAY_HEIGHT_CAP_M = 375;
export const DISPLAY_FOOTPRINT_CAP_M = 500;

/** The capped display size of an asset. nativeSize is the bridge's
 *  WORLD-space size (the GLB node transform included — the bridge
 *  generator measures the transformed bounds), so the rendered
 *  size is nativeSize × displayScale on both the single and
 *  instanced paths. horizPerHeight: how wide the model is per unit
 *  of height — footprint-capping a wide asset shrinks its height
 *  with it. */
export function displayScaleFor(asset, unitsPerMetre = DISPLAY_UNITS_PER_METRE,
                                heightCapM = DISPLAY_HEIGHT_CAP_M) {
  const [nx, ny, nz] = asset.nativeSize;
  const horizPerHeight = Math.max(nx, nz) / Math.max(ny, 1e-6);
  const heightM = Math.min(
    asset.scaleM,
    heightCapM,
    DISPLAY_FOOTPRINT_CAP_M / Math.max(horizPerHeight, 1e-6),
  );
  const displayHeight = heightM * unitsPerMetre;
  return {
    heightM,
    displayHeight,
    displayScale: displayHeight / Math.max(ny, 1e-6),
    footprint: horizPerHeight * displayHeight,
  };
}

export function displayPlacement(asset, heightData, w, h, lat, lon,
                                 unitsPerMetre = DISPLAY_UNITS_PER_METRE,
                                 heightCapM = DISPLAY_HEIGHT_CAP_M) {
  const g = groundedPlacement(asset, heightData, w, h, lat, lon);
  const { displayHeight, displayScale } = displayScaleFor(asset, unitsPerMetre, heightCapM);
  // Former-waterline assets (bridge placement.sinkFrac: icebergs,
  // reef) sit on the old seabed: the origin raise is reduced by
  // that fraction of the displayed height so the model doesn't
  // raft on top.
  const lift = displayHeight / 2 - (asset.placement?.sinkFrac || 0) * displayHeight;
  return {
    ...g,
    displayHeight,
    displayScale,
    position: {
      x: g.surfacePoint.x + g.normal.x * lift,
      y: g.surfacePoint.y + g.normal.y * lift,
      z: g.surfacePoint.z + g.normal.z * lift,
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
                         opts.displayUnitsPerMetre, opts.heightCapM)
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
    // Day 2 street audit (§4.3): scatter used to be uniform random
    // clones at one scale — no spacing, no terrain sense, no
    // respect for landmarks — so street level read as clumps
    // (identical trees stacked through each other, palms on the
    // old seabed, snags by the hundred). Now, all opt-in per call:
    // - minimum separation ~ the species' crown width, via
    //   best-of-24 candidates (spacing alone never drops an
    //   instance — the clearest candidate wins);
    // - per-instance scale jitter 0.82–1.18 (no two clones alike);
    // - opts.terrainMask 'land' | 'water' | 'shore': candidates
    //   are sampled against the real heightmap and kept only on
    //   matching ground (mask failures DO drop the instance);
    // - opts.exclusions [{lat, lon, radiusDeg}]: candidates
    //   inside an exclusion drop (landmarks keep clear ground).
    const disp = opts.displayUnitsPerMetre
      ? displayScaleFor(asset, opts.displayUnitsPerMetre, opts.heightCapM)
      : null;
    const footprintDeg = disp ? disp.footprint / HUB_UNITS_PER_DEGREE : 0;
    const minSepDeg = Math.max(
      radiusDeg * Math.min(0.16, 1.1 / Math.sqrt(count)),
      footprintDeg * 0.85,
    );
    const mask = opts.terrainMask ?? null;
    const exclusions = opts.exclusions ?? null;
    const cosLat = Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180));
    const maskOk = (la, lo) => {
      if (!mask || !heightData) return true;
      const s = sampleHeight(heightData, w, h, (lo + 180) / 360, (la + 90) / 180);
      if (mask === 'land') return s > TERRAIN_SEA_LEVEL;
      if (mask === 'water') return s <= TERRAIN_SEA_LEVEL;
      // Shore band: in this heightmap's terms the intertidal /
      // wetland fringe spans roughly ±0.045 of sample value around
      // sea level (either side stays within ~0.12 units of the
      // waterline).
      return Math.abs(s - TERRAIN_SEA_LEVEL) <= 0.045;
    };
    const excludedAt = (la, lo) => {
      if (!exclusions) return false;
      for (const ex of exclusions) {
        const dx = (lo - ex.lon) * Math.cos((ex.lat * Math.PI) / 180);
        const dy = la - ex.lat;
        if (dx * dx + dy * dy < ex.radiusDeg * ex.radiusDeg) return true;
      }
      return false;
    };
    const chosen = [];
    for (let i = 0; i < count; i++) {
      let best = null;
      let bestClear = -1;
      for (let attempt = 0; attempt < 24; attempt++) {
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * radiusDeg;
        const la = anchor.lat + Math.sin(a) * rr;
        const lo = anchor.lon + (Math.cos(a) * rr) / cosLat;
        if (excludedAt(la, lo) || !maskOk(la, lo)) continue;
        let clear = Infinity;
        for (const o of chosen) {
          const d = Math.hypot((lo - o.lon) * cosLat, la - o.lat);
          if (d < clear) clear = d;
        }
        if (clear >= minSepDeg) { best = { la, lo }; break; }
        if (clear > bestClear) { bestClear = clear; best = { la, lo }; }
      }
      if (!best) continue; // mask/exclusion refusal: honestly fewer
      chosen.push(best);
      push(best.la, best.lo, Math.floor(rand() * 360));
      if (disp) {
        const placed = out[out.length - 1];
        const jitter = 0.82 + rand() * 0.36;
        placed.jitter = jitter;
        placed.displayHeight = disp.displayHeight * jitter;
        placed.displayScale = disp.displayScale * jitter;
        const lift = placed.displayHeight / 2
          - (p.sinkFrac || 0) * placed.displayHeight;
        placed.position = {
          x: placed.surfacePoint.x + placed.normal.x * lift,
          y: placed.surfacePoint.y + placed.normal.y * lift,
          z: placed.surfacePoint.z + placed.normal.z * lift,
        };
      }
    }
    return out;
  }
  if (p.mode === 'segment-repeat') {
    const count = opts.segmentCount ?? 9;
    // Abutted runs (audit §4.5): in display space, copies step by
    // ~their displayed length along the line instead of a fixed
    // 0.35° — a 7.75-unit bridge deck stepped 0.336 units
    // overlapped itself 23× into a slatted slab.
    const stepDeg = opts.segmentStepDeg ?? (opts.displayUnitsPerMetre
      ? Math.max(0.35, (displayScaleFor(asset, opts.displayUnitsPerMetre, opts.heightCapM).footprint
        / HUB_UNITS_PER_DEGREE) * 0.6)
      : 0.35);
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
