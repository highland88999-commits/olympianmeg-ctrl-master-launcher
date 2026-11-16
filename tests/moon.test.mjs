// tests/moon.test.mjs — THE MOON LANDING + MOON JUMPING (Merlin, Nov 13, 2026).
// Every number here is measured from the code that renders the hub —
// run: node --test tests/moon.test.mjs (from the repo root).
// No browser, no network — pure geometry + physics audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOON_ROUTE,
  MOON_GRAVITY,
  EARTH_GRAVITY,
  MOON_WALK_SPEED,
  MOON_JUMP_SPEED,
  MOON_EYE_HEIGHT,
  MOON_COLLIDER_RADIUS,
  MOON_FLY_REST,
  MOON_BIKE_REST,
  MOON_TRIGGER_RADIUS,
  MOON_EARTH_DIR,
  MOON_EARTH_DISTANCE,
  MOON_LANDING_DIR,
  MOON_LANDING_FEET,
  MOON_SPAWN_OFFSET_M,
  MOON_SPAWN_FEET,
  jumpApex,
  jumpHangTime,
  isMoonTriggerPoint,
  moonWalkerHeight,
  moonSurfaceUp,
  moonTangentBasis,
  moonLandingState,
  stepMoonWalker,
  moonEarthAngularDiameterDeg,
  MOON_LOOK_SENSITIVITY,
  MOON_LOOK_DAMPING_RATE,
  MOON_LOOK_PITCH_MAX,
  MOON_GLOBAL_ROCK_COUNT,
  MOON_GLOBAL_PEBBLE_COUNT,
  MOON_GLOBAL_EXCLUDE_RAD,
  dampLookAngle,
  rockPlacements,
  pebblePlacements,
  globalRockPlacements,
  globalPebblePlacements,
} from '../lib/moon.js';
import {
  MOON_RADIUS,
  MOON_ORBIT_RADIUS,
  MOON_ORBIT_SPEED,
  MOON_PHASE0,
  moonPositionAt,
} from '../lib/hub-layout.js';
import { EARTH_CENTER, EARTH_RADIUS } from '../lib/god-orbits.js';

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const vlen = (p) => Math.hypot(p.x, p.y, p.z);
const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// --- 1. The Moon orb is where the hub says it is (unchanged by this build) ---

test('moon orbit geometry is exact: radius 180, period 240 s, centre -12', () => {
  assert.equal(MOON_RADIUS, 14, 'moon radius 14');
  assert.equal(MOON_ORBIT_RADIUS, 180, 'orbit radius 180');
  assert.equal(MOON_PHASE0, 0.8, 'phase 0.8');
  assert.ok(approx((2 * Math.PI) / MOON_ORBIT_SPEED, 240, 1e-9), 'one orbit = 240.0000 s');
  assert.deepEqual(EARTH_CENTER, { x: 0, y: -30, z: -80 }, 'earth centre (0,-30,-80)');
  const p0 = moonPositionAt(0);
  // Horizontal (XZ) distance from Earth centre is exactly the orbit radius.
  const flat = Math.hypot(p0.x - EARTH_CENTER.x, p0.z - EARTH_CENTER.z);
  assert.ok(approx(flat, 180, 1e-9), `flat orbit radius is 180 (got ${flat})`);
  // The +18 lift makes the TRUE 3D distance sqrt(180^2 + 18^2) = 180.8978.
  assert.ok(approx(vlen(vsub(p0, EARTH_CENTER)), Math.sqrt(180 * 180 + 18 * 18), 1e-9), 'true distance 180.8978');
  assert.equal(p0.y, -12, 'moon y = earth y + 18 = -12');
  // After one full orbit the Moon is back where it started: drift 0.
  const p240 = moonPositionAt(240);
  assert.ok(vlen(vsub(p240, p0)) < 1e-9, `no drift after one orbit (got ${vlen(vsub(p240, p0))})`);
  // Orbital speed 2π·180/240 = 4.7124 u/s.
  assert.ok(approx((2 * Math.PI * MOON_ORBIT_RADIUS) / 240, 4.7124, 1e-4), 'orbital speed 4.7124 u/s');
});

// --- 2. Landing trigger: exact gaps, no false entry on a fly-by ---

