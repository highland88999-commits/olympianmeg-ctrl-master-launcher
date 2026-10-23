// lib/earth2/scatter.js
// EARTH 2 — COMMONS DRESSING (Terrain Wave B, 2026-10-23).
// Merlin: "More foliage and stuff on free parcels. Rocks and
// craters and stuff should be solid objects (not pass
// throughable)".
//
// A DERIVED layer over the finished world — world.js generation
// is untouched (the fingerprint never moves); everything here is
// recomputed deterministically from parcel ids with a seeded
// RNG, the planet's procedural law (no Math.random in world
// state). Three kinds of dressing, all for FREE COMMONS parcels
// ONLY — ownable and owned parcels stay clean because owners
// build there:
//   - FOLIAGE: extra instances of the manifest's plant models,
//     scattered per parcel (trees, shrubs, ground cover, shore
//     reeds), placed by the same family/climate affinities the
//     world's own vegetation uses.
//   - ROCKS: procedural boulders (the mountain scatter's
//     language), 0–3 per parcel by biome.
//   - CRATERS: on steppe/badlands-flavoured parcels, a rim ring
//     of low stones around a dark bowl disc.
// NOTHING dressed lands on a protected parcel (the castle, the
// museum grounds, Tyrrell Field, the landforms — all read from
// lib/earth2/building.js's protected set), inside a landform's
// collider, near a parked vehicle instance, or underwater
// (reeds alone live in the wet-edge band, and never deeper than
// wading). Parcels carrying a player's build are skipped by the
// scene at place time — this module is pure data and cannot know
// about builds; the collider set below is likewise parcel-pure,
// and the scene additionally drops a parcel's dressing colliders
// for as long as a build stands there (a packed-up build returns
// the parcel, and its dressing, to the commons).
//
// SOLIDS: every rock, boulder, crater (a disc collider at its
// rim radius — the crater is treated as a solid object, per
// Merlin's words) and tree trunk registers a collider in
// dressingColliders(), consumed by the walker and the ground
// vehicles through the world's existing collider plumbing.

import { PARCELS } from './parcels.js';
import {
  WATER_Y,
  heightAt,
  climateForParcel,
  familyForParcel,
  parcelCenterWorld,
  worldColliders,
} from './world.js';
import { parcelById, CASTLE_PARCEL_ID } from './parcels.js';
import { protectedParcelIds } from './building.js';
import { vehicleInstances } from './fleet.js';

// djb2-ish string hash — the world's own seed pattern (world.js).
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h || 1;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

// Dressing species by role, with the families/climates they suit
// (the same affinities world.js's PLANT_PLAN uses; the manifest's
// plant slugs only).
const TREES = [
  { slug: 'ginkgo-tree', families: ['Fields', 'Grove', 'Meadows', 'Shore', 'Vale'], climates: ['subtropical', 'temperate'] },
  { slug: 'araucaria', families: ['Reach', 'Shore', 'Highlands', 'Grove'], climates: ['subtropical', 'temperate', 'subpolar'] },
  { slug: 'conifer', families: ['Reach', 'Highlands', 'Cliffs', 'Grove', 'Steppe'], climates: ['polar', 'subpolar', 'temperate'] },
  { slug: 'magnolia', families: ['Fields', 'Meadows', 'Vale', 'Basin'], climates: ['tropical', 'subtropical'] },
];
const SHRUBS = [
  { slug: 'cycad', climates: ['tropical', 'subtropical'] },
  { slug: 'bennettitales', climates: ['tropical', 'subtropical', 'temperate'] },
];
const COVER = [
  { slug: 'tree-fern', climates: ['tropical', 'subtropical'] },
  { slug: 'clubmoss', climates: ['temperate', 'subpolar', 'polar'] },
  { slug: 'horsetail-reeds', climates: ['tropical', 'subtropical', 'temperate', 'subpolar', 'polar'] },
];

