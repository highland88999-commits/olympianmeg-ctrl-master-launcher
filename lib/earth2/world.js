// lib/earth2/world.js
// EARTH 2 — THE WALKABLE PLANET (Merlin, 2026-10-22): "Render the
// planet of Earth 2 and put the access to that planet in this access
// space. I want to be able to walk around it and test it long before
// earth 1 is mapped."
//
// The parcel map IS the geography. The 50 × 50 grid from
// lib/earth2/parcels.js is laid out flat as a continuous terrain
// 1,400 m across (28 m per parcel), so the chamber map and the
// walked world are the same place from the same source — no second
// geography. Every parcel's terrain character derives
// DETERMINISTICALLY from its parcels.js identity:
//
//   latitude band → climate (polar / subpolar / temperate /
//     subtropical / tropical — frozen poles, warm equator)
//   name family   → biome (Fields/Meadows grassland, Highlands/
//     Reach rocky high ground, Basin a low bowl, Vale a green
//     valley, Shore a coast that hugs the waterline …)
//   tier + class  → a subtle ground-tint shift (landmark gold,
//     ownable warm, Free Commons plain)
//
// The heightfield is a smooth seeded field shaped by per-parcel
// biome elevation targets, bilinearly blended across parcel
// borders (no cell cliffs), over a low-frequency continental field
// that raises landmasses and dips the seas. Water is whatever lies
// below WATER_Y — clear bright blue by Merlin's water law — so
// basins become ponds and lakes, shores become beaches, and the
// deepest continental dip becomes the sea the swimmers live in.
//
// This module is pure arithmetic (no three.js, no DOM, no clock,
// no Math.random — seeded hashes only), so the whole planet is
// unit-testable and identical on every visit. The scene glue lives
// in components/earth2/Earth2World.jsx.

import {
  PARCELS,
  PARCEL_COLS,
  PARCEL_ROWS,
  parcelById,
  castleParcel,
  isCastleParcel,
} from './parcels.js';
import { SWIMMERS, FLYERS } from './creatures.js';
import { EARTH2_MODEL_BY_SLUG } from './models.js';

// ── Dimensions ──────────────────────────────────────────────────
export const WORLD_CELL_M = 28; // one parcel ≈ 28 m across
export const WORLD_SIZE_M = PARCEL_COLS * WORLD_CELL_M; // 1,400 m
export const WORLD_HALF_M = WORLD_SIZE_M / 2; // 700 m
export const WATER_Y = 0; // the waterline — terrain below it is wet
export const WORLD_SEED = 20261022;

// Walker numbers (the platform's walk pattern, Earth 2 scale).
export const WALK_EYE_M = 1.7;
export const WALK_SPEED_MPS = 6; // a good test pace
export const TRAVEL_SPEED_MPS = 26; // crossing 1.4 km in under a minute
export const MAX_WADE_DEPTH_M = 1.35; // wading yes, swimming no (this build)
export const WALKER_RADIUS_M = 0.55;

// ── Seeded noise (integer hashes — zero Math.random) ────────────
function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Fractal value noise, roughly [0, 1], centred near 0.5.
function fbm(x, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fz) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.03;
  }
  return sum / norm;
}

// Deterministic layout RNG (mulberry32) for placement scatter —
// the same generator the Bay arranges itself with.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugSeed(slug) {
  let h = WORLD_SEED;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── World ↔ parcel mapping (one geography: parcels.js) ──────────
/** The world-space centre of a parcel: { x, z } (x east, z south). */
export function parcelCenterWorld(parcel) {
  return {
    x: (parcel.col + 0.5) * WORLD_CELL_M - WORLD_HALF_M,
    z: (parcel.row + 0.5) * WORLD_CELL_M - WORLD_HALF_M,
  };
}

/** The parcel's world-space rectangle. */
export function parcelWorldRect(parcel) {
  const cx = parcel.col * WORLD_CELL_M - WORLD_HALF_M;
  const cz = parcel.row * WORLD_CELL_M - WORLD_HALF_M;
  return { minX: cx, maxX: cx + WORLD_CELL_M, minZ: cz, maxZ: cz + WORLD_CELL_M };
}

/**
 * The parcel under a world position. Row 0 (the northernmost band)
 * sits at −z, so north is up-screen in the chamber map and −z in
 * the world — the mapping is linear in the grid, exactly the
 * partition parcels.js draws in lat/lon.
 */
export function parcelAtWorld(x, z) {
  const col = clamp(Math.floor((x + WORLD_HALF_M) / WORLD_CELL_M), 0, PARCEL_COLS - 1);
  const row = clamp(Math.floor((z + WORLD_HALF_M) / WORLD_CELL_M), 0, PARCEL_ROWS - 1);
  return PARCELS[row * PARCEL_COLS + col];
}

/** World position → lat/lon (display + cross-checks with parcels.js). */
export function worldToLatLon(x, z) {
  const lon = clamp((x / WORLD_SIZE_M) * 360, -179.999, 179.999);
  const lat = clamp(90 - ((z + WORLD_HALF_M) / WORLD_SIZE_M) * 180, -90, 90);
  return { lat, lon };
}

// ── Climate & biome derivation ──────────────────────────────────
export function climateForLat(lat) {
  const a = Math.abs(Number(lat) || 0);
  if (a >= 66) return 'polar';
  if (a >= 52) return 'subpolar';
  if (a >= 35) return 'temperate';
  if (a >= 23) return 'subtropical';
  return 'tropical';
}

export function climateForParcel(parcel) {
  return climateForLat(parcel.centerLat);
}