test('landing trigger sits exactly outside the resting distances', () => {
  assert.equal(MOON_COLLIDER_RADIUS, 15, 'collider radius 15');
  assert.equal(MOON_FLY_REST, 16.2, 'free-fly rests at 16.2');
  assert.equal(MOON_BIKE_REST, 18.0, 'bike rests at 18.0');
  assert.equal(MOON_TRIGGER_RADIUS, 18.5, 'trigger radius 18.5');
  assert.ok(approx(MOON_TRIGGER_RADIUS - MOON_RADIUS, 4.5), '4.5 above the surface');
  assert.ok(approx(MOON_TRIGGER_RADIUS - MOON_COLLIDER_RADIUS, 3.5), '3.5 above the collider shell');
  assert.ok(approx(MOON_TRIGGER_RADIUS - MOON_BIKE_REST, 0.5), '0.5 beyond the bike rest');
  assert.ok(approx(MOON_TRIGGER_RADIUS - MOON_FLY_REST, 2.3), '2.3 beyond the fly rest');
  const c = moonPositionAt(0);
  const at = (d) => ({ x: c.x + d, y: c.y, z: c.z });
  assert.equal(isMoonTriggerPoint(at(18.0), c), true, '18.0 from centre (inside trigger) enters');
  assert.equal(isMoonTriggerPoint(at(19.0), c), false, '19.0 from centre (outside trigger) does not enter');
  assert.equal(isMoonTriggerPoint(at(20.0), c), false, 'a fly-by 6.0 off the surface does not enter');
  assert.equal(isMoonTriggerPoint(null, c), false, 'null position never triggers');
});

// --- 3. Jump arcs are computed from the real 1.62 m/s² ---

test('jump arcs come from real Moon gravity 1.62, not feel', () => {
  assert.equal(MOON_GRAVITY, 1.62, 'Moon gravity is exactly 1.62 m/s²');
  assert.equal(EARTH_GRAVITY, 9.81, 'Earth comparison gravity 9.81');
  assert.equal(MOON_JUMP_SPEED, 3.0, 'take-off speed 3.0 m/s');
  // Apex v²/2g = 9/3.24 = 2.7778 m; hang 2v/g = 6/1.62 = 3.7037 s.
  assert.ok(approx(jumpApex(MOON_JUMP_SPEED, MOON_GRAVITY), 2.7778, 1e-4), 'Moon apex 2.7778 m');
  assert.ok(approx(jumpHangTime(MOON_JUMP_SPEED, MOON_GRAVITY), 3.7037, 1e-4), 'Moon hang 3.7037 s');
  // Same jump on Earth: apex 0.4587 m, hang 0.6116 s — the Moon jump is 6.0556× floatier.
  assert.ok(approx(jumpApex(MOON_JUMP_SPEED, EARTH_GRAVITY), 0.4587, 1e-4), 'Earth apex 0.4587 m');
  assert.ok(approx(jumpHangTime(MOON_JUMP_SPEED, EARTH_GRAVITY), 0.6116, 1e-4), 'Earth hang 0.6116 s');
  const ratio = jumpHangTime(MOON_JUMP_SPEED, MOON_GRAVITY) / jumpHangTime(MOON_JUMP_SPEED, EARTH_GRAVITY);
  assert.ok(approx(ratio, 6.0556, 1e-4), `Moon jump is 6.0556× floatier (got ${ratio})`);
  assert.equal(MOON_WALK_SPEED, 2.5, 'walk speed 2.5 m/s');
  // One lap of the Moon (2π·14 = 87.965 u) at walk speed takes 35.19 s.
  assert.ok(approx((2 * Math.PI * MOON_RADIUS) / MOON_WALK_SPEED, 35.19, 0.01), 'one lap = 35.19 s');
});

// --- 4. Landing site + Earth in the sky: exact directions ---

