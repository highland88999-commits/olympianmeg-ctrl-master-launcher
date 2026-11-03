// lib/earth2/staged-objects.js
// EARTH 2 — STAGED OBJECT PLACEMENT (Merlin, 2026-11-03):
// "On free parcels, throughout earth 2, sized proportionally to the realm."
//
// The 1,884 objects staged off Earth 1 (2026-10-26, inventory in
// ~/workspace/earth1-staged-objects/inventory.json) are placed here
// on Earth 2's FREE COMMONS parcels only — never on ownable parcels.
// Sizes are capped proportionally to the realm (28 m parcels, 1,400 m
// world): vegetation/buildings/props keep their metre scales (they
// fit), landmarks cap at castle scale (40 m), terrain features cap
// at 50 m — a 3,776 m mountain range cannot exist on a 1,400 m world.
//
// Deterministic: seeded RNG per object key, so every visitor sees
// the same world. Pure — no imports from the scene.

import { STAGED_OBJECTS } from './staged-objects-data.js';
import { isOwnableIndex } from './parcels.js';

// ── Realm-proportional scale caps (metres) ──────────────────────
// Earth 2: 1,400 m world, 28 m parcels. Objects keep their real-metre
// scaleM where it fits; oversized categories are capped so they sit
// proportionally in the realm instead of breaking it.
export const STAGED_SCALE_CAPS = {
  vegetation: 25, // trees/bushes fit inside a parcel
  building: 25, // buildings fit inside a parcel
  prop: 20, // props stay small
  landmark: 40, // castle-scale max (Castle Transylvania is 40 m)
  terrain: 50, // rock formations/outcrops, scaled to the realm
  aether: 5, // collectible shards stay small
};

/** Default scale when the inventory has none (aether shards). */
export const STAGED_DEFAULT_SCALE_M = 3;

/**
 * Realm-proportional scale for a staged object: its inventory scaleM
 * in real metres, capped by category so it fits Earth 2's 28 m
 * parcels and 1,400 m world.
 */
export function scaleForRealm(scaleM, category) {
  const s = Number(scaleM) > 0 ? Number(scaleM) : STAGED_DEFAULT_SCALE_M;
  const cap = STAGED_SCALE_CAPS[category] || 25;
  return Math.min(s, cap);
}

// ── Deterministic RNG (mulberry32, same family as world.js) ─────
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Free-parcel pool ────────────────────────────────────────────
// PARCELS lives in parcels.js as a 2,500-entry array in row-major
// order; index i is ownable iff isOwnableIndex(i). We take only the
// Free Commons — Merlin's rule: staged objects never touch ownable land.
function freeParcelIndices() {
  const out = [];
  for (let i = 0; i < 2500; i++) {
    if (!isOwnableIndex(i)) out.push(i);
  }
  return out;
}

// ── Placement ───────────────────────────────────────────────────
// Each staged object gets a deterministic free parcel (round-robin
// over a shuffled free-parcel pool, seeded by the object's key) and
// a jittered position inside it. Returns placement records:
// { key, assetId, name, category, sourceFile, parcelIndex, parcelId,
//   scaleM, headingDeg } — the scene resolves x/z from the parcel.

let _placements = null;

export function stagedPlacements() {
  if (_placements) return _placements;
  const free = freeParcelIndices();
  const out = [];
  for (const obj of STAGED_OBJECTS) {
    const rng = mulberry32(hashStr(obj.key));
    // Deterministic free parcel: shuffle-pick by key seed.
    const parcelIndex = free[Math.floor(rng() * free.length)];
    const parcelId = 'E2-' + String(parcelIndex + 1).padStart(4, '0');
    out.push({
      key: obj.key,
      assetId: obj.assetId,
      name: obj.name,
      category: obj.category,
      sourceFile: obj.sourceFile,
      parcelIndex,
      parcelId,
      scaleM: scaleForRealm(obj.scaleM, obj.category),
      headingDeg: Number(obj.headingDeg) || Math.floor(rng() * 360),
      // Jitter within the parcel (0..1 fractions, scene multiplies by cell).
      jx: rng(),
      jz: rng(),
    });
  }
  _placements = out;
  return out;
}

/** Count of staged objects placed (should be 1,884). */
export function stagedPlacementCount() {
  return stagedPlacements().length;
}

/** True when every placement sits on a Free Commons parcel. */
export function allOnFreeParcels() {
  return stagedPlacements().every((p) => !isOwnableIndex(p.parcelIndex));
}
