// lib/earth4/spawner.js
// EARTH 4 — PROGRESSIVE GPS SPAWNING (Merlin, 2026-11-12): the
// species a walker meets on the true Earth, decided by WHERE
// they stand. This is the world feed's first use: the species
// data powers what spawns.
//
// THE LAW (pure arithmetic — no server, no clock, no Math.random):
//   * The planet is cut into lat/lon cells (~0.0005° ≈ 55 m of
//     latitude). Each cell's wildlife is decided by a seeded hash
//     of the cell key — IDENTICALLY for every visitor. Walk to
//     the same spot on any phone and the same animal stands there.
//     The cells are small on purpose: a 250 m spawn radius holds
//     ~60–100 of them, so ~20–35 creatures stand in range at the
//     35% density — the world actually shows wildlife, instead of
//     the old 222 m cells that left only ~3 creatures, all far away.
//   * The species come from the real catalogue
//     (lib/earth4/species-catalogue.js — COL25 living species of
//     Animalia, Plantae, Fungi). Nothing is invented: a spawn's
//     name, class, family, environment and size are the dataset's.
//   * The environment rule: terrestrial species stand on LAND
//     only, freshwater/marine species swim in WATER only,
//     amphibious species on either. The ground (real relief from
//     the topology PNG) decides — a fish never stands on a hill,
//     a deer never stands in the sea.
//   * Spawn 250 m, despawn past 300 m (the spec distances):
//     twice the spawn radius at the far edge, so nothing flickers
//     as the walker moves. Cap 150 (Earth 2's locked wild cap).
//   * Density: ~35% of cells hold a creature, and the cells are
//     small (~55 m), so a 250 m radius holds ~60–100 of them —
//     a walker typically meets a few dozen at a time (15–70
//     depending on latitude, the longitude cells narrowing
//     toward the poles), never more than the 150 cap.
//   * Animals wander a slow seeded circuit around their home
//     (bigger animals slower); birds fly above their home;
//     plants and fungi stand still — they ARE the scenery.
//     Fish stay under the water they spawned in.
//
// The ground is injected ({ heightAt(x, z), isWater(x, z) } in
// LOCAL metres around an origin lat/lon), so the same law serves
// the real terrain and the flat test ground. Everything here is
// deterministic: the same (origin, x, z) always returns the same
// list.

import { SPECIES_CATALOGUE } from './species-catalogue.js';
import { localFromLatLon, latLonFromLocal } from './geography.js';

// ── The spawn law (the spec's own numbers) ────────────────────
export const SPAWN_RADIUS_M = 250; // the spec: spawn 250 m
export const DESPAWN_RADIUS_M = 300; // the spec: despawn past 300 m
export const WILD_CAP = 150; // Earth 2's locked wild cap
export const REFRESH_SECONDS = 1; // the scene re-reads every second
export const CELL_DENSITY = 0.35; // ~35 in every 100 cells hold a creature
export const CELL_DEG = 0.0005; // one cell ≈ 55 m of latitude

const SEED_CELL = 20261112; // Earth 4's founding day — the herd's character
const SEED_PICK = SEED_CELL + 101;
const SEED_SPOT = SEED_CELL + 203;
const SEED_WALK = SEED_CELL + 307;

// The catalogue split by spawn rule — built once at import.
const BY_ENV = { terrestrial: [], freshwater: [], marine: [], amphibious: [] };
for (const s of SPECIES_CATALOGUE) {
  if (BY_ENV[s.env]) BY_ENV[s.env].push(s);
}
export const CATALOGUE_BY_ENV = Object.freeze({
  terrestrial: Object.freeze(BY_ENV.terrestrial),
  freshwater: Object.freeze(BY_ENV.freshwater),
  marine: Object.freeze(BY_ENV.marine),
  amphibious: Object.freeze(BY_ENV.amphibious),
});

/** True when the species is a plant or fungus (it stands still). */
export function isStaticKingdom(kingdom) {
  return kingdom === 'Plantae' || kingdom === 'Fungi';
}

/** True when the species flies (birds — Aves). */
export function isFlyingClass(cls) {
  return cls === 'Aves';
}

/** True when the species swims (freshwater or marine only). */
export function isAquaticEnv(env) {
  return env === 'freshwater' || env === 'marine';
}

