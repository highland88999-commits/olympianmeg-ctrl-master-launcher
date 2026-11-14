// lib/earth3/spawner.js
// EARTH 3 — THE LOCAL DINO SPAWNER (Merlin, 2026-11-14): the
// dinosaurs a walker meets on the boundless world. Earth 3's
// terrain is generated on demand from coordinates, so the dinos
// are too: each tile's dinosaurs are decided by a seeded hash
// of the tile id, IDENTICALLY for every visitor — walk to the
// same spot on any phone and the same dinosaur stands there.
// No server, no clock, no Math.random in the law itself.
//
// REUSED FROM EARTH 2 (not re-invented):
//   * the species — Earth 2's real dino registry
//     (lib/earth2/models.js EARTH2_MODELS): every kind ===
//     'dinosaur' entry with a placed model file. That is 17
//     species; Pachycephalosaurus is EXCLUDED because its model
//     is still 'awaiting-upload' (file: null) — a dino with no
//     model cannot render, and this module never invents one.
//   * the wild cap — 150, Earth 2's locked wild-dino cap.
//   * the visible radius — 150 m, Earth 2's streaming radius
//     (staged objects enter the scene inside it, refreshed
//     every second).
//   * the DRY-GROUND rule (Merlin, 2026-11-03): a dino never
//     stands in water — water tiles hold no land dinosaurs.
// NEW FOR EARTH 3:
//   * the despawn distance — 300 m (Earth 4's spec distance):
//     twice the spawn radius, so a dino never flickers at the
//     edge of sight as the walker moves.
//   * the density — about 6% of land tiles hold a dino, so a
//     walker typically meets a handful at a time, never a crowd.
//   * the walk — every spawned dino strolls a slow seeded
//     circuit around its tile (bigger animals slower), the way
//     Earth 2's herds walk theirs.
//
// The ground is injected ({ heightAt, biomeAt }) so the same
// law serves the real terrain (lib/earth3/terrain.js) and flat
// scenes: showcaseGround() is the /new-earth showcase's painted
// geography (flat ground, water only past the south beach).
// Everything here is pure arithmetic, so the whole spawner is
// unit-testable without a scene.

import { EARTH2_MODELS } from '../earth2/models.js';
import { heightAt as terrainHeightAt, biomeAt as terrainBiomeAt, tileToWorld, TILE_M, TILES_PER_SIDE } from './terrain.js';

// ── The cast: Earth 2's real dinosaurs, nothing invented ──────
// kind === 'dinosaur', status === 'placed', with a model file.
// Slugs, names, sizes, diets, social lives, postures, model
// files and scale bases all come from the registry itself —
// this module adds only the spawn law. The file travels with
// the species so the scene can load Earth 2's real GLB for it
// (Merlin, 2026-11-14: Earth 3's dinos are our dinos).
export const DINO_SPECIES = EARTH2_MODELS.filter(
  (m) => m && m.kind === 'dinosaur' && m.status === 'placed' && m.file
).map((m) => ({
  slug: m.slug,
  name: m.name,
  scaleM: m.scaleM,
  scaleBasis: m.scaleBasis,
  file: m.file,
  diet: m.diet,
  social: m.social,
  posture: m.posture,
}));

export const DINO_SLUGS = DINO_SPECIES.map((s) => s.slug);

// ── The spawn law ─────────────────────────────────────────────
// Earth 2's streaming radius and wild cap; Earth 4's despawn.
export const SPAWN_RADIUS_M = 150;
export const DESPAWN_RADIUS_M = 300;
export const WILD_CAP = 150;
export const REFRESH_SECONDS = 1;
// About 6 in every 100 land tiles hold a dinosaur.
export const TILE_DINO_CHANCE = 0.06;

const SEED_DINO = 20261114; // Earth 3's spawn day — the herd's character
const SEED_PICK = SEED_DINO + 101;
const SEED_WALK = SEED_DINO + 303;

// The default ground: Earth 3's real terrain.
export const terrainGround = {
  heightAt: terrainHeightAt,
  biomeAt: terrainBiomeAt,
};

/**
 * The /new-earth showcase's ground: flat (the showcase builds
 * its own disc, not the terrain engine), land everywhere on it,
 * water only past the south beach where the ocean plane lies
 * (z beyond ~200 m — the painted sand runs to z ≈ 168, the
 * water plane covers z 140–420, so 200 m keeps dinos on the
 * sand and off the swim).
 */
export function showcaseGround() {
  return {
    heightAt: () => 0,
    biomeAt: (x, z) => (z > 200 ? 'water' : 'plains'),
  };
}

