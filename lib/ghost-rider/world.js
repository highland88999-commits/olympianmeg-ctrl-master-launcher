// lib/ghost-rider/world.js
// GHOST RIDER realm layout — pure data + movement math, no three.js.
//
// A separate 3D realm in Christian hell (Merlin, Nov 15 ~02:39): you
// come here to meet the Ghost Rider. You arrive at the south, walk
// north past the damned field, and the Rider stands waiting in his
// scorched circle. The damned wander the field — the chain's NPC
// targets. One arch walks you back to Hell.
//
// Everything here is deterministic (seeded mulberry32) so node tests
// can assert the layout without a browser or WebGL. Shape mirrors
// lib/hell/world.js (same helpers, same conventions: yaw 0 faces
// north (-Z), forward = (-sin yaw, -cos yaw)).

// WORLD_RADIUS is the HOME-REGION radius: spawn, the portal, the
// Gates, the palace, the regions and the arches all live inside
// it. The world itself is endless (Merlin, Nov 18, 2026) — no
// clamp, no wall, no turn-back; the ground streams past it.
export const WORLD_RADIUS = 260;

// Spawn: at the south, facing north — the Rider waits up ahead.
export const SPAWN = { x: 0, z: 140, yaw: 0 };

// The Rider stands in his scorched circle at the north end.
export const RIDER = { x: 0, z: -60, r: 12 };

// The damned field: damned souls wander here, aimless, between the
// spawn and the Rider.
export const DAMNED_FIELD = { x: 0, z: 40, r: 90 };

// One arch, back to Hell — beside the spawn, west.
export const PORTALS = [
  { key: 'hell', label: 'Back to Hell', route: '/hell', x: -40, z: 120 },
];

export const PORTAL_TRIGGER_RADIUS = 4.5;

export const WALK_SPEED = 8;
export const RUN_SPEED = 14;

// Talk range: how close you must stand to the Rider before he speaks.
export const TALK_RANGE_M = 6;

// The damned: 8 souls, seeded, wandering the field (the population
// rule from the realms: more than one copy, spread out, never a
// single cluster).
export const DAMNED_COUNT = 8;

export const REGIONS = [
  { key: 'rider-circle', name: "The Rider's Circle", x: RIDER.x, z: RIDER.z, r: 25,
    line: 'The air burns. The Rider waits.' },
  { key: 'damned-field', name: 'The Damned Field', x: DAMNED_FIELD.x, z: DAMNED_FIELD.z, r: DAMNED_FIELD.r,
    line: 'The damned wander, going nowhere.' },
];

/** Seeded RNG (mulberry32) — same generator the rest of the repo inlines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Forward vector for a camera yaw (three.js convention: camera looks
 * down -Z at yaw 0, rotation.y = yaw). yaw 0 faces north (-Z).
 */
export function forward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Right vector for a camera yaw. */
export function right(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/**
 * One movement step: apply the delta. The world has no edge any
 * more (Merlin, Nov 18, 2026 — endless), so a step lands where it
 * lands. Returns { x, z, blocked } — this realm has no river, so a
 * step is never blocked.
 */
export function stepPosition(x0, z0, dx, dz) {
  return { x: x0 + dx, z: z0 + dz, blocked: false };
}

/** Plain-English name of the place at (x, z). */
export function regionAt(x, z) {
  for (const r of REGIONS) {
    if (dist2(x, z, r.x, r.z) < r.r) return r.name;
  }
  if (dist2(x, z, SPAWN.x, SPAWN.z) < 25) return 'The Approach';
  return 'Ghost Rider';
}

/** Are you close enough to the Rider to talk? */
export function nearRider(x, z, maxDist = TALK_RANGE_M) {
  return dist2(x, z, RIDER.x, RIDER.z) <= maxDist;
}

/** The portal arch within trigger range of (x, z), or null. */
export function nearestPortal(x, z, maxDist = PORTAL_TRIGGER_RADIUS) {
  let best = null;
  let bestD = maxDist;
  for (const p of PORTALS) {
    const d = dist2(x, z, p.x, p.z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/**
 * The damned souls: { id, x, z, slow } — seeded positions inside the
 * field disc, each with its own slow wander speed. The scene drifts
 * them; the law only places them.
 */
export function makeDamned(seed = 1337) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < DAMNED_COUNT; i += 1) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * (DAMNED_FIELD.r - 8);
    out.push({
      id: `damned-${i}`,
      x: DAMNED_FIELD.x + Math.cos(a) * rr,
      z: DAMNED_FIELD.z + Math.sin(a) * rr,
      slow: 0.3 + rand() * 0.4,
    });
  }
  return out;
}

/** A fresh wander target inside the field disc, for one damned soul. */
export function damnedWanderTarget(rand) {
  const a = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * (DAMNED_FIELD.r - 8);
  return { x: DAMNED_FIELD.x + Math.cos(a) * rr, z: DAMNED_FIELD.z + Math.sin(a) * rr };
}