// Biome families, from the parcels' own name families (parcels.js
// NAME_B). lift = elevation target (m) over the continental field;
// rough = heightfield detail amplitude; color = ground tint (RGB).
const FAMILY = {
  Fields:    { lift: 3.0,  rough: 0.5, color: [0.30, 0.48, 0.19] },
  Meadows:   { lift: 3.2,  rough: 0.45, color: [0.37, 0.55, 0.22] },
  Grove:     { lift: 4.0,  rough: 0.8, color: [0.20, 0.42, 0.18] },
  Vale:      { lift: 1.4,  rough: 0.6, color: [0.27, 0.52, 0.24] },
  Steppe:    { lift: 5.0,  rough: 0.9, color: [0.48, 0.52, 0.26] },
  Reach:     { lift: 8.0,  rough: 1.6, color: [0.42, 0.46, 0.33] },
  Highlands: { lift: 14.0, rough: 3.2, color: [0.45, 0.42, 0.36] },
  Cliffs:    { lift: 18.0, rough: 4.2, color: [0.50, 0.47, 0.44] },
  Basin:     { lift: -3.4, rough: 0.7, color: [0.38, 0.44, 0.26] },
  Shore:     { lift: 0.5,  rough: 0.35, color: [0.76, 0.70, 0.50] },
};

// Landmark parcels carry a city's name, not a name family — their
// terrain family is fixed here, by the place itself.
const LANDMARK_FAMILY = {
  Athens: 'Fields',
  Paris: 'Fields',
  London: 'Meadows',
  Rome: 'Fields',
  Cairo: 'Steppe',
  'New York': 'Shore',
  'Los Angeles': 'Shore',
  'Rio de Janeiro': 'Shore',
  Tokyo: 'Fields',
  Sydney: 'Shore',
  Everest: 'Cliffs',
  Honolulu: 'Shore',
  'Castle Transylvania': 'Shore',
};

/** The biome family of a parcel, from its parcels.js name. */
export function familyForParcel(parcel) {
  if (!parcel) return 'Fields';
  const last = parcel.name.split(' ').pop();
  if (FAMILY[last]) return last;
  return LANDMARK_FAMILY[parcel.name] || 'Fields';
}

const CLIMATE_LIFT = { polar: 1.2, subpolar: 0.6, temperate: 0, subtropical: -0.2, tropical: -0.4 };

function biomeColor(family, climate, parcel) {
  let [r, g, b] = FAMILY[family].color;
  if (climate === 'polar') {
    // The frozen bands: snow takes every family but the shore,
    // which stays a pale icy strand, and the castle court.
    if (family === 'Shore') { r = 0.78; g = 0.83; b = 0.87; }
    else { r = lerp(r, 0.90, 0.85); g = lerp(g, 0.93, 0.85); b = lerp(b, 0.97, 0.85); }
  } else if (climate === 'subpolar') {
    r = lerp(r, 0.52, 0.4); g = lerp(g, 0.55, 0.4); b = lerp(b, 0.45, 0.4); // tundra pale
  } else if (climate === 'tropical') {
    r *= 0.9; g *= 1.12; b *= 0.9; // lush
  } else if (climate === 'subtropical') {
    r *= 1.05; g *= 1.02; b *= 0.95; // warm
  }
  // The subtle parcel-class read: landmark land runs golden,
  // ownable land runs a touch warm, Free Commons stay plain.
  if (parcel.tier === 'landmark') { r *= 1.10; g *= 1.04; b *= 0.90; }
  else if (parcel.ownable) { r *= 1.07; b *= 0.93; }
  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

// ── The heightfield ─────────────────────────────────────────────
// The continental field: low-frequency seeded noise that raises
// landmasses and dips seas over hundreds of metres.
const CONTINENT_SCALE = 0.0021;
const CONTINENT_AMP = 7.5;
export function continentalAt(x, z) {
  return (fbm(x * CONTINENT_SCALE + 13.73, z * CONTINENT_SCALE + 7.31, 3) - 0.5) * 2 * CONTINENT_AMP;
}

// Per-parcel targets, precomputed once: the biome elevation each
// parcel pulls the heightfield toward at its centre.
const TARGETS = new Float32Array(PARCELS.length);
const ROUGHS = new Float32Array(PARCELS.length);
const COLORS = new Float32Array(PARCELS.length * 3);
const CASTLE = castleParcel();
const CASTLE_CENTER = parcelCenterWorld(CASTLE);
export const CASTLE_TERRACE_Y = 3.2; // the Count's levelled headland

PARCELS.forEach((parcel, i) => {
  const family = familyForParcel(parcel);
  const climate = climateForParcel(parcel);
  const c = parcelCenterWorld(parcel);
  const cont = continentalAt(c.x, c.z);
  let target;
  if (isCastleParcel(parcel)) {
    target = CASTLE_TERRACE_Y;
  } else if (family === 'Shore') {
    // A shore hugs the waterline whatever the continent does.
    target = 0.55 + cont * 0.10 + CLIMATE_LIFT[climate] * 0.3;
  } else if (family === 'Basin') {
    // A bowl: sunk below its surroundings; water where lowest.
    target = cont * 0.55 + FAMILY.Basin.lift;
  } else {
    target = cont + FAMILY[family].lift + CLIMATE_LIFT[climate];
  }
  TARGETS[i] = target;
  ROUGHS[i] = FAMILY[family].rough;
  const col = biomeColor(family, climate, parcel);
  COLORS[i * 3] = col[0];
  COLORS[i * 3 + 1] = col[1];
  COLORS[i * 3 + 2] = col[2];
});

// Border softening: ONE [1 2 1]² blur pass, mixed at 45%, so a
// sunken Basin beside a high Reach meets it across a bank, never
// a wall — the same "blend across borders" rule the planet
// regions follow — while the seas and bowls keep their depth (a
// full blur drowns the contrast the biomes live by). The castle's
// target is re-pinned afterwards (its terrace does the rest).
{
  const src = Float32Array.from(TARGETS);
  for (let row = 0; row < PARCEL_ROWS; row++) {
    for (let col = 0; col < PARCEL_COLS; col++) {
      let sum = 0;
      let wsum = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = row + dr;
          const cc = col + dc;
          if (rr < 0 || cc < 0 || rr >= PARCEL_ROWS || cc >= PARCEL_COLS) continue;
          const w = (dr === 0 ? 2 : 1) * (dc === 0 ? 2 : 1);
          sum += src[rr * PARCEL_COLS + cc] * w;
          wsum += w;
        }
      }
      const i = row * PARCEL_COLS + col;
      TARGETS[i] = lerp(src[i], sum / wsum, 0.45);
    }
  }
}
TARGETS[CASTLE.index] = CASTLE_TERRACE_Y;