// Per-family dressing appetite: [trees, shrubs, cover, rocks,
// craterChance]. Polar parcels dress thin (the multiplier in
// dressingForParcel), the steppe carries the craters.
const FAMILY_DRESSING = {
  Fields: { trees: [0, 1], shrubs: [1, 2], cover: [2, 4], rocks: [0, 2], crater: 0 },
  Meadows: { trees: [0, 1], shrubs: [1, 2], cover: [2, 4], rocks: [0, 1], crater: 0 },
  Grove: { trees: [1, 2], shrubs: [1, 2], cover: [2, 4], rocks: [0, 1], crater: 0 },
  Vale: { trees: [0, 2], shrubs: [1, 2], cover: [2, 3], rocks: [0, 1], crater: 0 },
  Reach: { trees: [0, 1], shrubs: [0, 1], cover: [0, 2], rocks: [2, 3], crater: 0 },
  Highlands: { trees: [0, 1], shrubs: [0, 1], cover: [0, 1], rocks: [2, 4], crater: 0 },
  Cliffs: { trees: [0, 1], shrubs: [0, 1], cover: [0, 1], rocks: [2, 4], crater: 0 },
  Steppe: { trees: [0, 1], shrubs: [0, 1], cover: [0, 2], rocks: [1, 3], crater: 0.32 },
  Basin: { trees: [0, 1], shrubs: [0, 1], cover: [1, 3], rocks: [0, 1], crater: 0 },
  Shore: { trees: [0, 1], shrubs: [0, 1], cover: [1, 2], rocks: [0, 2], crater: 0 },
};
const DEFAULT_DRESSING = { trees: [0, 1], shrubs: [0, 1], cover: [1, 2], rocks: [0, 2], crater: 0 };

const INSET_M = 2.2; // items keep this far inside the parcel rect
const PARCEL_HALF_M = 14;

function slopeSpread(x, z, r) {
  const hs = [
    heightAt(x, z),
    heightAt(x + r, z), heightAt(x - r, z),
    heightAt(x, z + r), heightAt(x, z - r),
  ];
  return Math.max(...hs) - Math.min(...hs);
}

let _cache = null; // { byParcel: Map<index, dressing>, colliders, foliage, features, parcels }

/**
 * The dressing of one Commons parcel (memoized):
 * { parcelId, index, foliage: [{ slug, role, x, z, heading,
 *   scale, trunkR }], rocks: [{ x, z, r, h, seed }],
 *   craters: [{ x, z, rimR }] }
 * Ownable parcels return an empty dressing — owners build there.
 */
export function dressingForParcel(parcel) {
  const all = allDressing();
  return all.byParcel.get(parcel.index) || EMPTY;
}
const EMPTY = Object.freeze({ parcelId: null, foliage: [], rocks: [], craters: [] });

/** Every dressed parcel id (Commons parcels with ≥ 1 item). */
export function scatterParcelIds() {
  return allDressing().parcels.slice();
}

/** Every dressing item as ONE flat foliage list (streaming and
 *  the scene read it from here; each item carries its parcel). */
export function scatterFoliage() {
  return allDressing().foliage;
}

/** Every solid the dressing adds: { x, z, r, kind, parcelId } —
 *  rocks, boulders, crater discs (rim radius) and tree trunks. */
export function dressingColliders() {
  return allDressing().colliders;
}

/** Parcels whose procedural features (rocks/craters) stream as
 *  their own units: [{ parcelId, index, cx, cz, r }]. */
export function scatterFeatureUnits() {
  return allDressing().featureParcels;
}

function allDressing() {
  if (_cache) return _cache;
  const prot = protectedParcelIds();
  const castleC = parcelCenterWorld(parcelById(CASTLE_PARCEL_ID));
  const landforms = worldColliders();
  const homes = vehicleInstances();

  const byParcel = new Map();
  const colliders = [];
  const foliage = [];
  const featureParcels = [];
  const parcels = [];

  const clearOf = (x, z, extra) => {
    for (const c of landforms) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + extra) return false;
    }
    if (Math.hypot(x - castleC.x, z - castleC.z) < 36) return false;
    for (const h of homes) {
      if (Math.hypot(x - h.home.x, z - h.home.z) < 7) return false;
    }
    return true;
  };

  for (const parcel of PARCELS) {
    if (parcel.kind !== 'commons' || prot.has(parcel.id)) continue;
    const d = dressOneParcel(parcel, clearOf);
    if (!d) continue;
    byParcel.set(parcel.index, d);
    parcels.push(parcel.id);
    for (const f of d.foliage) {
      foliage.push({ ...f, parcelId: parcel.id });
      if (f.trunkR > 0) colliders.push({ x: f.x, z: f.z, r: f.trunkR, kind: 'trunk', parcelId: parcel.id });
    }
    for (const r of d.rocks) colliders.push({ x: r.x, z: r.z, r: r.r * 0.9, kind: 'rock', parcelId: parcel.id });
    for (const c of d.craters) colliders.push({ x: c.x, z: c.z, r: c.rimR, kind: 'crater', parcelId: parcel.id });
    if (d.rocks.length || d.craters.length) {
      const c0 = parcelCenterWorld(parcel);
      featureParcels.push({ parcelId: parcel.id, index: parcel.index, cx: c0.x, cz: c0.z, r: 20 });
    }
  }
  _cache = { byParcel, colliders, foliage, featureParcels, parcels };
  return _cache;
}

