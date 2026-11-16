// lib/jupiter2/planet.js — JUPITER 2 AS A FULL PLANET (Merlin,
// Nov 16 ~00:02: "I want a full planet here").
//
// The old Jupiter 2 was a flat disc (MOVE_R = 88) with a hard edge:
// walk 88 m from spawn and the world stopped. It is now a walkable
// SPHERE of radius 88 — the same number as the old disc, so the
// deck you could see before is the same size, but it never ends:
// walk far enough in any direction and you come back around.
//
// THE GEOGRAPHY (all of it a pure function of direction — the
// walker, the speeder, the creatures and the tests all read the
// same law):
//   * THE DECK CAP — the visible map: the cap around the spawn
//     pole (+Y), out to 1.0 rad of surface (88 m — exactly the
//     old disc edge). Ground radius 88 + the old seeded deck
//     undulation (±1.2 m, the same fbm groundHeight has always
//     returned, so the deck under your feet does not change).
//   * THE DROP — at the cap edge (1.0 rad) the deck ends in a
//     CLIFF: 14 m straight down to the sub-level shelf. Walk off
//     it and you FALL (real Jupiter gravity, ~1.1 s) onto the
//     shelf. The cliff face is a wall: walking into it from below
//     stops you — there is no walking up a 14 m cliff.
//   * THE RAMP — one sector of the edge, due north (azimuth 0,
//     the direction you face from spawn), is a walkable causeway,
//     not a cliff: the ground eases 88 → 74 over ~22 m of surface.
//     It is the way back up, both on foot and on the speeder.
//   * THE SUB-LEVEL — everything past the drop edge is a second
//     world at radius 74, wrapping the whole far side of the
//     planet. It never ends either: walk past the mountain and the
//     rest of the gas giant opens for exploration.
//   * THE MOUNTAIN — on the shelf, due north past the drop
//     (1.35 rad from spawn, ~31 m past the edge), a rock mass
//     rising ~18 m. A passage corridor runs through it along
//     azimuth 0 — the cave mouth faces back toward the drop, so
//     the walker coming down sees the mountain and the mouth
//     ahead of them.
//   * THE CAVE + THE LEVER — inside the mountain, at the back of
//     the passage (1.30 rad from spawn): the oblivion lever, moved
//     from its old deck spot (18, −24). The green beacon (60 m,
//     the lever's own) rises from the cave mouth so it reads from
//     the deck through the storm. The warning + explicit confirm
//     gate is untouched (lib/jupiter2/lever.js) — this is a
//     relocation, never a destruction, and the lever stays armed,
//     never destroyed.
//
// NUMBERS THAT ARE THE WORKER'S CALL (Merlin ordered the drop,
// the mountain, the cave and the full planet, not the metres):
// drop depth 14 m, drop edge 1.0 rad (88 m surface — the old
// world edge, so "the end of the map that you can see" is the
// same distance it always was), ramp half-width 0.25 rad,
// mountain centre 1.35 rad, mountain height ~18 m, passage
// corridor half-width 0.06 rad. All pinned in tests.
//
// The walker step here wraps the SHARED gravity core
// (radialVelocityStep + sphereTangentBasis from
// lib/planet-walker.js — Jupiter gravity 24.79, same 3.0 m/s
// take-off) with a VARIABLE ground radius: the shared
// stepSphereWalker takes a fixed radius, and this planet does
// not have one. The flat deck coordinates (x, z) the speeder
// and the old tests use map onto the sphere by surface distance:
// a deck point's distance from spawn IS its surface distance
// from the pole, so every old (x, z) still means the same walk.
//
// Pure: no DOM, no React, no THREE — node tests drive this module.

import { radialVelocityStep, sphereTangentBasis, sphereSurfaceUp } from '../planet-walker.js';
import { groundHeight, JUPITER2_SPHERE_R } from './profile.js';

