// lib/moon.js — THE MOON LANDING + MOON JUMPING (Merlin, Nov 13, 2026).
//
// "If you haven't built the moon and moon jumping yet, do that too."
// The Moon orb already exists in the hub (components/HubMoon.jsx —
// MOON_RADIUS 14, orbit radius 180 about NexusEarth, one orbit every
// 240 s). This module is the NEW part: LANDING on it and WALKING it.
//
// GEOMETRY — every value measured from the code that renders the hub,
// not eyeballed (verified by running lib/hub-layout.js +
// lib/god-orbits.js, Nov 13):
// - EARTH_CENTER = (0, -30, -80); the Moon orbits at horizontal
//   radius 180, lifted +18 above the ecliptic, so its centre is
//   (180·cos a, -12, -80 + 180·sin a) with a = 0.8 - (2π/240)·t.
//   The +18 lift makes the TRUE 3D Earth–Moon distance
//   √(180² + 18²) = 180.90, not 180 — the 180 is the flat-orbit
//   radius. One orbit = 240.0000 s exactly; drift after one orbit
//   is 0; orbital speed = 2π·180/240 = 4.7124 u/s.
// - The Moon's surface is the sphere of radius 14. Its solid
//   collider is radius 15 (MOON_RADIUS + 1, HubMoon). The hub flight
//   resolver rests a free-fly camera at 15 + 1.2 = 16.2 and a bike
//   at 15 + 3 = 18.0. The landing trigger sits at 18.5 — 4.5 above
//   the surface, 3.5 above the collider shell, 0.5 beyond the bike
//   resting distance, 2.3 beyond the fly resting distance — so
//   pressing into the Moon enters, while a fly-by does not.
// - LANDING SITE: the point on the Moon facing Earth most directly
//   that still leaves Earth in the sky, not overhead: direction
//   (0, 1, 0) — the Moon's +Y pole in scene space — which sits
//   exactly 60° from the Earth direction (0, 0.5, -√3/2). The walker
//   spawns 3 m south of the pad (arc distance 3.000 along the
//   surface), facing north toward the pad with Earth 26.0° above
//   the horizon ahead. Earth hangs at the hub's own scene scale:
//   radius 55 at 180 away, angular diameter 2·asin(55/180) = 35.58°.
// - The walker stands ON the sphere: feet |p| = 14 exactly when
//   grounded, camera at feet + up·1.7, up = the surface normal.
//   Walking re-projects onto the sphere every step, so the walker
//   can never fall through or drift off — gravity always pulls
//   back to the surface.
//
// PHYSICS — real Moon gravity, computed, not tuned by feel:
// - MOON_GRAVITY = 1.62 m/s² (real). EARTH_GRAVITY = 9.81 for the
//   comparison readout only.
// - Jump speed 3.0 m/s: apex = v²/2g = 2.7778 m, hang time =
//   2v/g = 3.7037 s. The same jump on Earth: apex 0.4587 m, hang
//   0.6116 s — the Moon jump is 6.0556× floatier on both counts.
// - Walk speed 2.5 m/s: one lap of the Moon (circumference
//   2π·14 = 87.965 u) takes 35.19 s.
//
// ENTRY: the Moon in the hub is the door (sun-base rule — no menu
// entry, nothing half-registered). Click/tap the Moon in freeroam
// or on the bike, or fly into its surface: the hub's existing
// vortex tube (app/page.jsx satTube) carries the user to /moon.
// Return is the page's "← Back to hub" (vortex travel to '/').
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly.

import { MOON_RADIUS, MOON_ORBIT_RADIUS, moonPositionAt } from './hub-layout.js';
import { EARTH_CENTER, EARTH_RADIUS } from './god-orbits.js';

export { MOON_RADIUS, MOON_ORBIT_RADIUS, moonPositionAt };
export { EARTH_CENTER, EARTH_RADIUS };

/** The Moon route — the lunar surface. */
export const MOON_ROUTE = '/moon';