test('landing site faces Earth with Earth 26° up, feet exactly on the surface', () => {
  assert.deepEqual(MOON_LANDING_DIR, { x: 0, y: 1, z: 0 }, 'landing direction is the +Y pole');
  assert.deepEqual(MOON_LANDING_FEET, { x: 0, y: 14, z: 0 }, 'pad centre is (0, 14, 0)');
  assert.ok(approx(vlen(MOON_LANDING_FEET), MOON_RADIUS, 1e-9), '|pad feet| = 14 exactly');
  // Landing direction sits exactly 60° from the Earth direction.
  const ang = Math.acos(vdot(MOON_LANDING_DIR, MOON_EARTH_DIR));
  assert.ok(approx(ang, Math.PI / 3, 1e-9), 'landing dir is 60° from the Earth dir');
  // Earth direction is a unit vector, 30° above the scene XZ plane.
  assert.ok(approx(vlen(MOON_EARTH_DIR), 1, 1e-9), 'earth dir is unit length');
  assert.equal(MOON_EARTH_DISTANCE, 180, 'earth sits at the orbit radius');
  // Earth elevation from the pad: finite-distance geometry gives 25.99°.
  const earthPos = {
    x: MOON_EARTH_DIR.x * MOON_EARTH_DISTANCE,
    y: MOON_EARTH_DIR.y * MOON_EARTH_DISTANCE,
    z: MOON_EARTH_DIR.z * MOON_EARTH_DISTANCE,
  };
  const toEarth = vsub(earthPos, MOON_LANDING_FEET);
  const up = moonSurfaceUp(MOON_LANDING_FEET);
  const elev = (Math.asin(vdot(norm(toEarth), up)) * 180) / Math.PI;
  assert.ok(approx(elev, 25.99, 0.05), `Earth is 25.99° above the horizon at the pad (got ${elev})`);
  // Earth angular diameter from the Moon: 2·asin(55/180) = 35.58°.
  assert.ok(approx(moonEarthAngularDiameterDeg(), 35.58, 0.01), 'Earth spans 35.58° of sky');
  // Spawn is exactly 3 m along the surface south of the pad, still |p| = 14.
  assert.ok(approx(vlen(MOON_SPAWN_FEET), MOON_RADIUS, 1e-9), '|spawn feet| = 14 exactly');
  const spawnAng = Math.acos(vdot(norm(MOON_SPAWN_FEET), MOON_LANDING_DIR));
  assert.ok(approx(spawnAng, MOON_SPAWN_OFFSET_M / MOON_RADIUS, 1e-9), 'spawn is 3/14 rad from the pad');
  assert.ok(MOON_SPAWN_FEET.z > 0, 'spawn sits south (+Z) of the pad');
  assert.equal(MOON_EYE_HEIGHT, 1.7, 'eye height 1.7 m');
  function norm(p) {
    const r = vlen(p) || 1;
    return { x: p.x / r, y: p.y / r, z: p.z / r };
  }
});

// --- 5. The walker: grounded forever, floaty jumps, never through the floor ---

test('walker stands on the surface, jumps floaty, and always lands back', () => {
  const basis = (s, yaw = 0) => moonTangentBasis(s.feet, yaw);
  let s = moonLandingState();
  assert.equal(s.grounded, true, 'spawns grounded');
  assert.ok(approx(moonWalkerHeight(s.feet), 0, 1e-9), 'spawns at height 0');
  assert.ok(approx(vlen(s.feet), MOON_RADIUS, 1e-9), 'spawn |feet| = 14');
  // Standing still for 5 s: never sinks, never lifts.
  for (let i = 0; i < 300; i++) {
    const b = basis(s);
    s = stepMoonWalker(s, { fwd: 0, strafe: 0, jump: false, forward: b.forward, right: b.right }, 1 / 60);
    assert.ok(approx(vlen(s.feet), MOON_RADIUS, 1e-9), 'standing still keeps |feet| = 14');
    assert.equal(s.grounded, true, 'standing still stays grounded');
  }
  // Jump: measure the arc by stepping at 60 Hz.
  const b0 = basis(s);
  s = stepMoonWalker(s, { fwd: 0, strafe: 0, jump: true, forward: b0.forward, right: b0.right }, 1 / 60);
  assert.equal(s.grounded, false, 'jump leaves the ground');
  let maxH = 0;
  let steps = 0;
  let minR = Infinity;
  while (!s.grounded && steps < 600) {
    const b = basis(s);
    s = stepMoonWalker(s, { fwd: 0, strafe: 0, jump: false, forward: b.forward, right: b.right }, 1 / 60);
    maxH = Math.max(maxH, moonWalkerHeight(s.feet));
    minR = Math.min(minR, vlen(s.feet));
    steps += 1;
  }
  assert.equal(s.grounded, true, 'the jump lands back on the surface');
  assert.ok(approx(maxH, 2.7778, 0.06), `jump apex is 2.7778 m (got ${maxH})`);
  assert.ok(approx((steps * 1) / 60, 3.7037, 0.1), `jump hang is 3.7037 s (got ${steps / 60})`);
  assert.ok(minR >= MOON_RADIUS - 1e-9, 'never below the surface — no falling through');
  // Walking 10 s at full stick: still glued to the surface, ~25 m of path.
  // (Path length, not start-to-end angle: the yaw-0 heading is a compass
  // bearing, and a compass turns at the pole — the walker crosses the
  // -Z pole at ~24.9 m, where north is undefined and the reference flips.)
  let walked = 0;
  let prev = { ...s.feet };
  for (let i = 0; i < 600; i++) {
    const b = basis(s);
    s = stepMoonWalker(s, { fwd: 1, strafe: 0, jump: false, forward: b.forward, right: b.right }, 1 / 60);
    assert.ok(approx(vlen(s.feet), MOON_RADIUS, 1e-9), 'walking keeps |feet| = 14');
    assert.equal(s.grounded, true, 'walking stays grounded');
    walked += Math.acos(Math.min(1, vdot(norm(prev), norm(s.feet)))) * MOON_RADIUS;
    prev = { ...s.feet };
  }
  assert.ok(approx(walked, 25, 0.5), `10 s of walking covers ~25 m of path (got ${walked})`);
  // Jump while walking: keeps moving and still lands.
  const b1 = basis(s);
  s = stepMoonWalker(s, { fwd: 1, strafe: 0, jump: true, forward: b1.forward, right: b1.right }, 1 / 60);
  let air = 0;
  while (!s.grounded && air < 600) {
    const b = basis(s);
    s = stepMoonWalker(s, { fwd: 1, strafe: 0, jump: false, forward: b.forward, right: b.right }, 1 / 60);
    air += 1;
  }
  assert.equal(s.grounded, true, 'jump-while-walking lands too');
  assert.ok(air > 200, 'the moving jump is still floaty (over 3 s airborne)');
  function norm(p) {
    const r = vlen(p) || 1;
    return { x: p.x / r, y: p.y / r, z: p.z / r };
  }
});

