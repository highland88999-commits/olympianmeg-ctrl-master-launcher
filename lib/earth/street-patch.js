// lib/earth/street-patch.js — the street-level detail ground.
//
// At street level the traveler stands on the fallback globe built by
// lib/terrain.js: a 160×120 sphere whose facets are ~135 display
// metres wide. From 1.62 m up, the ground reads as giant broken
// shards — the flaw in the 2026-10-17 walkthrough footage. The ESRI
// lens covers a 90 m photographic disc, so this module builds
// the middle ground: a high-resolution disc (default 5.4 hub units
// ≈ 338 m radius) draped over the same heightmap, vertex-colored
// with the hypsometric ramp plus fine grain, so the terrain near
// the traveler has real relief and color even where the lens has
// no tiles.
//
// Layering (all sample the same heightmap, so nothing pokes
// through): globe < patch (PATCH_LIFT) < street lens (0.004).
// Pure math, headless-testable like lib/earth/lens.js.
import { latLonToVec3, EARTH_RADIUS } from '../geo.js';
import {
  sampleHeight,
  TERRAIN_RADIUS,
  TERRAIN_ELEVATION_SCALE,
  TERRAIN_SEA_LEVEL,
} from '../terrain.js';
import {
  surfaceRadiusAt,
  DISPLAY_UNITS_PER_METRE,
  globeGridSurfaceRadius,
} from './placements.js';

// The globe-grid surface now lives in placements.js (the leaf
// module) so the camera clamps can share it without an import
// cycle; re-exported here for this module's original callers.
export { globeGridSurfaceRadius, GLOBE_GRID_W, GLOBE_GRID_H } from './placements.js';
import { tangentFrame } from './roam.js';
import { latLonFromDir } from './lens.js';

/** Disc radius in globe-local units (≈338 display metres).
 *  Round 3 widened it from 1.2 (≈75 m) to 1.8 (≈112 m): standing
 *  on a slope, the visible near/mid ground ran past the old rim
 *  and the foreground below the seam read as bare globe — flat
 *  solid green. TRIPLED 2026-10-22 — Merlin: "Increase the range
 *  of rendering around and under each player by 3": 1.8 → 5.4.
 *  The default ring count rose 64 → 90 with it (see the builder),
 *  which holds the vertex budget under the phone-sane pin while
 *  the ×3 radius spreads the drape: mid-field ring spacing grows
 *  ~1.9×, and the photographic street lens (radius 1.44) covers
 *  the inner ground where drape density matters most. */
export const STREET_PATCH_RADIUS = 5.4;
/** How far above the sampled terrain the patch floats (hub units
 *  ≈ 0.125 display metres): above the globe, below the street
 *  lens, never z-fighting at street camera range. */
export const PATCH_LIFT = 0.002;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (p, q, t) => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

/** Hypsometric terrain color for height h (0..1) and latitude
 *  fraction v01 (0 = south pole, 1 = north pole) — the JS mirror
 *  of the globe fragment shader's ramp, so the patch blends with
 *  the globe it covers. */
export function hypsometricColor(h, v01) {
  // No water on Earth 1 (2026-10-26): the former ocean floor is
  // dry seabed — dusty basin tones rising to shelf sand, then
  // blending into the ordinary lowland ramp. Nothing renders blue.
  const seabed = mix3([0.42, 0.36, 0.26], [0.55, 0.48, 0.33], smoothstep(0.0, 0.047, h));
  let land = [0.16, 0.35, 0.13];
  land = mix3(land, [0.45, 0.33, 0.2], smoothstep(0.09, 0.24, h));
  land = mix3(land, [0.48, 0.45, 0.42], smoothstep(0.24, 0.45, h));
  land = mix3(land, [0.93, 0.95, 0.98], smoothstep(0.55, 0.72, h));
  let t = mix3(seabed, land, smoothstep(0.043, 0.051, h));
  const lat = Math.abs(v01 * 2 - 1);
  // Polar ice: with no water left the polar basins are dry land,
  // so ice sits at polar latitudes outright (no land gate).
  const iceAmt = smoothstep(0.8, 0.88, lat);
  t = mix3(t, [0.93, 0.95, 0.98], iceAmt);
  return t;
}

/** Deterministic per-vertex grain in [0, 1): close-up detail the
 *  coarse globe can't carry. */