/** Real lunar surface gravity (m/s²). */
export const MOON_GRAVITY = 1.62;
/** Earth gravity, for the comparison readout only — never used in Moon physics. */
export const EARTH_GRAVITY = 9.81;

/** Lunar walking speed (m/s) — an unhurried lunar amble; the bounce is the star. */
export const MOON_WALK_SPEED = 2.5;
/** Jump take-off speed (m/s) — chosen so the arc reads (see jumpApex/jumpHangTime). */
export const MOON_JUMP_SPEED = 3.0;
/** First-person eye height above the feet (m). */
export const MOON_EYE_HEIGHT = 1.7;

/** The Moon's solid collider radius (HubMoon registers MOON_RADIUS + 1). */
export const MOON_COLLIDER_RADIUS = MOON_RADIUS + 1; // 15
/** Where the hub flight resolver rests a free-fly camera (collider + 1.2 rider). */
export const MOON_FLY_REST = MOON_COLLIDER_RADIUS + 1.2; // 16.2
/** Where the hub flight resolver rests a bike (collider + 3 rider). */
export const MOON_BIKE_REST = MOON_COLLIDER_RADIUS + 3; // 18.0
/**
 * LANDING TRIGGER — how close the camera must get to the Moon's
 * centre to count as flying into it. 18.5 = MOON_RADIUS + 4.5:
 * 4.5 above the surface, 3.5 above the collider shell, 0.5 beyond
 * the bike resting distance, 2.3 beyond the fly resting distance.
 */
export const MOON_TRIGGER_RADIUS = MOON_RADIUS + 4.5; // 18.5

/** Direction from the Moon's centre to Earth (unit): 30° above the scene XZ plane. */
export const MOON_EARTH_DIR = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
/** Earth sits at the hub's own scene scale: the orbit radius away. */
export const MOON_EARTH_DISTANCE = MOON_ORBIT_RADIUS; // 180
/** Earth as seen from the Moon: angular diameter 2·asin(55/180) = 35.58°. */
export function moonEarthAngularDiameterDeg() {
  return (2 * Math.asin(EARTH_RADIUS / MOON_ORBIT_RADIUS) * 180) / Math.PI;
}

// CGI (Merlin, Nov 14, 2026): the Moon is a CGI moon now — the
// shared planet module (lib/planet-cgi) paints the surface and
// Earth, and the motion is a pure function of the real clock.
// These constants are the scene's tuning, kept here (pure, node
// testable) so the test suite can pin the exact values the scene
// uses. The physics above is untouched.

/** Earth as seen from the Moon turns slowly on the real clock (rad/s) — one revolution ≈ 5 min. */
export const MOON_EARTH_SPIN_RATE = 0.02;
/** The OLYMPUS label above the flag: a small label, not a billboard (was 0.9 — it filled the spawn screen). */
export const MOON_OLYMPUS_LABEL_SIZE = 0.3;
/** Flag cloth: 1.15 × 0.65 m, 12×6 segments so waveFlag can ripple it, 6 cm wave. */
export const MOON_FLAG_CLOTH = { width: 1.15, height: 0.65, segmentsX: 12, segmentsY: 6, amplitude: 0.06 };
/** Dust motes around the landing site: a 12 × 3.5 × 12 m box, 0.3 m off the ground. */
export const MOON_DUST_FIELD = { count: 160, width: 12, height: 3.5, depth: 12, yBase: 0.3, seed: 'moon-pad', sprite: 'grain' };

// LOOK CONTROLS (Merlin, Nov 15, 2026 — "ease up on the camera
// controls"): drag-to-look was 0.004 rad/px with no damping — a
// small thumb drag whipped the view around (Earth swung right
// across the screen in about a second on his phone). Now 0.0015
// rad/px with an exponential ease toward the drag target, so the
// camera follows instead of snapping. One handler, one
// sensitivity — touch drag and desktop mouse drag get the same
// gentler treatment.
/** Drag-to-look sensitivity, rad per px (was 0.004, hardcoded in the scene). */
export const MOON_LOOK_SENSITIVITY = 0.0015;
/** Exponential ease rate toward the look target (1/s — 95% there in ~0.3 s). */
export const MOON_LOOK_DAMPING_RATE = 10;
/** Look pitch clamp (rad) — unchanged from the old literal. */
export const MOON_LOOK_PITCH_MAX = 1.2;