// Basin flags for the pond carve in heightAt.
const BASIN_FLAG = new Uint8Array(PARCELS.length);
PARCELS.forEach((p, i) => { BASIN_FLAG[i] = familyForParcel(p) === 'Basin' ? 1 : 0; });

/** The full biome read for one parcel (what the HUD names). */
export function biomeForParcel(parcel) {
  const family = familyForParcel(parcel);
  return {
    family,
    climate: climateForParcel(parcel),
    elevationTarget: TARGETS[parcel.index],
    roughness: ROUGHS[parcel.index],
    color: [COLORS[parcel.index * 3], COLORS[parcel.index * 3 + 1], COLORS[parcel.index * 3 + 2]],
  };
}

// Bilinear sample over a per-parcel grid (centres at integers).
function sampleGrid(grid, x, z, stride, out) {
  const gx = clamp((x + WORLD_HALF_M) / WORLD_CELL_M - 0.5, 0, PARCEL_COLS - 1);
  const gz = clamp((z + WORLD_HALF_M) / WORLD_CELL_M - 0.5, 0, PARCEL_ROWS - 1);
  const ix = Math.min(PARCEL_COLS - 2, Math.floor(gx));
  const iz = Math.min(PARCEL_ROWS - 2, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  for (let k = 0; k < stride; k++) {
    const a = grid[(iz * PARCEL_COLS + ix) * stride + k];
    const b = grid[(iz * PARCEL_COLS + ix + 1) * stride + k];
    const c = grid[((iz + 1) * PARCEL_COLS + ix) * stride + k];
    const d = grid[((iz + 1) * PARCEL_COLS + ix + 1) * stride + k];
    out[k] = a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  return out;
}

const _t = [0];
const _r = [0];
const _c = [0, 0, 0];

/**
 * Terrain height (metres) at a world position. Pure and shared by
 * the geometry builder, the walker (feet glued to it), the swim
 * drivers (bed clamps) and the placement rules — one truth.
 */
export function heightAt(x, z) {
  sampleGrid(TARGETS, x, z, 1, _t);
  sampleGrid(ROUGHS, x, z, 1, _r);
  let h = _t[0];
  // Biome detail: seeded fbm, amplitude set by the local family's
  // roughness — plains stay smooth, highlands stay craggy.
  h += (fbm(x * 0.02 + 3.1, z * 0.02 + 9.4, 3) - 0.5) * 2 * _r[0] * 1.5;
  h += (valueNoise(x * 0.11, z * 0.11) - 0.5) * 0.35;
  // Bathymetry stretch: below −1.5 m the bed falls away faster,
  // so the seas run honestly deep (a 15 m mosasaurus needs water
  // over its back) while the shoreline itself stays a beach.
  if (h < -1.5) h = -1.5 + (h + 1.5) * 1.45;
  // Basin ponds: a Basin parcel's bowl is carved as a smooth
  // dish toward pond depth (the Bay's lake-carve rule at parcel
  // scale), so its water holds even where the continent rises —
  // "Basin = low bowl, water where lowest". Only ever lowers.
  {
    const pc = clamp(Math.floor((x + WORLD_HALF_M) / WORLD_CELL_M), 0, PARCEL_COLS - 1);
    const pr = clamp(Math.floor((z + WORLD_HALF_M) / WORLD_CELL_M), 0, PARCEL_ROWS - 1);
    let pull = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = pc + dc;
        const rr = pr + dr;
        if (cc < 0 || rr < 0 || cc >= PARCEL_COLS || rr >= PARCEL_ROWS) continue;
        if (!BASIN_FLAG[rr * PARCEL_COLS + cc]) continue;
        const cx = (cc + 0.5) * WORLD_CELL_M - WORLD_HALF_M;
        const cz = (rr + 0.5) * WORLD_CELL_M - WORLD_HALF_M;
        const d = Math.hypot(x - cx, z - cz);
        if (d < 26) {
          const w = clamp((26 - d) / 16, 0, 1);
          const s = w * w * (3 - 2 * w);
          if (s > pull) pull = s;
        }
      }
    }
    if (pull > 0 && h > -3.6) h = lerp(h, -3.6, pull);
  }
  // The castle terrace: the ground levels to the court's height
  // around the Count's seat — flat across the castle's footprint
  // and his court before it, easing back to wild ground beyond.
  const cd = Math.hypot(x - CASTLE_CENTER.x, z - CASTLE_CENTER.z);
  if (cd < 54) {
    const w = clamp((54 - cd) / 20, 0, 1);
    h = lerp(h, CASTLE_TERRACE_Y, w * w * (3 - 2 * w));
  }
  return h;
}

/** True where the terrain lies below the waterline. */
export function isWaterAt(x, z) {
  return heightAt(x, z) < WATER_Y;
}

/** Water depth (metres) at a position; 0 on dry land. */
export function waterDepthAt(x, z) {
  return Math.max(0, WATER_Y - heightAt(x, z));
}

const SAND = [0.85, 0.78, 0.58];
const DEEP_BED = [0.30, 0.42, 0.40];

/** Ground colour (RGB 0..1) at a position — biome tint blended
 *  across borders, beach at the waterline, bed shading below it. */