/** Sphere radius (m) — the same 88 as the old disc, so the deck cap keeps its scale. */
export const PLANET_R = JUPITER2_SPHERE_R;
/** Radius of the sub-level shelf (m) — 14 m below the deck. */
export const SHELF_R = PLANET_R - 14;
/** The drop: 14 m from deck to shelf (worker's call). */
export const DROP_DEPTH_M = 14;
/** The drop edge: 1.0 rad of surface from the spawn pole (88 m — the old world edge). */
export const DROP_EDGE_RAD = 1.0;
/** Cliff transition half-width (rad) — the cliff is a knife edge (~0.7 m of surface), so a walker stepping off it goes airborne and FALLS (the drop is a drop, not a steep slope); the ground mesh smooths it into a scarp visually. */
export const CLIFF_HALF_RAD = 0.008;
/** The ramp: due north (azimuth 0), half-width 0.25 rad either side. */
export const RAMP_AZIMUTH = 0;
export const RAMP_HALF_WIDTH_RAD = 0.25;
/** The ramp eases 88 → 74 over this surface band (rad from the pole). */
export const RAMP_IN_RAD = 0.9;
export const RAMP_OUT_RAD = 1.15;
/** The mountain: centre 1.45 rad from spawn, due north, ~18 m high, ~19 m across. */
export const MOUNTAIN_THETA_RAD = 1.45;
export const MOUNTAIN_AZIMUTH = 0;
export const MOUNTAIN_HEIGHT_M = 18;
export const MOUNTAIN_RADIUS_RAD = 0.22;
/** The cave passage through the mountain: half-width 0.06 rad around azimuth 0. */
export const CAVE_CORRIDOR_HALF_RAD = 0.06;
/** The cave passage runs from the mouth (1.25 rad) through the mountain (1.57 rad). */
export const CAVE_MOUTH_THETA_RAD = 1.25;
export const CAVE_BACK_THETA_RAD = 1.57;
/** The ground stays at shelf level through the passage approach (1.23 rad) to the back (1.57 rad). */
export const CAVE_CORRIDOR_IN_RAD = 1.23;
export const CAVE_CORRIDOR_OUT_RAD = 1.57;
/** The lever stands inside the cave, 1.40 rad from spawn, due north. */
export const LEVER_CAVE_THETA_RAD = 1.40;
export const LEVER_CAVE_AZIMUTH = 0;
/** A one-step radius change bigger than this (m) is a wall or a cliff, never a slope. */
export const STEP_WALL_M = 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function norm3(p) {
  const r = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / r, y: p.y / r, z: p.z / r };
}

/**
 * Direction (unit) for a deck point (x, z): the deck distance from
 * spawn IS the surface distance from the pole (θ = r / R), and the
 * azimuth is measured from north (−Z) toward east (+X), so deck
 * north (−z) is azimuth 0 and the flat yaw-0 heading still faces
 * north on the sphere.
 */
export function deckToDir(x, z) {
  const r = Math.hypot(x, z);
  const theta = r / PLANET_R;
  const alpha = Math.atan2(x, -z);
  const s = Math.sin(theta);
  return {
    x: s * Math.sin(alpha),
    y: Math.cos(theta),
    z: -s * Math.cos(alpha),
  };
}

/** Deck coordinates (x, z) for a direction: the inverse of deckToDir. */
export function dirToDeck(dir) {
  const d = norm3(dir);
  const theta = Math.acos(clamp(d.y, -1, 1));
  const alpha = Math.atan2(d.x, -d.z);
  const r = theta * PLANET_R;
  return { x: r * Math.sin(alpha), z: -r * Math.cos(alpha) };
}

/** Angular distance (rad) of a direction from the spawn pole (+Y). */
export function thetaFromPole(dir) {
  return Math.acos(clamp(norm3(dir).y, -1, 1));
}

/** Azimuth (rad) of a direction, 0 = north (−Z), positive toward east (+X). */
export function azimuthOf(dir) {
  const d = norm3(dir);
  return Math.atan2(d.x, -d.z);
}

function azimuthDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The base ground radius (m) at a direction, WITHOUT the deck
 * undulation: 88 on the deck cap, 74 on the shelf, a cliff at
 * the edge except for the north ramp (a smooth ease), and the
 * mountain bump on the shelf outside the cave corridor.
 */