/**
 * Ease a look angle toward its drag target: current +
 * (target − current)·(1 − e^(−rate·dt)). Pure — node testable.
 * dt = 0 returns current exactly; a long dt lands on the target.
 */
export function dampLookAngle(current, target, dt, rate = MOON_LOOK_DAMPING_RATE) {
  const t = 1 - Math.exp(-rate * Math.max(dt || 0, 0));
  return current + (target - current) * t;
}

/** Landing-site direction (unit): the Moon's +Y pole — exactly 60° from the Earth direction. */
export const MOON_LANDING_DIR = { x: 0, y: 1, z: 0 };
/** Landing-site feet: the pad centre, on the surface exactly (|p| = 14). */
export const MOON_LANDING_FEET = {
  x: MOON_LANDING_DIR.x * MOON_RADIUS,
  y: MOON_LANDING_DIR.y * MOON_RADIUS,
  z: MOON_LANDING_DIR.z * MOON_RADIUS,
};
/** Spawn offset south of the pad along the surface (arc metres). */
export const MOON_SPAWN_OFFSET_M = 3;
/** Spawn feet: 3 m south of the pad along the surface, |p| = 14 exactly. */
export const MOON_SPAWN_FEET = (() => {
  const a = MOON_SPAWN_OFFSET_M / MOON_RADIUS; // arc angle, radians
  // South at the landing site is +Z (north is -Z, toward Earth's azimuth).
  const dx = 0;
  const dy = Math.cos(a);
  const dz = Math.sin(a);
  const len = Math.hypot(dx, dy, dz);
  return { x: (dx / len) * MOON_RADIUS, y: (dy / len) * MOON_RADIUS, z: (dz / len) * MOON_RADIUS };
})();

/** Jump apex height (m) for take-off speed v0 under gravity g: v0²/2g. */
export function jumpApex(v0, g) {
  return (v0 * v0) / (2 * g);
}
/** Jump hang time (s) for take-off speed v0 under gravity g: 2·v0/g. */
export function jumpHangTime(v0, g) {
  return (2 * v0) / g;
}

/** True when a camera point is close enough to the Moon to count as flying into it. */
export function isMoonTriggerPoint(pos, moonCenter) {
  if (!pos || !moonCenter) return false;
  const dx = pos.x - moonCenter.x;
  const dy = pos.y - moonCenter.y;
  const dz = pos.z - moonCenter.z;
  const r = MOON_TRIGGER_RADIUS;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Height of feet above the lunar surface (m) — 0 when grounded. */
export function moonWalkerHeight(feet) {
  return Math.hypot(feet.x, feet.y, feet.z) - MOON_RADIUS;
}

/** Surface normal ("up") at feet — the unit radial direction. */
export function moonSurfaceUp(feet) {
  const r = Math.hypot(feet.x, feet.y, feet.z) || MOON_RADIUS;
  return { x: feet.x / r, y: feet.y / r, z: feet.z / r };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a) {
  const r = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / r, y: a.y / r, z: a.z / r };
}

/**
 * Tangent basis at feet for a camera yaw (radians, 0 = facing north,
 * the -Z azimuth toward Earth). North is world -Z projected onto the
 * tangent plane (world +X when the walker stands at a pole where
 * that projection degenerates — a compass bearing, so it turns at
 * the pole exactly like a real compass does; the walker never slows,
 * the reference just flips). Returns unit { up, forward, right }.
 */