function dressOneParcel(parcel, clearOf) {
  const c = parcelCenterWorld(parcel);
  const family = familyForParcel(parcel);
  const climate = climateForParcel(parcel);
  const plan = FAMILY_DRESSING[family] || DEFAULT_DRESSING;
  const rng = mulberry32(hashStr(`scatter:${parcel.id}`));
  const centreH = heightAt(c.x, c.z);
  // A fully wet parcel dresses nothing (its "commons" shore is
  // the water's); a shoreline parcel still dresses its dry part.
  if (centreH < WATER_Y - 0.2 && slopeSpread(c.x, c.z, PARCEL_HALF_M - 2) < 0.6) return null;

  const polar = climate === 'polar';
  const count = (range) => {
    const n = range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
    return polar ? Math.round(n * 0.4) : n;
  };
  const spotIn = (dryBand) => {
    for (let tries = 0; tries < 10; tries++) {
      const x = c.x + (rng() * 2 - 1) * (PARCEL_HALF_M - INSET_M);
      const z = c.z + (rng() * 2 - 1) * (PARCEL_HALF_M - INSET_M);
      const h = heightAt(x, z);
      if (dryBand === 'wet') {
        if (h < WATER_Y - 0.15 || h > WATER_Y + 0.45) continue;
      } else if (h <= WATER_Y + 0.3) continue;
      if (!clearOf(x, z, 1.5)) continue;
      return { x, z, h };
    }
    return null;
  };
  const speciesFor = (table, role) => {
    const ok = table.filter((s) =>
      (!s.families || s.families.includes(family)) && (!s.climates || s.climates.includes(climate)));
    return ok.length ? pick(rng, ok) : null;
  };

  const items = [];
  const rocks = [];
  const craters = [];

  const nTrees = count(plan.trees);
  for (let i = 0; i < nTrees; i++) {
    const s = speciesFor(TREES, 'tree');
    const spot = s && spotIn('dry');
    if (!s || !spot) continue;
    const scale = 0.8 + rng() * 0.7;
    items.push({
      slug: s.slug, role: 'tree', x: spot.x, z: spot.z,
      heading: rng() * Math.PI * 2, scale, trunkR: 0.45 * scale,
    });
  }
  const nShrubs = count(plan.shrubs);
  for (let i = 0; i < nShrubs; i++) {
    const s = speciesFor(SHRUBS, 'shrub');
    const spot = s && spotIn('dry');
    if (!s || !spot) continue;
    items.push({
      slug: s.slug, role: 'shrub', x: spot.x, z: spot.z,
      heading: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.8, trunkR: 0,
    });
  }
  const nCover = count(plan.cover);
  for (let i = 0; i < nCover; i++) {
    const s = speciesFor(COVER, 'cover');
    // Reeds alone may stand in the wet-edge band; other cover is dry.
    const band = s && s.slug === 'horsetail-reeds' && rng() < 0.6 ? 'wet' : 'dry';
    const spot = s && spotIn(band);
    if (!s || !spot) continue;
    items.push({
      slug: s.slug, role: 'cover', x: spot.x, z: spot.z,
      heading: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.9, trunkR: 0,
    });
  }
  const nRocks = count(plan.rocks);
  for (let i = 0; i < nRocks; i++) {
    const spot = spotIn('dry');
    if (!spot) continue;
    const big = rng() < 0.3;
    const r = big ? 1.1 + rng() * 0.6 : 0.4 + rng() * 0.6;
    rocks.push({ x: spot.x, z: spot.z, r, h: r * (0.7 + rng() * 0.5), seed: Math.floor(rng() * 1e9) });
  }
  if (plan.crater > 0 && rng() < plan.crater) {
    const spot = spotIn('dry');
    if (spot && slopeSpread(spot.x, spot.z, 5) < 2.2) {
      craters.push({ x: spot.x, z: spot.z, rimR: 3 + rng() * 3 });
    }
  }
  if (!items.length && !rocks.length && !craters.length) return null;
  return { parcelId: parcel.id, index: parcel.index, foliage: items, rocks, craters };
}