export function groundColorAt(x, z) {
  sampleGrid(COLORS, x, z, 3, _c);
  let [r, g, b] = _c;
  const h = heightAt(x, z);
  if (h < WATER_Y - 0.2) {
    const f = clamp((WATER_Y - h) / 5, 0, 1);
    r = lerp(SAND[0], DEEP_BED[0], f);
    g = lerp(SAND[1], DEEP_BED[1], f);
    b = lerp(SAND[2], DEEP_BED[2], f);
  } else if (h < WATER_Y + 0.5) {
    const f = ((WATER_Y + 0.5 - h) / 0.7) * 0.65;
    r = lerp(r, SAND[0], f);
    g = lerp(g, SAND[1], f);
    b = lerp(b, SAND[2], f);
  }
  const v = 0.92 + 0.16 * valueNoise(x * 0.05 + 5.5, z * 0.05 + 1.5);
  return [clamp(r * v, 0, 1), clamp(g * v, 0, 1), clamp(b * v, 0, 1)];
}

// ── Water bodies ────────────────────────────────────────────────
let _bodies = null;
/**
 * The world's water bodies: 4-connected clusters of parcels whose
 * centres lie below the waterline, largest first. A body carries
 * its parcels, centroid, equivalent radius and deepest bed.
 */
export function waterBodies() {
  if (_bodies) return _bodies;
  const wet = PARCELS.map((p) => {
    const c = parcelCenterWorld(p);
    return heightAt(c.x, c.z) < WATER_Y - 0.25;
  });
  const seen = new Uint8Array(PARCELS.length);
  const bodies = [];
  for (let i = 0; i < PARCELS.length; i++) {
    if (!wet[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const members = [];
    while (stack.length) {
      const cur = stack.pop();
      members.push(PARCELS[cur]);
      const { col, row } = PARCELS[cur];
      const nb = [
        col > 0 ? cur - 1 : -1,
        col < PARCEL_COLS - 1 ? cur + 1 : -1,
        row > 0 ? cur - PARCEL_COLS : -1,
        row < PARCEL_ROWS - 1 ? cur + PARCEL_COLS : -1,
      ];
      for (const n of nb) {
        if (n >= 0 && wet[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    let sx = 0;
    let sz = 0;
    let deepest = 0;
    let deepestPoint = null;
    for (const p of members) {
      const c = parcelCenterWorld(p);
      sx += c.x;
      sz += c.z;
      const h = heightAt(c.x, c.z);
      if (h < deepest) { deepest = h; deepestPoint = c; }
    }
    bodies.push({
      parcels: members,
      size: members.length,
      centerX: sx / members.length,
      centerZ: sz / members.length,
      radiusM: Math.sqrt(members.length) * WORLD_CELL_M * 0.5,
      bedY: deepest,
      depthM: WATER_Y - deepest,
      // The centre of the deepest parcel — a guaranteed-wet point
      // (a plain centroid can land on an island inside the body).
      deepestX: deepestPoint ? deepestPoint.x : sx / members.length,
      deepestZ: deepestPoint ? deepestPoint.z : sz / members.length,
    });
  }
  bodies.sort((a, b) => b.size - a.size || a.parcels[0].index - b.parcels[0].index);
  _bodies = bodies;
  return bodies;
}

/** The largest water body — the sea the swimmers live in. */
export function largestWaterBody() {
  const bodies = waterBodies();
  return bodies.length ? bodies[0] : null;
}

// ── Spawn ───────────────────────────────────────────────────────
/**
 * The landing meadow: the dry grass parcel nearest the map's
 * heart, where a walker with no home base first sets foot.
 */
export function landingParcel() {
  const mid = (PARCEL_COLS - 1) / 2;
  const sorted = [...PARCELS].sort((a, b) => {
    const da = (a.col - mid) ** 2 + (a.row - mid) ** 2;
    const db = (b.col - mid) ** 2 + (b.row - mid) ** 2;
    return da - db || a.index - b.index;
  });
  for (const p of sorted) {
    const fam = familyForParcel(p);
    if (fam !== 'Fields' && fam !== 'Meadows' && fam !== 'Grove') continue;
    if (climateForParcel(p) === 'polar') continue;
    const c = parcelCenterWorld(p);
    if (heightAt(c.x, c.z) > 0.8) return p;
  }
  return PARCELS[Math.floor(PARCELS.length / 2)];
}

/** Spawn parcel: the home base when one is set, else the landing. */
export function resolveSpawnParcel(homeParcelId) {
  const home = homeParcelId ? parcelById(homeParcelId) : null;
  return home || landingParcel();
}

/**
 * A dry standing point for a spawn parcel: its centre when dry,
 * else a deterministic ring scan outward for the first footing
 * above the waterline.
 */
export function spawnPointFor(parcel) {
  const c = parcelCenterWorld(parcel);
  if (heightAt(c.x, c.z) > 0.45) return { x: c.x, z: c.z, y: heightAt(c.x, c.z), parcel };
  for (const r of [7, 14, 21, 28, 42, 60]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (Math.abs(x) > WORLD_HALF_M - 4 || Math.abs(z) > WORLD_HALF_M - 4) continue;
      if (heightAt(x, z) > 0.45) return { x, z, y: heightAt(x, z), parcel: parcelAtWorld(x, z) };
    }
  }
  return { x: c.x, z: c.z, y: heightAt(c.x, c.z), parcel };
}

// ── Placement: the Bay's cast, distributed by habitat ───────────
// Every rule below is a deterministic scan over PARCELS (nearest
// to a preference point, ties broken by index), so the population
// plan is pure data the tests can pin: swimmers only in water,
// herds only on dry grass, the castle cast only at the castle.

function findParcel({ families = null, climates = null, near = [0, 0], dry = true, minH = 0.35, maxH = Infinity, avoid = [], minSep = 0 } = {}) {
  let best = null;
  let bestD = Infinity;
  for (const p of PARCELS) {
    if (families && !families.includes(familyForParcel(p))) continue;
    if (climates && !climates.includes(climateForParcel(p))) continue;
    const c = parcelCenterWorld(p);
    if (dry) {
      const h = heightAt(c.x, c.z);
      if (h < minH || h > maxH) continue;
    }
    let ok = true;
    for (const a of avoid) {
      if (Math.hypot(c.x - a[0], c.z - a[1]) < minSep) { ok = false; break; }
    }
    if (!ok) continue;
    const d = Math.hypot(c.x - near[0], c.z - near[1]);
    if (d < bestD - 1e-9) { bestD = d; best = p; }
  }
  return best;
}

function headingFor(seed) {
  return hash2(seed, seed * 3 + 7) * Math.PI * 2;
}

let _landforms = null;
/** Landform placements: the set pieces on the ground they suit. */
export function worldLandforms() {
  if (_landforms) return _landforms;
  const out = [];
  const taken = [];
  const put = (slug, parcel, extra) => {
    if (!parcel) return null;
    const c = parcelCenterWorld(parcel);
    taken.push([c.x, c.z]);
    const rec = { slug, parcelIndex: parcel.index, x: c.x, z: c.z, heading: headingFor(parcel.index + slug.length), ...extra };
    out.push(rec);
    return rec;
  };
  // The highest ground takes the mountain range, then the two
  // volcanoes on other high parcels, kept apart from each other.
  const byHeight = [...PARCELS]
    .filter((p) => !isCastleParcel(p))
    .sort((a, b) => {
      const ca = parcelCenterWorld(a);
      const cb = parcelCenterWorld(b);
      return heightAt(cb.x, cb.z) - heightAt(ca.x, ca.z) || a.index - b.index;
    });
  const highPick = (families, avoid, minSep) => byHeight.find((p) => {
    if (!families.includes(familyForParcel(p))) return false;
    const c = parcelCenterWorld(p);
    return avoid.every((a) => Math.hypot(c.x - a[0], c.z - a[1]) >= minSep);
  });
  const mountains = put('mountain-range', highPick(['Highlands', 'Cliffs'], [], 0));
  const active = put('active-volcano', highPick(['Highlands', 'Cliffs', 'Reach'], taken, 420));
  put('dormant-volcano', highPick(['Highlands', 'Cliffs', 'Reach'], taken, 340));
  // The cliff face stands over the sea when a cliffs parcel
  // neighbours the largest water body; else the highest cliffs.
  const sea = largestWaterBody();
  let cliffParcel = null;
  if (sea) {
    cliffParcel = findParcel({ families: ['Cliffs'], near: [sea.centerX, sea.centerZ] });
  }
  if (!cliffParcel) cliffParcel = highPick(['Cliffs'], taken, 60);
  put('cliff-face', cliffParcel);
  put('meteor-crater', findParcel({
    families: ['Fields', 'Steppe', 'Vale', 'Meadows'], near: [150, -320], minH: 1, maxH: 9, avoid: taken, minSep: 80,
  }), { sink: 2.5 });
  const tarPit = put('tar-pit', findParcel({
    families: ['Steppe', 'Fields', 'Meadows'], climates: ['tropical', 'subtropical', 'temperate'],
    near: [430, 200], avoid: taken, minSep: 60,
  }));
  put('rocky-outcrop', findParcel({ families: ['Reach', 'Steppe'], near: [-160, 320], avoid: taken, minSep: 40 }));
  const boulder = put('giant-boulder', findParcel({
    families: ['Fields', 'Meadows', 'Steppe'], near: [60, -120], avoid: taken, minSep: 40,
  }), { extras: [[46, -28, 0.7], [-30, 34, 1.25]] });
  if (boulder) {
    boulder.extras = boulder.extras.map(([dx, dz, s]) => ({ x: boulder.x + dx, z: boulder.z + dz, scale: s }));
  }
  // The castle stands on its own parcel at the south pole.
  const c = parcelCenterWorld(CASTLE);
  out.push({ slug: 'castle-transylvania', parcelIndex: CASTLE.index, x: c.x, z: c.z, heading: 0.35 });
  _landforms = out;
  _tarPit = tarPit;
  return out;
}

let _tarPit = null;

// Dinosaur distribution: herds on the grass, packs working the
// steppe, stalkers in the high country, the two apexes holding
// opposite territories (Indominus west, Spinosaurus Rex east at
// the tar pit — the Bay's arrangement at planet scale).
const DINO_PLAN = {
  'triceratops':      { copies: 3, mode: 'walk', families: ['Fields', 'Meadows', 'Grove', 'Vale'], near: [-260, -60], walkR: 52, speed: 0.5 },
  'brachiosaurus':    { copies: 2, mode: 'stand', families: ['Fields', 'Meadows', 'Grove'], near: [-340, 70] },
  'diplodocus':       { copies: 2, mode: 'stand', families: ['Fields', 'Meadows', 'Vale'], near: [-180, 170] },
  'stegosaurus':      { copies: 2, mode: 'stand', families: ['Fields', 'Meadows', 'Grove'], near: [-120, -230] },
  'parasaurolophus':  { copies: 2, mode: 'stand', families: ['Fields', 'Meadows', 'Vale'], near: [80, 210] },
  'iguanodon':        { copies: 2, mode: 'stand', families: ['Fields', 'Meadows', 'Grove'], near: [190, -170] },
  'gallimimus':       { copies: 3, mode: 'walk', families: ['Fields', 'Meadows'], near: [30, -30], walkR: 46, speed: 1.3 },
  'ankylosaurus':     { copies: 1, mode: 'walk', families: ['Reach', 'Steppe', 'Fields'], near: [300, 120], walkR: 38, speed: 0.5 },
  'velociraptor':     { copies: 3, mode: 'walk', families: ['Steppe', 'Reach', 'Fields'], near: [330, -230], walkR: 40, speed: 1.5 },
  'allosaurus':       { copies: 2, mode: 'stand', families: ['Steppe', 'Reach', 'Fields'], near: [390, 30] },
  'dilophosaurus':    { copies: 2, mode: 'stand', families: ['Grove', 'Fields', 'Steppe'], near: [240, 300] },
  'carnotaurus':      { copies: 1, mode: 'stand', families: ['Steppe', 'Fields'], near: [-60, 390] },
  'tyrannosaurus-rex': { copies: 1, mode: 'stand', families: ['Steppe', 'Reach'], near: [-390, -310] },
  'compsognathus':    { copies: 1, mode: 'stand', families: ['Fields', 'Meadows'], near: [100, 60] },
  'indominus-rex':    { copies: 1, mode: 'walk', families: ['Highlands', 'Reach', 'Steppe'], near: [-440, -80], walkR: 58, speed: 0.45 },
};

let _creatures = null;
/**
 * Land-creature instances: { slug, copy, x, z, heading, parcelIndex,
 * walk } — walk is a circuit { cx, cz, r, speed, a0 } or null.
 * Copies are the herd/pack/flock members (clones of the one foundry
 * model, exactly as the compy swarm and bat swarm clone theirs).
 */
export function worldCreatures() {
  if (_creatures) return _creatures;
  const out = [];
  const used = []; // anchor points, kept apart so herds don't stack
  for (const [slug, spec] of Object.entries(DINO_PLAN)) {
    const anchor = findParcel({ families: spec.families, near: spec.near, avoid: used, minSep: 55 });
    if (!anchor) continue;
    const c = parcelCenterWorld(anchor);
    used.push([c.x, c.z]);
    const rng = mulberry32(slugSeed(slug));
    for (let i = 0; i < spec.copies; i++) {
      const a = rng() * Math.PI * 2;
      const rad = i === 0 ? 0 : 6 + rng() * 9;
      const x = c.x + Math.cos(a) * rad;
      const z = c.z + Math.sin(a) * rad;
      out.push({
        slug,
        copy: i,
        x,
        z,
        heading: rng() * Math.PI * 2,
        parcelIndex: anchor.index,
        walk: spec.mode === 'walk'
          ? { cx: c.x, cz: c.z, r: spec.walkR * (0.8 + rng() * 0.4), speed: spec.speed, a0: rng() * Math.PI * 2 }
          : null,
      });
    }
  }
  // Spinosaurus fishes the sea's shore: a dry parcel at the
  // water's edge of the largest body.
  const sea = largestWaterBody();
  if (sea) {
    const shore = findParcel({ families: null, near: [sea.centerX + sea.radiusM * 0.9, sea.centerZ], minH: 0.3, maxH: 2.6 });
    if (shore) {
      const c = parcelCenterWorld(shore);
      out.push({ slug: 'spinosaurus', copy: 0, x: c.x, z: c.z, heading: headingFor(shore.index), parcelIndex: shore.index, walk: null });
    }
  }
  // Spinosaurus Rex holds the tar pit's edge (the Bay's law) —
  // on the first dry footing the scan finds beside the pit.
  worldLandforms();
  if (_tarPit) {
    const stand = spawnPointFor(parcelAtWorld(_tarPit.x + 24, _tarPit.z - 16));
    out.push({
      slug: 'spinosaurus-rex', copy: 0,
      x: stand.x, z: stand.z,
      heading: 0.18, parcelIndex: stand.parcel.index, walk: null,
    });
  }
  // The compy swarm scurries a meadow south-east of the heart.
  const compyParcel = findParcel({ families: ['Fields', 'Meadows'], near: [95, 95], avoid: used, minSep: 30 });
  _creatures = out;
  _compyCenter = compyParcel ? parcelCenterWorld(compyParcel) : { x: 95, z: 95 };
  return out;
}

let _compyCenter = null;
/** Where the compy swarm scurries (world centre of its meadow). */
export function compySwarmCenter() {
  worldCreatures();
  return _compyCenter || { x: 95, z: 95 };
}

let _swimmers = null;
/**
 * The sea's cast: every marine species on its own circuit inside
 * the largest water body, SWIMMERS profiles (creatures.js) scaled
 * from the Bay's lake to the sea, depths resolved against the
 * real bed so backs break the surface and bellies clear the floor.
 */
export function worldSwimmers() {
  if (_swimmers) return _swimmers;
  const sea = largestWaterBody();
  const out = [];
  if (sea) {
    // Anchors are the body's own wet parcels, chosen greedily by
    // CLEARANCE — ray-marching the true heightfield in 16
    // directions to the first shallow bed — so each swimmer gets
    // the widest deep water around it, the eight stay apart, and
    // no circuit is centred on an island inside an L-shaped sea.
    // Each circuit's radius is fitted to that measured clearance.
    const shoreDistance = (cx, cz) => {
      let best = 90;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (let r = 4; r <= 90; r += 4) {
          if (heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r) > WATER_Y - 0.35) {
            if (r < best) best = r;
            break;
          }
        }
      }
      return best;
    };
    const candidates = sea.parcels.map((p) => {
      const c = parcelCenterWorld(p);
      return { x: c.x, z: c.z, clearance: shoreDistance(c.x, c.z) };
    }).sort((a, b) => b.clearance - a.clearance || a.x - b.x || a.z - b.z);
    const anchors = [];
    for (const sep of [45, 28, 0]) {
      for (const cand of candidates) {
        if (anchors.length >= Object.keys(SWIMMERS).length) break;
        if (anchors.includes(cand)) continue;
        if (anchors.every((a) => Math.hypot(a.x - cand.x, a.z - cand.z) >= sep)) anchors.push(cand);
      }
      if (anchors.length >= Object.keys(SWIMMERS).length) break;
    }
    const slugs = Object.keys(SWIMMERS);
    slugs.forEach((slug, i) => {
      const entry = EARTH2_MODEL_BY_SLUG.get(slug);
      const profile = SWIMMERS[slug];
      if (!entry || !profile) return;
      const anchor = anchors[i % anchors.length];
      const cx = anchor.x;
      const cz = anchor.z;
      const rx = clamp(Math.min(profile.rx * 3, anchor.clearance * 0.8), 10, 56);
      const rz = clamp(rx * (profile.rz / profile.rx), 9, 50);
      const bedHere = heightAt(cx, cz);
      const shallow = WATER_Y - Math.max(0.65, entry.scaleM * 0.05);
      let deep = WATER_Y - Math.max(1.7, (WATER_Y - bedHere) * 0.6);
      if (deep > shallow - 0.8) deep = shallow - 0.8;
      out.push({
        slug, bodySize: sea.size, cx, cz, rx, rz, deep, shallow,
        speed: profile.speed, dir: profile.dir, period: profile.period, duty: profile.duty,
        drive: profile.drive, waveHz: profile.waveHz, ampTail: profile.ampTail,
        waveSpan: profile.waveSpan, paddleHz: profile.paddleHz, paddleAmp: profile.paddleAmp,
      });
    });
  }
  _swimmers = out;
  return out;
}

let _flyers = null;
/**
 * The sky's cast: FLYERS profiles (creatures.js) re-anchored —
 * giants high over the heartland, mid flyers over the coast,
 * skimmers over the sea itself, the little ones over meadow and
 * grove. Heights are cruise floors; the driver also lifts each
 * flyer over rising terrain.
 */
export function worldFlyers() {
  if (_flyers) return _flyers;
  const sea = largestWaterBody();
  const landing = landingParcel();
  const lc = parcelCenterWorld(landing);
  const plans = {
    pteranodon:      { cx: lc.x, cz: lc.z, rScale: 2.2, hAdd: 10 },
    quetzalcoatlus:  { cx: -60, cz: -160, rScale: 2.6, hAdd: 14 },
    hatzegopteryx:   { cx: 120, cz: -60, rScale: 2.6, hAdd: 12 },
    tapejara:        { cx: sea ? sea.deepestX : 0, cz: sea ? sea.deepestZ : 0, rScale: 1.8, hAdd: 6 },
    nyctosaurus:     { cx: sea ? sea.deepestX : 0, cz: sea ? sea.deepestZ : 0, rScale: 1.8, hAdd: 5 },
    dimorphodon:     { cx: sea ? sea.deepestX : 0, cz: sea ? sea.deepestZ : 0, rScale: 2.2, hAdd: 1 },
    rhamphorhynchus: { cx: sea ? sea.deepestX : 0, cz: sea ? sea.deepestZ : 0, rScale: 2.2, hAdd: 1 },
    pterodactylus:   { cx: lc.x + 60, cz: lc.z + 40, rScale: 2.0, hAdd: 2 },
    archaeopteryx:   { cx: lc.x - 70, cz: lc.z - 30, rScale: 1.8, hAdd: 1 },
  };
  const out = [];
  for (const [slug, plan] of Object.entries(plans)) {
    const profile = FLYERS[slug];
    if (!profile) continue;
    out.push({
      slug,
      cx: plan.cx, cz: plan.cz,
      r: clamp(profile.r * plan.rScale, 24, 130),
      h: profile.h + plan.hAdd,
      speed: profile.speed, dir: profile.dir,
      flapHz: profile.flapHz, flapAmp: profile.flapAmp,
      cycle: profile.cycle, glideDuty: profile.glideDuty, bob: profile.bob,
      overWater: ['dimorphodon', 'rhamphorhynchus'].includes(slug),
    });
  }
  _flyers = out;
  return out;
}

// Plant dressing by biome: counts per species for the whole
// planet (≈2× the Bay's diorama scatter, proximity-culled in the
// scene). Reeds root at the water's edge; conifers take the cold
// high ground; the rest follow their families.
const PLANT_PLAN = {
  'tree-fern':        { count: 10, families: ['Grove', 'Vale'], climates: ['tropical', 'subtropical', 'temperate'] },
  'cycad-palm':       { count: 12, families: ['Fields', 'Meadows', 'Shore'], climates: ['tropical', 'subtropical', 'temperate'] },
  'ginkgo-tree':      { count: 6, families: ['Grove', 'Vale', 'Fields'], climates: ['temperate', 'subtropical', 'subpolar'] },
  'giant-conifer':    { count: 8, families: ['Highlands', 'Reach', 'Grove'], climates: ['subpolar', 'temperate', 'polar'] },
  'horsetail-reeds':  { count: 14, wetEdge: true },
  'magnolia':         { count: 6, families: ['Grove', 'Meadows'], climates: ['tropical', 'subtropical', 'temperate'] },
  'bennettitales':    { count: 10, families: ['Fields', 'Steppe', 'Meadows'], climates: ['tropical', 'subtropical', 'temperate'] },
  'fern-ground-cover': { count: 22, families: ['Grove', 'Vale', 'Fields', 'Meadows'] },
  'club-moss':        { count: 16, families: ['Grove', 'Vale', 'Highlands'] },
  'araucaria':        { count: 6, families: ['Reach', 'Highlands', 'Grove'], climates: ['temperate', 'subpolar'] },
};

let _plants = null;
/** Plant instances: { slug, x, z, heading, scale } — deterministic. */
export function worldPlants() {
  if (_plants) return _plants;
  const out = [];
  for (const [slug, spec] of Object.entries(PLANT_PLAN)) {
    const rng = mulberry32(slugSeed(slug));
    const candidates = PARCELS.filter((p) => {
      if (spec.wetEdge) return true;
      if (spec.families && !spec.families.includes(familyForParcel(p))) return false;
      if (spec.climates && !spec.climates.includes(climateForParcel(p))) return false;
      return true;
    });
    let placedCount = 0;
    let guard = 0;
    while (placedCount < spec.count && guard < spec.count * 14) {
      guard++;
      const p = candidates[Math.floor(rng() * candidates.length)];
      if (!p) break;
      const c = parcelCenterWorld(p);
      const x = c.x + (rng() - 0.5) * WORLD_CELL_M * 1.7;
      const z = c.z + (rng() - 0.5) * WORLD_CELL_M * 1.7;
      if (Math.abs(x) > WORLD_HALF_M - 6 || Math.abs(z) > WORLD_HALF_M - 6) continue;
      const h = heightAt(x, z);
      if (spec.wetEdge) {
        if (h < WATER_Y - 0.5 || h > WATER_Y + 0.6) continue;
      } else if (h < WATER_Y + 0.35) continue;
      out.push({ slug, x, z, heading: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.5 });
      placedCount++;
    }
  }
  _plants = out;
  return out;
}

/** Mosquito cruise centres: over the three great herds, where
 *  the feeding loop has hosts. Two mosquitos ride each centre. */
export function worldMosquitoCenters() {
  const creatures = worldCreatures();
  const centers = [];
  for (const slug of ['triceratops', 'gallimimus', 'parasaurolophus']) {
    const first = creatures.find((c) => c.slug === slug);
    if (first) centers.push({ slug, cx: first.walk ? first.walk.cx : first.x, cz: first.walk ? first.walk.cz : first.z });
  }
  return centers;
}

/** Dracula's court: the castle at its parcel, the Count's spot
 *  before its front face, facing the world's heart. */
export function draculaCourt() {
  const c = parcelCenterWorld(CASTLE);
  const toHeart = Math.atan2(0 - c.x, 0 - c.z);
  const spot = {
    x: c.x + Math.sin(toHeart) * 31,
    z: c.z + Math.cos(toHeart) * 31,
  };
  spot.y = heightAt(spot.x, spot.z);
  return {
    castle: { x: c.x, z: c.z, parcelIndex: CASTLE.index },
    spot,
    facing: Math.atan2(c.x - spot.x, c.z - spot.z) + Math.PI,
  };
}

// ── Collision & the walker step ─────────────────────────────────
// Static circles (radius in metres) around the structures Earth
// law makes solid: the castle, the mountains, the volcanoes, the
// cliff, the outcrop and the boulders. (Creatures collide
// dynamically in the scene; the crater and tar pit are ground
// features a walker may enter.)
const COLLIDER_R = {
  'castle-transylvania': 27,
  'mountain-range': 24,
  'active-volcano': 17,
  'dormant-volcano': 15,
  'cliff-face': 13,
  'rocky-outcrop': 5,
  'giant-boulder': 3.4,
};

let _colliders = null;
export function worldColliders() {
  if (_colliders) return _colliders;
  const out = [];
  for (const lf of worldLandforms()) {
    const r = COLLIDER_R[lf.slug];
    if (r) out.push({ x: lf.x, z: lf.z, r, slug: lf.slug });
    if (lf.extras) {
      for (const e of lf.extras) out.push({ x: e.x, z: e.z, r: 3.4 * e.scale, slug: lf.slug });
    }
  }
  _colliders = out;
  return out;
}

/** Drag-look: yaw/pitch from accumulated pixel deltas (clamped). */
export function applyWorldLook(yaw, pitch, dx, dy, sensitivity = 0.0026) {
  return {
    yaw: yaw - dx * sensitivity,
    pitch: clamp(pitch - dy * sensitivity, -1.35, 1.35),
  };
}

function pushOutOfCircles(x, z, colliders) {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const rr = c.r + WALKER_RADIUS_M;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        px = c.x + (dx / d) * rr;
        pz = c.z + (dz / d) * rr;
      }
    }
  }
  return { x: px, z: pz };
}