export function moonTangentBasis(feet, yaw) {
  const up = moonSurfaceUp(feet);
  const ref = Math.abs(dot(up, { x: 0, y: 0, z: -1 })) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 };
  const north = norm(sub(ref, scale(up, dot(ref, up))));
  const east = norm(cross(north, up));
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const forward = norm({
    x: north.x * cy + east.x * sy,
    y: north.y * cy + east.y * sy,
    z: north.z * cy + east.z * sy,
  });
  const right = norm(cross(forward, up));
  return { up, forward, right };
}

/** Fresh walker state: standing at the spawn point, grounded, still. */
export function moonLandingState() {
  return { feet: { ...MOON_SPAWN_FEET }, vr: 0, grounded: true };
}

/**
 * One physics step for the lunar walker. Pure — no DOM, no camera.
 *
 * state: { feet: {x,y,z}, vr: radial velocity (m/s, + = up), grounded: bool }
 * input: { fwd, strafe (-1..1 each), jump (bool, edge-triggered by the
 *   caller — held jump does NOT re-trigger), forward, right (unit
 *   tangent vectors from moonTangentBasis) }
 * dt: seconds (clamped to 0.05, the SunBaseScene rule).
 *
 * Grounded: the walker moves along the surface and is re-projected
 * onto the sphere every step, so |feet| stays exactly MOON_RADIUS —
 * no falling through, no drifting off. Airborne: radial velocity
 * falls at MOON_GRAVITY; landing (r <= R) clamps to the surface
 * exactly and re-grounds. Tangential velocity applies in the air
 * too (air control), so a jump keeps its direction.
 */
export function stepMoonWalker(state, input, dt) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const R = MOON_RADIUS;
  const feet = { ...state.feet };
  let vr = state.vr || 0;
  let grounded = !!state.grounded;

  const up = moonSurfaceUp(feet);
  let fwd = input.fwd || 0;
  let strafe = input.strafe || 0;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) {
    fwd /= len;
    strafe /= len;
  }
  const f = input.forward || { x: 0, y: 0, z: -1 };
  const ri = input.right || { x: 1, y: 0, z: 0 };
  const tvx = (f.x * fwd + ri.x * strafe) * MOON_WALK_SPEED;
  const tvy = (f.y * fwd + ri.y * strafe) * MOON_WALK_SPEED;
  const tvz = (f.z * fwd + ri.z * strafe) * MOON_WALK_SPEED;

  if (grounded && input.jump) {
    vr = MOON_JUMP_SPEED;
    grounded = false;
  }
  if (!grounded) {
    vr -= MOON_GRAVITY * dtC;
    feet.x += (tvx + up.x * vr) * dtC;
    feet.y += (tvy + up.y * vr) * dtC;
    feet.z += (tvz + up.z * vr) * dtC;
    const r = Math.hypot(feet.x, feet.y, feet.z);
    if (r <= R) {
      const s = R / (r || R);
      feet.x *= s;
      feet.y *= s;
      feet.z *= s;
      grounded = true;
      vr = 0;
    }
  } else {
    feet.x += tvx * dtC;
    feet.y += tvy * dtC;
    feet.z += tvz * dtC;
    const r = Math.hypot(feet.x, feet.y, feet.z) || R;
    const s = R / r;
    feet.x *= s;
    feet.y *= s;
    feet.z *= s;
  }
  return { feet, vr, grounded };
}

// ── ROCK + PEBBLE PLACEMENTS ──────────────────────────────────────
// Moved here from components/MoonScene.jsx (Nov 15, 2026) verbatim
// — pure + seeded, so node tests can pin them; the scene imports
// them and the landing site looks identical. The global scatter
// below is new (Merlin, Nov 15, 2026 — "jump around the entire
// moon"): the far side was bare grey, so roaming felt like
// nowhere. Same rock shapes, spread over the whole sphere.

function moonLcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Deterministic rocks near the landing site (seeded — same every load). */
export function rockPlacements() {
  let seed = 20261113;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const up = { x: 0, y: 1, z: 0 };
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const az = rnd() * Math.PI * 2;
    const ang = 0.12 + rnd() * 0.45; // 0.12–0.57 rad from the pad (~1.7–8 m away)
    // Direction = landing up rotated by ang around a horizontal axis at azimuth az.
    const axis = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    // Rodrigues: dir = up·cos(ang) + (axis × up)·sin(ang) (axis ⊥ up).
    const cross = { x: axis.y * up.z - axis.z * up.y, y: axis.z * up.x - axis.x * up.z, z: axis.x * up.y - axis.y * up.x };
    const dir = {
      x: up.x * Math.cos(ang) + cross.x * Math.sin(ang),
      y: up.y * Math.cos(ang) + cross.y * Math.sin(ang),
      z: up.z * Math.cos(ang) + cross.z * Math.sin(ang),
    };
    const size = 0.3 + rnd() * 0.9;
    rocks.push({
      pos: { x: dir.x * (MOON_RADIUS - size * 0.3), y: dir.y * (MOON_RADIUS - size * 0.3), z: dir.z * (MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return rocks;
}

/** Small pebbles scattered on and around the pad (seeded — same every load). */
export function pebblePlacements() {
  let seed = 20261114;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const up = { x: 0, y: 1, z: 0 };
  const pebbles = [];
  for (let i = 0; i < 8; i++) {
    const az = rnd() * Math.PI * 2;
    const ang = 0.04 + rnd() * 0.18; // 0.04–0.22 rad from the pad (~0.6–3 m away)
    const axis = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const cross = { x: axis.y * up.z - axis.z * up.y, y: axis.z * up.x - axis.x * up.z, z: axis.x * up.y - axis.y * up.x };
    const dir = {
      x: up.x * Math.cos(ang) + cross.x * Math.sin(ang),
      y: up.y * Math.cos(ang) + cross.y * Math.sin(ang),
      z: up.z * Math.cos(ang) + cross.z * Math.sin(ang),
    };
    const size = 0.05 + rnd() * 0.11;
    pebbles.push({
      pos: { x: dir.x * (MOON_RADIUS - size * 0.3), y: dir.y * (MOON_RADIUS - size * 0.3), z: dir.z * (MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return pebbles;
}

/** Global scatter: how many rocks/pebbles cover the whole sphere. */
export const MOON_GLOBAL_ROCK_COUNT = 40;
export const MOON_GLOBAL_PEBBLE_COUNT = 24;
/** Nothing global lands this close to the pad (rad) — the pad already has its own rocks. */
export const MOON_GLOBAL_EXCLUDE_RAD = 0.6;

// Uniform-over-the-sphere scatter, rejection-sampled away from
// the pad: azimuth uniform, u = cos(polar angle) uniform in
// [−1, 1] (uniform area), skip u > cos(0.6) — too close to the
// pad. Same { pos, size, rot } shape as the local placements.
function scatterOnSphere({ count, seed, minSize, maxSize }) {
  const rnd = moonLcg(seed);
  const excludeCos = Math.cos(MOON_GLOBAL_EXCLUDE_RAD);
  const out = [];
  while (out.length < count) {
    const az = rnd() * Math.PI * 2;
    const u = 2 * rnd() - 1;
    if (u > excludeCos) continue;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const dir = { x: r * Math.cos(az), y: u, z: r * Math.sin(az) };
    const size = minSize + rnd() * (maxSize - minSize);
    out.push({
      pos: { x: dir.x * (MOON_RADIUS - size * 0.3), y: dir.y * (MOON_RADIUS - size * 0.3), z: dir.z * (MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return out;
}

/** Rocks across the WHOLE Moon (seeded — same every load). */
export function globalRockPlacements() {
  return scatterOnSphere({ count: MOON_GLOBAL_ROCK_COUNT, seed: 20261115, minSize: 0.3, maxSize: 1.2 });
}

/** Pebbles across the WHOLE Moon (seeded — same every load). */
export function globalPebblePlacements() {
  return scatterOnSphere({ count: MOON_GLOBAL_PEBBLE_COUNT, seed: 20261116, minSize: 0.05, maxSize: 0.16 });
}