export function baseRadiusAt(dir) {
  const d = norm3(dir);
  const theta = thetaFromPole(d);
  const alpha = azimuthOf(d);
  const onRamp = azimuthDiff(alpha, RAMP_AZIMUTH) <= RAMP_HALF_WIDTH_RAD;
  let base;
  if (onRamp) {
    // The causeway: a smooth ease 88 → 74 across the ramp band.
    base = PLANET_R - DROP_DEPTH_M * smoothstep(RAMP_IN_RAD, RAMP_OUT_RAD, theta);
  } else if (theta <= DROP_EDGE_RAD - CLIFF_HALF_RAD) {
    base = PLANET_R;
  } else if (theta >= DROP_EDGE_RAD + CLIFF_HALF_RAD) {
    base = SHELF_R;
  } else {
    // The cliff face itself: the radius steps across it.
    const t = (theta - (DROP_EDGE_RAD - CLIFF_HALF_RAD)) / (2 * CLIFF_HALF_RAD);
    base = PLANET_R - DROP_DEPTH_M * t;
  }
  // The mountain: a smooth bump on the shelf, due north past the
  // drop — except inside the cave corridor, where the passage
  // stays at shelf level so the walker can walk through to the
  // lever.
  if (theta > DROP_EDGE_RAD + CLIFF_HALF_RAD) {
    const inCorridor = azimuthDiff(alpha, MOUNTAIN_AZIMUTH) <= CAVE_CORRIDOR_HALF_RAD
      && theta >= CAVE_CORRIDOR_IN_RAD && theta <= CAVE_CORRIDOR_OUT_RAD;
    if (!inCorridor) {
      const dTheta = theta - MOUNTAIN_THETA_RAD;
      const dAlpha = azimuthDiff(alpha, MOUNTAIN_AZIMUTH);
      const dist = Math.hypot(dTheta, dAlpha);
      if (dist < MOUNTAIN_RADIUS_RAD) {
        const f = 0.5 + 0.5 * Math.cos((dist / MOUNTAIN_RADIUS_RAD) * Math.PI);
        base += MOUNTAIN_HEIGHT_M * f;
      }
    }
  }
  return base;
}

/**
 * The ground radius (m) at a direction: the base radius plus the
 * deck's own seeded undulation (±1.2 m — the same fbm the flat
 * groundHeight has always returned, sampled at the direction's
 * deck coordinates, so the deck under your feet does not change).
 */
export function groundRadiusAt(dir) {
  const deck = dirToDeck(dir);
  return baseRadiusAt(dir) + groundHeight(deck.x, deck.z);
}

/** The 3D ground point under a direction: the direction at its ground radius. */
export function groundPointAt(dir) {
  const d = norm3(dir);
  const r = groundRadiusAt(d);
  return { x: d.x * r, y: d.y * r, z: d.z * r };
}

/** The 3D ground point for a deck point (x, z) — the speeder + creature mapping. */
export function spherePointFromDeck(x, z) {
  return groundPointAt(deckToDir(x, z));
}

/** True when a direction stands on the deck cap (inside the drop edge). */
export function isOnDeck(dir) {
  return thetaFromPole(dir) < DROP_EDGE_RAD;
}

/** True when a direction stands on the sub-level shelf (past the drop edge). */
export function isOnShelf(dir) {
  return thetaFromPole(dir) >= DROP_EDGE_RAD;
}

/** True when a direction is inside the mountain (the bump, outside the corridor). */
export function isOnMountain(dir) {
  const d = norm3(dir);
  const theta = thetaFromPole(d);
  const alpha = azimuthOf(d);
  if (theta <= DROP_EDGE_RAD + CLIFF_HALF_RAD) return false;
  const inCorridor = azimuthDiff(alpha, MOUNTAIN_AZIMUTH) <= CAVE_CORRIDOR_HALF_RAD
    && theta >= CAVE_CORRIDOR_IN_RAD && theta <= CAVE_CORRIDOR_OUT_RAD;
  if (inCorridor) return false;
  const dist = Math.hypot(theta - MOUNTAIN_THETA_RAD, azimuthDiff(alpha, MOUNTAIN_AZIMUTH));
  return dist < MOUNTAIN_RADIUS_RAD;
}