// Seeded hash of a string (integer arithmetic, bit-exact on
// every engine — the same cell always draws the same creature).
function hashStr(str, seed) {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** The cell key for a lat/lon. */
export function cellKeyFor(lat, lon) {
  const row = Math.floor(lat / CELL_DEG);
  const col = Math.floor(lon / CELL_DEG);
  return `${row},${col}`;
}

/**
 * The creatures standing near the walker: every cell whose
 * centre falls inside `radius` of (x, z) — local metres around
 * `origin` — whose seeded draw holds a creature, nearest first,
 * capped at `cap`. Each creature carries its cell, its species,
 * its spot, its heading, and its walk circuit — everything the
 * scene needs to build and drive it, and nothing more.
 * Deterministic: the same (origin, x, z) always returns the
 * same list.
 */
export function creaturesNear(origin, x, z, radius = SPAWN_RADIUS_M, ground, cap = WILD_CAP) {
  const r = Math.max(0, Number(radius) || 0);
  const limit = Math.max(0, Math.floor(Number(cap) || 0));
  if (limit === 0 || !ground || typeof ground.isWater !== 'function') return [];
  const here = latLonFromLocal(x, z, origin);
  // Cells that could fall inside the radius: the radius in
  // degrees (latitude is the tightest — longitude degrees are
  // wider), padded by one cell on every side.
  const dLat = r / 111195;
  const dLon = r / Math.max(1000, 111195 * Math.cos((here.lat * Math.PI) / 180));
  const minRow = Math.floor((here.lat - dLat) / CELL_DEG) - 1;
  const maxRow = Math.floor((here.lat + dLat) / CELL_DEG) + 1;
  const minCol = Math.floor((here.lon - dLon) / CELL_DEG) - 1;
  const maxCol = Math.floor((here.lon + dLon) / CELL_DEG) + 1;
  const out = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const key = `${row},${col}`;
      if (hashStr(key, SEED_CELL) >= CELL_DENSITY) continue;
      // The cell's centre, and the creature's spot inside it
      // (seeded — never the centre, so two neighbours never stack).
      const cellLat = (row + 0.5) * CELL_DEG;
      const cellLon = (col + 0.5) * CELL_DEG;
      const spotLat = cellLat + (hashStr(key, SEED_SPOT) - 0.5) * CELL_DEG * 0.8;
      const spotLon = cellLon + (hashStr(key, SEED_SPOT + 7) - 0.5) * CELL_DEG * 0.8;
      const p = localFromLatLon(spotLat, spotLon, origin);
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist > r) continue;
      // THE ENVIRONMENT RULE: the ground at the creature's own
      // feet decides which species may stand there.
      const inWater = ground.isWater(p.x, p.z);
      const pool = inWater
        ? [...BY_ENV.freshwater, ...BY_ENV.marine, ...BY_ENV.amphibious]
        : [...BY_ENV.terrestrial, ...BY_ENV.amphibious];
      if (!pool.length) continue;
      const species = pool[Math.floor(hashStr(key, SEED_PICK) * pool.length)];
      const staticKingdom = isStaticKingdom(species.kingdom);
      const flying = isFlyingClass(species.class);
      const aquatic = isAquaticEnv(species.env);
      // Birds start above their home (2 m + twice their size);
      // fish sit just under the water; everything else stands
      // on the ground it spawned on.
      const y = aquatic
        ? -0.6
        : ground.heightAt(p.x, p.z) + (flying ? 2 + species.sizeM * 2 : 0);
      // The walk: a slow circuit around the home spot (bigger
      // animals slower); birds circle above it; plants and fish
      // keep their place (fish drift, they do not walk a circuit).
      const speed = staticKingdom || aquatic
        ? 0
        : clamp(2 / Math.max(0.05, species.sizeM), 0.05, 1.2);
      const walkR = staticKingdom || aquatic
        ? 0
        : Math.max(4 + hashStr(key, SEED_WALK) * 16, species.sizeM * 1.5);
      const a0 = hashStr(key, SEED_WALK + 11) * Math.PI * 2;
      out.push({
        id: `e4:${key}`,
        cell: key,
        name: species.name,
        kingdom: species.kingdom,
        class: species.class,
        order: species.order,
        family: species.family,
        env: species.env,
        realm: species.realm,
        sizeM: species.sizeM,
        sizeSource: species.sizeSource,
        diet: species.diet,
        habitat: species.habitat,
        x: p.x,
        z: p.z,
        y,
        lat: spotLat,
        lon: spotLon,
        heading: a0,
        flying,
        aquatic,
        static: staticKingdom,
        walk: { cx: p.x, cz: p.z, r: walkR, speed, a: a0 },
        dist,
      });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}

/** True when this creature has wandered past the despawn distance. */
export function shouldDespawn(creature, x, z) {
  if (!creature) return true;
  return Math.hypot(creature.x - x, creature.z - z) > DESPAWN_RADIUS_M;
}

/**
 * Advance one creature along its walk circuit by dt seconds.
 * Pure: returns a NEW creature object (input untouched). Birds
 * circle above their home; plants, fungi and fish keep their
 * place; walkers follow the circuit's tangent, so the body
 * faces where it walks, and the ground height is re-read so
 * the animal stays on the ground it stands on.
 */
export function stepCreature(creature, dt, ground) {
  if (!creature || !creature.walk || creature.static || creature.aquatic) return creature;
  const w = creature.walk;
  const step = Math.max(0, Number(dt) || 0);
  if (w.r <= 0 || w.speed <= 0) return creature;
  const a = w.a + (w.speed / Math.max(1, w.r)) * step;
  const x = w.cx + Math.cos(a) * w.r;
  const z = w.cz + Math.sin(a) * w.r;
  const heading = Math.atan2(-Math.sin(a), Math.cos(a));
  const y = creature.flying
    ? (ground ? ground.heightAt(x, z) : creature.y) + 2 + creature.sizeM * 2
    : (ground ? ground.heightAt(x, z) : creature.y);
  return {
    ...creature,
    x,
    z,
    y,
    heading,
    walk: { ...w, a },
  };
}