/**
 * One walker step. state { x, z }; input { fwd, strafe } in
 * −1..1; the step honours the Earth laws: terrain is the floor
 * (the scene sets y from heightAt), deep water turns the walker
 * back (axis-separated slide first), structures push out by
 * radius, and the world's edge is a wall.
 */
export function stepWorldWalker(state, yaw, input, dt, colliders, travel = false) {
  const speed = travel ? TRAVEL_SPEED_MPS : WALK_SPEED_MPS;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Camera forward on the ground is (−sin yaw, −cos yaw); right
  // is (cos yaw, −sin yaw) — three.js YXZ convention.
  let vx = (-sin) * input.fwd + cos * input.strafe;
  let vz = (-cos) * input.fwd + (-sin) * input.strafe;
  const len = Math.hypot(vx, vz);
  if (len > 1) { vx /= len; vz /= len; }
  const mag = Math.min(1, len);
  let nx = state.x + vx * speed * dt;
  let nz = state.z + vz * speed * dt;
  if (mag > 0) {
    // The wading law: shallows are walkable; water deeper than
    // chest height is a wall — try sliding along each axis before
    // giving the step up. From a legal depth the wall is hard
    // (no creeping deeper stride by stride). A walker somehow
    // already over-deep (a spawn scan, a shove) may still move
    // so long as the step doesn't deepen by more than noise —
    // it can always walk out, never further in.
    const dHere = waterDepthAt(state.x, state.z);
    const blocked = (x2, z2) => {
      const d = waterDepthAt(x2, z2);
      if (dHere > MAX_WADE_DEPTH_M) return d > dHere + 0.02;
      return d > MAX_WADE_DEPTH_M;
    };
    if (blocked(nx, nz)) {
      if (!blocked(nx, state.z)) {
        nz = state.z;
      } else if (!blocked(state.x, nz)) {
        nx = state.x;
      } else {
        nx = state.x;
        nz = state.z;
      }
    }
  }
  const pushed = pushOutOfCircles(nx, nz, colliders || []);
  nx = clamp(pushed.x, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  nz = clamp(pushed.z, -WORLD_HALF_M + 4, WORLD_HALF_M - 4);
  return { x: nx, z: nz };
}

/** Points along a parcel's border (for the walker's highlight
 *  outline): [x, z] pairs, `per` samples per edge, closed loop. */
export function parcelBorderPoints(parcel, per = 6) {
  const rect = parcelWorldRect(parcel);
  const pts = [];
  const edges = [
    [rect.minX, rect.minZ, rect.maxX, rect.minZ],
    [rect.maxX, rect.minZ, rect.maxX, rect.maxZ],
    [rect.maxX, rect.maxZ, rect.minX, rect.maxZ],
    [rect.minX, rect.maxZ, rect.minX, rect.minZ],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    for (let i = 0; i < per; i++) {
      const t = i / per;
      pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  return pts;
}