/** True when a direction is inside the cave passage (the corridor through the mountain). */
export function isInCave(dir) {
  const d = norm3(dir);
  const theta = thetaFromPole(d);
  const alpha = azimuthOf(d);
  return azimuthDiff(alpha, MOUNTAIN_AZIMUTH) <= CAVE_CORRIDOR_HALF_RAD
    && theta >= CAVE_MOUTH_THETA_RAD && theta <= CAVE_BACK_THETA_RAD;
}

/** Direction (unit) at an angular distance + azimuth from the spawn pole. */
export function dirAt(theta, alpha) {
  const s = Math.sin(theta);
  return { x: s * Math.sin(alpha), y: Math.cos(theta), z: -s * Math.cos(alpha) };
}

/** The lever's place, inside the cave (3D point on the shelf floor). */
export function leverCavePoint() {
  return groundPointAt(dirAt(LEVER_CAVE_THETA_RAD, LEVER_CAVE_AZIMUTH));
}

/** The cave mouth, where the green beacon rises (3D point on the shelf floor). */
export function leverCaveMouthPoint() {
  return groundPointAt(dirAt(CAVE_MOUTH_THETA_RAD, MOUNTAIN_AZIMUTH));
}

/** The spawn point: the old deck spawn (10, 26) mapped onto the sphere. */
export function spawnPoint() {
  return spherePointFromDeck(10, 26);
}

// ── the sphere walker (variable ground radius) ────────────────────
// The shared stepSphereWalker takes a FIXED radius; this planet
// has two (88 deck, 74 shelf) plus a mountain. This step wraps the
// same shared core (radialVelocityStep + sphereTangentBasis,
// Jupiter gravity 24.79, take-off 3.0) with the ground radius read
// at the walker's direction every step:
//   * grounded, gentle slope (≤ 2 m a step): the feet re-project
//     onto the new ground radius — walking up the ramp, over the
//     mountain, down the deck swells.
//   * grounded, ground falls away > 2 m (walked off the cliff):
//     the walker goes AIRBORNE and falls under real gravity until
//     the shelf catches them (~1.1 s for the 14 m drop).
//   * grounded, ground rises > 2 m (walked into the cliff face
//     from below): the step is BLOCKED — a wall, not a staircase.
//   * airborne: radial velocity falls at Jupiter gravity; landing
//     (r ≤ ground radius) clamps to the surface and re-grounds.

/**
 * One physics step for the Jupiter 2 sphere walker.
 * state: { feet: {x,y,z}, vr, grounded }
 * input: { fwd, strafe (-1..1), jump (edge-triggered), yaw }
 * planet: { gravity, walkSpeed, jumpSpeed } — planetParams('jupiter').
 * Returns { feet, vr, grounded }.
 */
export function stepJupiter2Walker(state, input, dt, planet) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const feet = { ...state.feet };
  let grounded = !!state.grounded;

  const up = sphereSurfaceUp(feet, PLANET_R);
  const basis = sphereTangentBasis(feet, input.yaw || 0, PLANET_R);
  let fwd = input.fwd || 0;
  let strafe = input.strafe || 0;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) {
    fwd /= len;
    strafe /= len;
  }
  const tvx = (basis.forward.x * fwd + basis.right.x * strafe) * planet.walkSpeed;
  const tvy = (basis.forward.y * fwd + basis.right.y * strafe) * planet.walkSpeed;
  const tvz = (basis.forward.z * fwd + basis.right.z * strafe) * planet.walkSpeed;

  const step = radialVelocityStep(state.vr || 0, planet.gravity, planet.jumpSpeed, !!input.jump, grounded, dtC);
  let vr = step.vy;
  grounded = step.grounded;

  const rNow = Math.hypot(feet.x, feet.y, feet.z);
  if (!grounded) {
    feet.x += (tvx + up.x * vr) * dtC;
    feet.y += (tvy + up.y * vr) * dtC;
    feet.z += (tvz + up.z * vr) * dtC;
    const groundR = groundRadiusAt(feet);
    const r = Math.hypot(feet.x, feet.y, feet.z);
    if (r <= groundR) {
      const s = groundR / (r || groundR);
      feet.x *= s;
      feet.y *= s;
      feet.z *= s;
      grounded = true;
      vr = 0;
    }
  } else {
    const nx = feet.x + tvx * dtC;
    const ny = feet.y + tvy * dtC;
    const nz = feet.z + tvz * dtC;
    const newGroundR = groundRadiusAt({ x: nx, y: ny, z: nz });
    const drop = rNow - newGroundR;
    if (drop > STEP_WALL_M) {
      // Walked off the cliff: go airborne and fall — do not teleport down.
      grounded = false;
      vr = 0;
    } else if (newGroundR - rNow > STEP_WALL_M) {
      // Walked into the cliff face from below: blocked, stay put.
    } else {
      const r = Math.hypot(nx, ny, nz) || newGroundR;
      const s = newGroundR / r;
      feet.x = nx * s;
      feet.y = ny * s;
      feet.z = nz * s;
    }
  }
  return { feet, vr, grounded };
}