test('tangent basis is orthonormal and the route constant is /moon', () => {
  assert.equal(MOON_ROUTE, '/moon', 'moon route is /moon');
  const feet = { x: 0, y: 14, z: 0 };
  const b = moonTangentBasis(feet, 0);
  assert.ok(approx(vlen(b.up), 1, 1e-9), 'up is unit');
  assert.ok(approx(vlen(b.forward), 1, 1e-9), 'forward is unit');
  assert.ok(approx(vlen(b.right), 1, 1e-9), 'right is unit');
  assert.ok(approx(vdot(b.up, b.forward), 0, 1e-9), 'forward is tangent to the surface');
  assert.ok(approx(vdot(b.up, b.right), 0, 1e-9), 'right is tangent to the surface');
  assert.ok(approx(vdot(b.forward, b.right), 0, 1e-9), 'forward and right are perpendicular');
  // Yaw 0 faces north (-Z, toward Earth's azimuth); yaw π/2 faces east (+X).
  assert.ok(approx(b.forward.z, -1, 1e-9), 'yaw 0 faces north (-Z)');
  const bEast = moonTangentBasis(feet, Math.PI / 2);
  assert.ok(approx(bEast.forward.x, 1, 1e-9), 'yaw π/2 faces east (+X)');
});

// --- 6. Roam the whole Moon (Merlin, Nov 15, 2026) ---

test('the walker is not clamped — it can roam the whole Moon, far side included', () => {
  // There is no position clamp, no turn-back wall and no reset in
  // the step: 44 s of walking + jumping covers a full lap of path
  // (circumference 87.965 m) and the walker reaches the far
  // hemisphere — the far side is open ground, not a fence.
  const basis = (s, yaw = 0) => moonTangentBasis(s.feet, yaw);
  let s = moonLandingState();
  const start = { ...s.feet };
  let walked = 0;
  let prev = { ...s.feet };
  let maxAng = 0;
  let minR = Infinity;
  for (let i = 0; i < 2640; i++) {
    const b = basis(s);
    // Jump every 4 s too — roaming means jumping around the Moon, not just walking it.
    s = stepMoonWalker(s, { fwd: 1, strafe: 0, jump: i % 240 === 0, forward: b.forward, right: b.right }, 1 / 60);
    minR = Math.min(minR, vlen(s.feet));
    walked += Math.acos(Math.min(1, vdot(norm(prev), norm(s.feet)))) * MOON_RADIUS;
    prev = { ...s.feet };
    maxAng = Math.max(maxAng, Math.acos(Math.min(1, vdot(norm(s.feet), norm(start)))));
  }
  assert.ok(walked >= 90, `44 s of roaming covers a full lap of path (got ${walked.toFixed(1)} m)`);
  assert.ok(maxAng > Math.PI / 2, `the walker reaches the far hemisphere (max ${(maxAng * 180 / Math.PI).toFixed(1)}° from spawn)`);
  assert.ok(minR >= MOON_RADIUS - 1e-9, 'never below the surface — no falling through');
  assert.equal(s.grounded, true, 'the roam ends grounded');
  function norm(p) {
    const r = vlen(p) || 1;
    return { x: p.x / r, y: p.y / r, z: p.z / r };
  }
});