// Seeded hash of a tile id (integer arithmetic, bit-exact on
// every engine — the same tile always draws the same dino).
// Tile ids run to 9,999,999,999 (past 32 bits), so the id is
// hashed in two 16-bit halves — a bare `tileId | 0` would drop
// the high bits and let far-apart tiles share a draw.
function hashTile(tileId, seed) {
  const lo = tileId % 65536;
  const hi = Math.floor(tileId / 65536);
  let h = Math.imul(lo | 0, 0x85ebca6b) ^ Math.imul(hi | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * The dinosaurs standing near (x, z): every land tile whose
 * centre falls inside `radius`, whose seeded draw holds a
 * dino, nearest first, capped at `cap` (Earth 2's wild cap by
 * default). Each dino carries its tile, its species, its spot
 * on the tile, its heading, and its walk circuit — everything
 * the scene needs to build and drive it, and nothing more.
 * Deterministic: the same (x, z) always returns the same list.
 */
export function dinosNear(x, z, radius = SPAWN_RADIUS_M, ground = terrainGround, cap = WILD_CAP) {
  const g = ground || terrainGround;
  const r = Math.max(0, Number(radius) || 0);
  const limit = Math.max(0, Math.floor(Number(cap) || 0));
  if (limit === 0 || DINO_SPECIES.length === 0) return [];
  // Tile columns/rows whose dinosaurs could fall inside the
  // radius: a dino walks a ring up to 36 m around its tile
  // centre (1.5× the longest animal), so pad the box by two
  // tiles (56 m) on every side and filter by the animal's real
  // position below — never by its tile centre.
  const minCol = Math.max(0, Math.floor((x - r) / TILE_M) + TILES_PER_SIDE / 2 - 2);
  const maxCol = Math.min(TILES_PER_SIDE - 1, Math.floor((x + r) / TILE_M) + TILES_PER_SIDE / 2 + 2);
  const minRow = Math.max(0, Math.floor((z - r) / TILE_M) + TILES_PER_SIDE / 2 - 2);
  const maxRow = Math.min(TILES_PER_SIDE - 1, Math.floor((z + r) / TILE_M) + TILES_PER_SIDE / 2 + 2);
  const out = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tileId = row * TILES_PER_SIDE + col;
      const c = tileToWorld(tileId);
      if (hashTile(tileId, SEED_DINO) >= TILE_DINO_CHANCE) continue;
      const species = DINO_SPECIES[Math.floor(hashTile(tileId, SEED_PICK) * DINO_SPECIES.length)];
      // The walk: a slow circuit around the tile centre (bigger
      // animals slower — a 24 m diplodocus strolls, a 1 m compy
      // scurries). The ring is never tighter than the animal
      // itself (1.5× its length), so a giant never turns inside
      // its own body. The dino STARTS on its circuit, at a seeded
      // angle, so its first step walks — it never teleports from
      // the centre onto the ring.
      const speed = clamp(12 / species.scaleM, 0.4, 1.5);
      const walkR = Math.max(6 + hashTile(tileId, SEED_WALK) * 22, species.scaleM * 1.5);
      const a0 = hashTile(tileId, SEED_WALK + 11) * Math.PI * 2;
      const dx = c.x + Math.cos(a0) * walkR;
      const dz = c.z + Math.sin(a0) * walkR;
      // DRY-GROUND: the animal itself must stand on dry land.
      if (g.biomeAt(dx, dz) === 'water') continue;
      // The spawn radius is measured to the DINOSAUR, not its
      // tile — a giant on a wide ring only appears once the
      // animal itself is inside it.
      const dist = Math.hypot(dx - x, dz - z);
      if (dist > r) continue;
      out.push({
        id: `e3-dino:${tileId}`,
        tileId,
        slug: species.slug,
        name: species.name,
        scaleM: species.scaleM,
        scaleBasis: species.scaleBasis,
        file: species.file,
        diet: species.diet,
        social: species.social,
        posture: species.posture,
        x: dx,
        z: dz,
        y: g.heightAt(dx, dz),
        heading: Math.atan2(-Math.sin(a0), Math.cos(a0)),
        walk: {
          cx: c.x,
          cz: c.z,
          r: walkR,
          speed,
          a: a0,
        },
        dist,
      });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}

/** True when this dino has wandered past the despawn distance. */
export function shouldDespawn(dino, x, z) {
  if (!dino) return true;
  return Math.hypot(dino.x - x, dino.z - z) > DESPAWN_RADIUS_M;
}

/**
 * Advance one dino along its walk circuit by dt seconds. Pure:
 * returns a NEW dino object (input untouched). The heading
 * follows the circuit's tangent, so the body faces where it
 * walks; the ground height is re-read so the animal stays on
 * the ground it stands on.
 */
export function stepDino(dino, dt, ground = terrainGround) {
  const g = ground || terrainGround;
  if (!dino || !dino.walk) return dino;
  const w = dino.walk;
  const step = Math.max(0, Number(dt) || 0);
  const a = w.a + (w.speed / Math.max(1, w.r)) * step;
  const x = w.cx + Math.cos(a) * w.r;
  const z = w.cz + Math.sin(a) * w.r;
  // Tangent of the circuit: (-sin a, cos a) — the walking direction.
  const heading = Math.atan2(-Math.sin(a), Math.cos(a));
  return {
    ...dino,
    x,
    z,
    y: g.heightAt(x, z),
    heading,
    walk: { ...w, a },
  };
}