export function grainFor(index) {
  let x = (index * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** Draped detail disc as plain arrays (positions, colors, indices)
 *  centered on (centerLat, centerLon). Every vertex rides the
 *  heightmap surface at its own lat/lon + lift. Winding faces
 *  away from the globe center, same as the lens builder. */
export function buildStreetPatchGeometryData(
  heightData, w, h, centerLat, centerLon,
  radiusUnits = STREET_PATCH_RADIUS, opts = {},
) {
  const rings = opts.rings ?? 90;
  const sectors = opts.sectors ?? 84;
  const lift = opts.lift ?? PATCH_LIFT;
  const frame = tangentFrame(centerLat, centerLon);
  const centerDir = frame.normal;

  const positions = [];
  const colors = [];
  const indices = [];

  const pushVertex = (dir, index) => {
    const { lat, lon } = latLonFromDir(dir);
    const hgt = sampleHeight(heightData, w, h, (lon + 180) / 360, (lat + 90) / 180);
    const trueR = TERRAIN_RADIUS + (hgt - TERRAIN_SEA_LEVEL) * TERRAIN_ELEVATION_SCALE;
    // Grid clearance (round 3, the flat-green foreground): the
    // globe draws this terrain through a 96×72 grid whose facets
    // span ~3.6 hub units; on curved relief a facet plane stands
    // ABOVE the true sampled surface by more than PATCH_LIFT, so
    // the patch — riding the true surface + 0.002 — was sliced
    // through by the globe's own facets wherever the slope bent,
    // and the facet (one flat hypsometric green) filled the
    // foreground. The patch now rides the HIGHER of the true
    // surface and the globe-grid surface, plus the lift: it can
    // never sit under the globe that carries it. On flat ground
    // the two surfaces agree and nothing changes.
    const gridR = globeGridSurfaceRadius(heightData, w, h, lat, lon);
    const r = Math.max(trueR, gridR) + lift;
    positions.push(dir.x * r, dir.y * r, dir.z * r);
    const v01 = (lat + 90) / 180;
    const [cr, cg, cb] = hypsometricColor(hgt, v01);
    const grain = 0.93 + 0.14 * grainFor(index);
    colors.push(cr * grain, cg * grain, cb * grain);
    return positions.length / 3 - 1;
  };

  pushVertex(centerDir, 0);
  let vi = 1;
  for (let i = 1; i <= rings; i++) {
    // Ring radii bunch toward the centre (frac^1.35): the nearest
    // ~30 m — the ground the traveler actually stands on and looks
    // at — gets the densest drape, the rim stays cheap. One
    // geometry, no extra textures: iPhone memory discipline kept.
    const frac = Math.pow(i / rings, 1.35);
    const ang = (frac * radiusUnits) / EARTH_RADIUS;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      const tx = frame.north.x * Math.cos(a) + frame.east.x * Math.sin(a);
      const ty = frame.north.y * Math.cos(a) + frame.east.y * Math.sin(a);
      const tz = frame.north.z * Math.cos(a) + frame.east.z * Math.sin(a);
      const dir = {
        x: centerDir.x * cosA + tx * sinA,
        y: centerDir.y * cosA + ty * sinA,
        z: centerDir.z * cosA + tz * sinA,
      };
      const m = Math.hypot(dir.x, dir.y, dir.z) || 1;
      pushVertex({ x: dir.x / m, y: dir.y / m, z: dir.z / m }, vi);
      vi += 1;
    }
  }
  const ringStart = (i) => 1 + (i - 1) * sectors;
  for (let j = 0; j < sectors; j++) {
    const a = ringStart(1) + j;
    const b = ringStart(1) + ((j + 1) % sectors);
    indices.push(0, b, a);
  }
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const jn = (j + 1) % sectors;
      const a = ringStart(i) + j;
      const b = ringStart(i) + jn;
      const c = ringStart(i + 1) + j;
      const d = ringStart(i + 1) + jn;
      indices.push(a, b, d, a, d, c);
    }
  }
  // Sanity: every vertex rides at/above the sampled surface.
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
  };
}

/** Surface radius including the patch lift — lets callers place
 *  the lens or effects relative to the patch. */
export function patchRadiusAt(heightData, w, h, lat, lon, lift = PATCH_LIFT) {
  return surfaceRadiusAt(heightData, w, h, lat, lon) + lift;
}

/** MicroGroundDisc math (the Quantum Realm's floor, components/
 *  StreetGroundPatch.jsx). Every micro-layer dimension must scale
 *  WITH the walker — that is the whole Ant-Man contract.
 *
 *  MICRO_DISC_LIFT_U is the disc's float above the surface AT 1x
 *  (≈4 display mm). The 2026-10-20 bug: the component applied it
 *  UNSCALED, so at 0.00001x the "floor" hovered 0.00006 hub units
 *  over the terrain while the walker's eye sits at
 *  1.62 m × 0.016 × 0.00001 ≈ 2.6e-7 hub units — the floor was
 *  ~230 eye-heights OVERHEAD. The world read as inverted (ground
 *  in the sky) and, with every visible surface either walker-locked
 *  or continent-sized, walking produced no visible motion at all:
 *  Merlin's "no motion controls in the Quantum Realm". */
export const MICRO_DISC_RADIUS_U = 0.05; // hub units ≈ 3.1 display m radius
export const MICRO_DISC_LIFT_U = 0.00006; // at 1x; scales with the shrink
/** One grain-texture tile spans this many WALKER metres, so the
 *  ground detail is sized to the traveler's own body at any scale
 *  and walking visibly flows across it. */
export const MICRO_GRAIN_TILE_M = 3;

/** The disc's lift above the surface at a given Ant-Man scale. */
export function microDiscLiftU(scale) {
  return MICRO_DISC_LIFT_U * (scale || 1);
}

/** One grain tile in hub units at a given Ant-Man scale. */
export function microGrainTileU(scale) {
  return MICRO_GRAIN_TILE_M * DISPLAY_UNITS_PER_METRE * (scale || 1);
}