// --- 7. Gentle camera (Merlin, Nov 15, 2026) ---

test('drag-to-look is gentle: low sensitivity, damped toward the target', () => {
  // Was 0.004 rad/px with no damping — a small thumb drag whipped
  // the view around. Now 0.0015 rad/px with an exponential ease.
  assert.equal(MOON_LOOK_SENSITIVITY, 0.0015, 'look sensitivity is 0.0015 rad/px');
  assert.ok(MOON_LOOK_SENSITIVITY < 0.004, 'gentler than the old 0.004');
  assert.equal(MOON_LOOK_PITCH_MAX, 1.2, 'pitch clamp is still ±1.2 rad');
  assert.equal(MOON_LOOK_DAMPING_RATE, 10, 'damping rate is 10/s');
  // The ease: after 0.1 s at rate 10 the angle is 1−e^−1 ≈ 63% of
  // the way to the target; after 0.5 s it is 99% there.
  assert.ok(approx(dampLookAngle(0, 1, 0.1), 1 - Math.exp(-1), 1e-9), '0.1 s covers 63% of the gap');
  assert.ok(approx(dampLookAngle(0, 1, 0.5), 1 - Math.exp(-5), 1e-9), '0.5 s covers 99% of the gap');
  assert.equal(dampLookAngle(0.7, 0.7, 0.1), 0.7, 'no gap, no movement');
  assert.equal(dampLookAngle(0.7, 1.5, 0), 0.7, 'dt 0 returns current exactly');
  assert.ok(approx(dampLookAngle(-1, 1, 10), 1, 1e-9), 'a long dt lands on the target');
});

// --- 8. The whole Moon has ground features (Merlin, Nov 15, 2026) ---

test('rocks and pebbles cover the whole Moon — the far side is not bare', () => {
  // The landing-site scatter is untouched (same seeds, same counts,
  // same ranges — the pad looks identical).
  const rocks = rockPlacements();
  assert.equal(rocks.length, 16, '16 rocks at the pad');
  for (const rock of rocks) {
    assert.ok(approx(vlen(rock.pos), MOON_RADIUS - rock.size * 0.3, 1e-9), 'pad rock sits on the surface');
    const ang = Math.acos(Math.min(1, rock.pos.y / vlen(rock.pos)));
    assert.ok(ang <= 0.57 + 1e-9, 'pad rocks stay within 0.57 rad of the pad');
  }
  const pebbles = pebblePlacements();
  assert.equal(pebbles.length, 8, '8 pebbles at the pad');
  // The global scatter fills the rest of the sphere: on the
  // surface, deterministic, nothing near the pad (it has its own),
  // and rocks in the far hemisphere — roaming has ground features
  // everywhere, not just at the landing site.
  const gRocks = globalRockPlacements();
  assert.equal(gRocks.length, MOON_GLOBAL_ROCK_COUNT, `${MOON_GLOBAL_ROCK_COUNT} rocks across the Moon`);
  assert.deepEqual(gRocks, globalRockPlacements(), 'the global scatter is deterministic');
  let farRocks = 0;
  for (const rock of gRocks) {
    assert.ok(approx(vlen(rock.pos), MOON_RADIUS - rock.size * 0.3, 1e-9), 'global rock sits on the surface');
    assert.ok(rock.size >= 0.3 && rock.size <= 1.2, 'global rock size in range');
    const ang = Math.acos(Math.min(1, rock.pos.y / vlen(rock.pos)));
    assert.ok(ang >= MOON_GLOBAL_EXCLUDE_RAD - 1e-9, 'no global rock lands on the pad');
    if (ang > Math.PI / 2) farRocks += 1;
  }
  assert.ok(farRocks > 0, `rocks reach the far hemisphere (${farRocks} past 90° from the pad)`);
  const gPebbles = globalPebblePlacements();
  assert.equal(gPebbles.length, MOON_GLOBAL_PEBBLE_COUNT, `${MOON_GLOBAL_PEBBLE_COUNT} pebbles across the Moon`);
  assert.deepEqual(gPebbles, globalPebblePlacements(), 'the global pebbles are deterministic');
  for (const peb of gPebbles) {
    assert.ok(approx(vlen(peb.pos), MOON_RADIUS - peb.size * 0.3, 1e-9), 'global pebble sits on the surface');
    const ang = Math.acos(Math.min(1, peb.pos.y / vlen(peb.pos)));
    assert.ok(ang >= MOON_GLOBAL_EXCLUDE_RAD - 1e-9, 'no global pebble lands on the pad');
  }
});