/**
 * Points of the aura ring around a monster: a circle of surface
 * distance `radiusM` around the monster's direction, hugging the
 * sphere (a flat ring would sink up to ~19 m below the surface at
 * 59 m on an 88 m sphere). Returns [{x, y, z}, …] for a line loop.
 */export function auraRingPoints(centerDir, radiusM, segments = 48) {
  const c = norm3(centerDir);
  const ang = radiusM / PLANET_R;
  // An orthonormal basis around c: pick a reference not parallel to c.
  const ref = Math.abs(c.y) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const dot = c.x * ref.x + c.y * ref.y + c.z * ref.z;
  const t1 = norm3({ x: ref.x - c.x * dot, y: ref.y - c.y * dot, z: ref.z - c.z * dot });
  const t2 = norm3({
    x: c.y * t1.z - c.z * t1.y,
    y: c.z * t1.x - c.x * t1.z,
    z: c.x * t1.y - c.y * t1.x,
  });
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const dir = {
      x: c.x * Math.cos(ang) + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * Math.sin(ang),
      y: c.y * Math.cos(ang) + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * Math.sin(ang),
      z: c.z * Math.cos(ang) + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * Math.sin(ang),
    };
    const p = groundPointAt(dir);
    // Lift the ring a touch off the ground so it reads over the swells.
    const r = Math.hypot(p.x, p.y, p.z) + 0.35;
    const s = r / (Math.hypot(p.x, p.y, p.z) || r);
    out.push({ x: p.x * s, y: p.y * s, z: p.z * s });
  }
  return out;
}

/**
 * One step of a creature walking the sphere toward a target: move
 * along the tangent toward the target at speedMps, then re-project
 * onto the ground radius at the new direction. The step is capped
 * so a creature never overshoots its target in one frame.
 */
export function moveOnSphere(pos, target, speedMps, dt) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return { ...pos };
  const stepLen = Math.min(speedMps * dtC, dist);
  const nx = pos.x + (dx / dist) * stepLen;
  const ny = pos.y + (dy / dist) * stepLen;
  const nz = pos.z + (dz / dist) * stepLen;
  // Project onto the tangent plane (drop the radial component),
  // then re-project onto the ground — the creature walks the
  // surface, it never cuts through the planet or floats off it.
  const up = norm3(pos);
  const along = (nx - pos.x) * up.x + (ny - pos.y) * up.y + (nz - pos.z) * up.z;
  const tx = nx - up.x * along;
  const ty = ny - up.y * along;
  const tz = nz - up.z * along;
  const tr = Math.hypot(tx, ty, tz);
  if (tr < 0.001) return { ...pos };
  const groundR = groundRadiusAt({ x: tx / tr, y: ty / tr, z: tz / tr });
  // Keep the travelled distance: rescale the tangent step to the
  // ground radius at the new direction.
  const s = groundR / tr;
  return { x: tx * s, y: ty * s, z: tz * s };
}
