// tests/planet-walker.test.mjs — PLANET-HOPPING (Merlin, Nov 15, 2026).
//
// "Yes — let me jump around Earth too" + "When you're on the moon...
// you literally jump to the earth, then jump around different
// [planets], vice versa?" + "Same gravity logic as the moon... and
// any other planet too."
//
// One walker, every planet: the Moon's physics generalised — same
// 3.0 m/s take-off under each planet's OWN real gravity, so the
// same jump reads differently everywhere. Run:
// node --test tests/planet-walker.test.mjs (from the repo root).
// No browser, no network — pure physics + source audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANET_GRAVITY,
  PLANET_JUMP_SPEED,
  PLANET_WALK_SPEED,
  PLANET_RADIUS,
  PLANET_EYE_HEIGHT,
  planetParams,
  jumpApex,
  jumpHangTime,
  planetJump,
  LOOK_FULL_SWIPE_TURN,
  lookTurnForDrag,
  LOOK_DAMPING_RATE,
  LOOK_PITCH_MAX,
  dampLookAngle,
  LOOK_RECENTER_RATE,
  wrapAngle,
  lookOffsetFromHeading,
  recenterLookOffset,
  radialVelocityStep,
  sphereSurfaceUp,
  sphereTangentBasis,
  stepSphereWalker,
  stepFlatWalker,
  scatterSpherePlacements,
} from '../lib/planet-walker.js';
import {
  EARTH_WALK_ROUTE,
  EARTH_WALK_PLANET,
  EARTH_WALK_SPAWN_FEET,
  EARTH_WALK_MOON_RADIUS,
  EARTH_WALK_MOON_DISTANCE,
  earthWalkMoonAngularDiameterDeg,
  earthWalkLandingState,
  earthWalkRockPlacements,
  earthWalkPebblePlacements,
  EARTH_WALK_ROCK_COUNT,
  EARTH_WALK_PEBBLE_COUNT,
  EARTH_WALK_EXCLUDE_RAD,
} from '../lib/earth-walk.js';
import { MOON_RADIUS } from '../lib/hub-layout.js';
import { EARTH_RADIUS } from '../lib/god-orbits.js';
import {
  moonTangentBasis,
  moonLandingState,
  stepMoonWalker,
} from '../lib/moon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const vlen = (p) => Math.hypot(p.x, p.y, p.z);

// --- 1. Real gravity per planet, one take-off speed ---------------------

test('planet gravity table is the real surface gravity, one shared take-off', () => {
  assert.equal(PLANET_GRAVITY.moon, 1.62, 'Moon 1.62');
  assert.equal(PLANET_GRAVITY.earth, 9.81, 'Earth 9.81');
  assert.equal(PLANET_GRAVITY.mars, 3.71, 'Mars 3.71');
  assert.equal(PLANET_GRAVITY.jupiter, 24.79, 'Jupiter 24.79');
  assert.equal(PLANET_JUMP_SPEED, 3.0, 'same 3.0 m/s take-off everywhere');
  assert.equal(PLANET_EYE_HEIGHT, 1.7, 'eye 1.7 m everywhere');
  assert.deepEqual(
    { moon: PLANET_WALK_SPEED.moon, earth: PLANET_WALK_SPEED.earth, mars: PLANET_WALK_SPEED.mars, jupiter: PLANET_WALK_SPEED.jupiter },
    { moon: 2.5, earth: 6, mars: 3, jupiter: 6 },
    'each world keeps its own walk speed'
  );
  assert.equal(PLANET_RADIUS.moon, MOON_RADIUS, 'Moon sphere radius 14');
  assert.equal(PLANET_RADIUS.earth, EARTH_RADIUS, 'Earth sphere radius 55');
  assert.equal(PLANET_RADIUS.mars, undefined, 'Mars is a flat disc, no sphere radius');
  assert.equal(PLANET_RADIUS.jupiter, undefined, 'Jupiter is a flat disc, no sphere radius');
});

// --- 2. The same jump reads differently on every planet -----------------

test('jump apex + hang per planet at the shared 3.0 m/s take-off', () => {
  const cases = [
    // planet, apex m, hang s — v0²/2g and 2v0/g, computed, not tuned.
    ['moon', 2.7778, 3.7037],
    ['earth', 0.4587, 0.6116],
    ['mars', 1.2129, 1.6173],
    ['jupiter', 0.1815, 0.2420],
  ];
  for (const [key, apex, hang] of cases) {
    const got = planetJump(key);
    assert.ok(approx(got.apex, apex, 0.0005), `${key} apex ${got.apex} ≈ ${apex}`);
    assert.ok(approx(got.hang, hang, 0.0005), `${key} hang ${got.hang} ≈ ${hang}`);
    assert.ok(approx(jumpApex(PLANET_JUMP_SPEED, PLANET_GRAVITY[key]), apex, 0.0005), `${key} jumpApex agrees`);
    assert.ok(approx(jumpHangTime(PLANET_JUMP_SPEED, PLANET_GRAVITY[key]), hang, 0.0005), `${key} jumpHangTime agrees`);
  }
  // Jupiter's jump is barely a hop — honest real gravity, NOT buffed.
  assert.ok(planetJump('jupiter').apex < 0.2, 'Jupiter apex under 0.2 m');
  assert.ok(planetJump('moon').apex > 6 * planetJump('earth').apex, 'Moon jump is 6.06× Earth\'s');
});

// --- 3. The shared gravity core ------------------------------------------

test('radialVelocityStep: take-off, gravity pull, grounded stays put', () => {
  // Grounded + jump: take off at the shared speed, airborne. (dt = 0
  // pins the take-off itself; a real step also integrates one dt of
  // gravity, exactly like the Moon's old step did.)
  let s = radialVelocityStep(0, 1.62, 3.0, true, true, 0);
  assert.equal(s.vy, 3.0, 'take-off at 3.0 m/s');
  assert.equal(s.grounded, false, 'airborne after take-off');
  s = radialVelocityStep(0, 1.62, 3.0, true, true, 0.016);
  assert.ok(approx(s.vy, 3.0 - 1.62 * 0.016, 1e-9), 'take-off step also pulls one dt of gravity');
  // Airborne, no jump: gravity pulls the velocity down by g·dt.
  s = radialVelocityStep(3.0, 1.62, 3.0, false, false, 0.016);
  assert.ok(approx(s.vy, 3.0 - 1.62 * 0.016, 1e-9), 'gravity pulls vy down');
  assert.equal(s.grounded, false, 'still airborne');
  // Grounded, no jump: velocity stays 0.
  s = radialVelocityStep(0, 9.81, 3.0, false, true, 0.016);
  assert.equal(s.vy, 0, 'grounded velocity stays 0');
  assert.equal(s.grounded, true, 'stays grounded');
  // dt clamps to 0.05 (the SunBaseScene rule).
  s = radialVelocityStep(3.0, 9.81, 3.0, false, false, 1.0);
  assert.ok(approx(s.vy, 3.0 - 9.81 * 0.05, 1e-9), 'dt clamps to 0.05');
});

// --- 4. Sphere walker: Moon + Earth, on the sphere, jump arcs match -----

function sphereJumpArc(planet, spawnFeet) {
  const dt = 0.005;
  let state = { feet: { ...spawnFeet }, vr: 0, grounded: true };
  let maxH = 0;
  let steps = 0;
  let jumped = false;
  while (steps < 20000) {
    const { forward, right } = sphereTangentBasis(state.feet, 0, planet.radius);
    const jump = !jumped;
    state = stepSphereWalker(state, { fwd: 0, strafe: 0, jump, forward, right }, dt, planet);
    jumped = true;
    maxH = Math.max(maxH, vlen(state.feet) - planet.radius);
    steps += 1;
    if (jumped && state.grounded && steps > 1) break;
  }
  return { apex: maxH, hang: steps * dt, steps };
}

test('sphere walker stays on the sphere on a 40 s roam, Moon and Earth', () => {
  for (const key of ['moon', 'earth']) {
    const planet = planetParams(key);
    const spawn = key === 'moon'
      ? { x: 0, y: Math.cos(3 / 14) * 14, z: Math.sin(3 / 14) * 14 }
      : { ...EARTH_WALK_SPAWN_FEET };
    let state = { feet: { ...spawn }, vr: 0, grounded: true };
    const dt = 1 / 60;
    for (let i = 0; i < 40 * 60; i++) {
      const { forward, right } = sphereTangentBasis(state.feet, 0, planet.radius);
      state = stepSphereWalker(state, { fwd: 1, strafe: 0, jump: false, forward, right }, dt, planet);
      assert.ok(approx(vlen(state.feet), planet.radius, 1e-9), `${key} |feet| stays ${planet.radius} (got ${vlen(state.feet)})`);
    }
    assert.equal(state.grounded, true, `${key} still grounded after the roam`);
  }
});

test('sphere jump arcs match the table: Moon floats, Earth hops', () => {
  const moon = sphereJumpArc(planetParams('moon'), { x: 0, y: Math.cos(3 / 14) * 14, z: Math.sin(3 / 14) * 14 });
  assert.ok(approx(moon.apex, 2.7778, 0.03), `Moon apex ${moon.apex} ≈ 2.78 m`);
  assert.ok(approx(moon.hang, 3.7037, 0.05), `Moon hang ${moon.hang} ≈ 3.70 s`);
  const earth = sphereJumpArc(planetParams('earth'), { ...EARTH_WALK_SPAWN_FEET });
  assert.ok(approx(earth.apex, 0.4587, 0.03), `Earth apex ${earth.apex} ≈ 0.46 m`);
  assert.ok(approx(earth.hang, 0.6116, 0.05), `Earth hang ${earth.hang} ≈ 0.61 s`);
});

// --- 5. Flat walker: Mars + Jupiter jump under their own gravity ---------

function flatJumpArc(key, groundHeight) {
  const planet = planetParams(key);
  const dt = 0.005;
  let state = { pos: { x: 0, y: planet.eyeHeight, z: 0 }, vy: 0, grounded: true };
  let maxH = 0;
  let steps = 0;
  let jumped = false;
  while (steps < 20000) {
    const jump = !jumped;
    state = stepFlatWalker(state, { fwd: 0, strafe: 0, jump, yaw: 0 }, dt, planet, groundHeight);
    jumped = true;
    maxH = Math.max(maxH, state.pos.y - planet.eyeHeight);
    steps += 1;
    if (jumped && state.grounded && steps > 1) break;
  }
  return { apex: maxH, hang: steps * dt };
}

test('flat walker jumps match the table: Mars arcs, Jupiter barely hops', () => {
  const flat = () => 0;
  const mars = flatJumpArc('mars', flat);
  assert.ok(approx(mars.apex, 1.2129, 0.03), `Mars apex ${mars.apex} ≈ 1.21 m`);
  assert.ok(approx(mars.hang, 1.6173, 0.05), `Mars hang ${mars.hang} ≈ 1.62 s`);
  const jupiter = flatJumpArc('jupiter', flat);
  assert.ok(approx(jupiter.apex, 0.1815, 0.03), `Jupiter apex ${jupiter.apex} ≈ 0.18 m`);
  assert.ok(approx(jupiter.hang, 0.2420, 0.05), `Jupiter hang ${jupiter.hang} ≈ 0.24 s`);
});

test('flat walker rides the terrain on foot and lands back on it', () => {
  const planet = planetParams('mars');
  // Uphill terrain: the eye follows the ground exactly while grounded.
  const slope = (x) => x * 0.1;
  let state = { pos: { x: 0, y: planet.eyeHeight, z: 0 }, vy: 0, grounded: true };
  for (let i = 0; i < 120; i++) {
    state = stepFlatWalker(state, { fwd: 1, strafe: 0, jump: false, yaw: -Math.PI / 2 }, 1 / 60, planet, slope);
    assert.ok(approx(state.pos.y, slope(state.pos.x) + planet.eyeHeight, 1e-9), `eye rides uphill terrain (got ${state.pos.y})`);
    assert.equal(state.grounded, true, 'stays grounded on foot');
  }
  // After a jump the walker lands back on the terrain, grounded, still.
  const flat = () => 0;
  state = { pos: { x: 0, y: planet.eyeHeight, z: 0 }, vy: 0, grounded: true };
  let landed = false;
  for (let i = 0; i < 600; i++) {
    state = stepFlatWalker(state, { fwd: 0, strafe: 0, jump: i === 0, yaw: 0 }, 1 / 60, planet, flat);
    if (i > 0 && state.grounded) { landed = true; break; }
  }
  assert.equal(landed, true, 'lands after the jump');
  assert.equal(state.pos.y, planet.eyeHeight, 'eye back on the terrain');
  assert.equal(state.vy, 0, 'vertical velocity zeroed on landing');
});

// --- 6. The normal look law, shared ---------------------------------------

test('look law: full-width swipe 180°, half 90°, damping 20/s, pitch clamp 1.2', () => {
  // The turn is a fraction of the screen, not a fixed rad/px number:
  // round 2's 0.0015 rad/px turned only ~60° per full-width swipe.
  assert.equal(LOOK_FULL_SWIPE_TURN, Math.PI, 'a full-width swipe turns half a circle');
  assert.equal(LOOK_DAMPING_RATE, 20, 'damping rate 20/s (was 10)');
  assert.equal(LOOK_PITCH_MAX, 1.2, 'pitch clamp 1.2 rad');
  // Full-width and half-screen swipes, on any viewport width.
  assert.ok(approx(lookTurnForDrag(390, 390), Math.PI, 1e-12), 'full-width swipe on a 390 px phone → 180°');
  assert.ok(approx(lookTurnForDrag(195, 390), Math.PI / 2, 1e-12), 'half-screen swipe → 90°');
  assert.ok(approx(lookTurnForDrag(1440, 1440), Math.PI, 1e-12), 'full-width swipe on a 1440 px desktop → 180° too');
  // A 150 px thumb drag on a 390 px phone: (150/390)·180° ≈ 69.2°.
  assert.ok(approx(lookTurnForDrag(150, 390), 1.2083, 0.001), '150 px drag on a 390 px phone → ~69°');
  assert.ok(approx(lookTurnForDrag(150, 360), 1.3090, 0.001), '150 px drag on a 360 px phone → ~75°');
  // Linearity — two consecutive move events apply only their own
  // deltas, so they sum exactly to the one big drag (no compounding).
  assert.ok(
    approx(lookTurnForDrag(60, 390) + lookTurnForDrag(90, 390), lookTurnForDrag(150, 390), 1e-12),
    '60 px + 90 px deltas = one 150 px drag'
  );
  // Guards: no drag, or no viewport, turns nothing.
  assert.equal(lookTurnForDrag(0, 390), 0, 'no drag → no turn');
  assert.equal(lookTurnForDrag(100, 0), 0, 'zero viewport width → no turn');
  assert.equal(lookTurnForDrag(100, -50), 0, 'negative viewport width → no turn');
  // Exact ease values at rate 20: 63% there in 0.05 s, 95% in 0.15 s, 99% in 0.25 s.
  assert.ok(approx(dampLookAngle(0, 1, 0.05), 0.6321, 0.001), '0.05 s → 63%');
  assert.ok(approx(dampLookAngle(0, 1, 0.15), 0.9502, 0.001), '0.15 s → 95%');
  assert.ok(approx(dampLookAngle(0, 1, 0.25), 0.9933, 0.001), '0.25 s → 99%');
  assert.equal(dampLookAngle(0.7, 1, 0), 0.7, 'dt 0 returns current exactly');
});

// --- 6b. The shared auto-center (UNIFY, Merlin Nov 16 ~02:43) ----------
// One implementation for every vehicle in every realm: the caller
// hands it the look offset + dt, gets the eased offset back. No
// vehicle, no world, no Jupiter 2 constant inside — Jupiter 2's
// speeder is the first consumer; the unify worker wires the rest.

test('auto-center: slow ease back to forward — 0.8/s, offset decays, never snaps', () => {
  assert.equal(LOOK_RECENTER_RATE, 0.8, 'recenter rate 0.8/s — slow, not the 20/s finger-tracking damp');
  // wrapAngle: shortest arc, so a yaw offset never eases the long way around.
  assert.ok(approx(wrapAngle(0), 0, 1e-12), '0 stays 0');
  assert.ok(approx(wrapAngle(Math.PI / 2), Math.PI / 2, 1e-12), '90° stays 90°');
  assert.ok(approx(wrapAngle((3 * Math.PI) / 2), -Math.PI / 2, 1e-12), '270° wraps to −90°');
  assert.ok(approx(wrapAngle((-3 * Math.PI) / 2), Math.PI / 2, 1e-12), '−270° wraps to 90°');
  assert.ok(approx(wrapAngle(Math.PI * 2), 0, 1e-12), 'a full turn wraps to 0');
  // lookOffsetFromHeading: target minus heading, wrapped.
  assert.ok(approx(lookOffsetFromHeading(0.6, 0.6), 0, 1e-12), 'on-heading → zero offset');
  assert.ok(approx(lookOffsetFromHeading(0.6 + Math.PI / 2, 0.6), Math.PI / 2, 1e-12), '90° aside → +90° offset');
  assert.ok(approx(lookOffsetFromHeading(-Math.PI + 0.1, Math.PI - 0.1), 0.2, 1e-12), 'across the ±π seam → the short way (0.2, not −6.08)');
  // recenterLookOffset: exponential decay at 0.8/s — dt 0 changes
  // nothing, 1 s leaves ~45%, ~3.75 s leaves ~5%, a long dt lands on zero.
  const off = { yaw: Math.PI / 2, pitch: -0.6 };
  assert.deepEqual(recenterLookOffset(off, 0), off, 'dt 0 returns the offset unchanged');
  const one = recenterLookOffset(off, 1);
  assert.ok(approx(one.yaw, (Math.PI / 2) * Math.exp(-0.8), 0.001), '1 s → 45% of a 90° yaw offset left');
  assert.ok(approx(one.pitch, -0.6 * Math.exp(-0.8), 0.001), 'pitch decays at the same rate');
  const slow = recenterLookOffset(off, 4);
  assert.ok(Math.abs(slow.yaw) < 0.05 * (Math.PI / 2), '4 s → 95%+ back (slow, never a snap)');
  const done = recenterLookOffset(off, 30);
  assert.ok(Math.abs(done.yaw) < 1e-9 && Math.abs(done.pitch) < 1e-9, 'a long dt lands on zero');
  // A custom rate still works (the unify worker's vehicles share
  // the default; nothing per-vehicle is baked in).
  assert.ok(approx(recenterLookOffset({ yaw: 1, pitch: 0 }, 1, 20).yaw, Math.exp(-20), 1e-9), 'rate is a parameter, not a constant');
  // Guards: missing components read as zero, negative dt reads as zero.
  assert.deepEqual(recenterLookOffset({}, 1), { yaw: 0, pitch: 0 }, 'missing components → zero');
  assert.deepEqual(recenterLookOffset(off, -1), off, 'negative dt → unchanged');
});

// --- 7. Whole-sphere scatter ----------------------------------------------

test('scatter is deterministic, on-sphere, and keeps clear of the landing site', () => {
  const a = scatterSpherePlacements({ radius: 55, count: 40, seed: 20261117, minSize: 0.3, maxSize: 1.2, excludeRad: 0.6 });
  const b = scatterSpherePlacements({ radius: 55, count: 40, seed: 20261117, minSize: 0.3, maxSize: 1.2, excludeRad: 0.6 });
  assert.deepEqual(a, b, 'same seed → same placements');
  assert.equal(a.length, 40, '40 rocks');
  for (const p of a) {
    const r = vlen(p.pos);
    assert.ok(approx(r, 55 - p.size * 0.3, 1e-9), `rock sits on the sphere (r=${r})`);
    assert.ok(p.size >= 0.3 && p.size <= 1.2, 'size in range');
    // No rock within 0.6 rad of the +Y landing site.
    const cosAng = p.pos.y / r;
    assert.ok(cosAng <= Math.cos(0.6) + 1e-9, 'keeps clear of the landing site');
  }
  const peb = scatterSpherePlacements({ radius: 55, count: 24, seed: 20261118, minSize: 0.05, maxSize: 0.16, excludeRad: 0.6 });
  assert.equal(peb.length, 24, '24 pebbles');
});

// --- 8. The Earth walk itself ----------------------------------------------

test('earth walk constants: route, gravity, walk, spawn on the 55 m sphere', () => {
  assert.equal(EARTH_WALK_ROUTE, '/earth-walk', 'route /earth-walk');
  assert.equal(EARTH_WALK_PLANET.gravity, 9.81, 'Earth gravity 9.81');
  assert.equal(EARTH_WALK_PLANET.walkSpeed, 6, 'Earth walk 6 m/s');
  assert.equal(EARTH_WALK_PLANET.jumpSpeed, 3.0, 'shared 3.0 take-off');
  assert.equal(EARTH_WALK_PLANET.radius, 55, 'Earth sphere radius 55');
  assert.ok(approx(vlen(EARTH_WALK_SPAWN_FEET), 55, 1e-9), `spawn |feet| = 55 (got ${vlen(EARTH_WALK_SPAWN_FEET)})`);
  const st = earthWalkLandingState();
  assert.deepEqual(st, { feet: { ...EARTH_WALK_SPAWN_FEET }, vr: 0, grounded: true }, 'fresh state at spawn');
  assert.equal(EARTH_WALK_MOON_RADIUS, MOON_RADIUS, 'Moon in the sky is radius 14');
  assert.equal(EARTH_WALK_MOON_DISTANCE, 180, 'Moon hangs 180 away');
  assert.ok(approx(earthWalkMoonAngularDiameterDeg(), 8.92, 0.01), 'Moon spans 8.92° from Earth');
  assert.equal(earthWalkRockPlacements().length, EARTH_WALK_ROCK_COUNT, '40 Earth rocks');
  assert.equal(earthWalkPebblePlacements().length, EARTH_WALK_PEBBLE_COUNT, '24 Earth pebbles');
  for (const p of earthWalkRockPlacements()) {
    assert.ok(approx(vlen(p.pos), 55 - p.size * 0.3, 1e-9), 'Earth rock on the sphere');
    assert.ok(p.pos.y / vlen(p.pos) <= Math.cos(EARTH_WALK_EXCLUDE_RAD) + 1e-9, 'Earth rock clear of the landing site');
  }
});

// --- 9. Hops: wired only where the target planet is rendered --------------

test('Moon ↔ Earth hops are wired; Mars/Jupiter have no sky planet to tap', () => {
  // The Moon's Earth tap lands on the Earth walk (not the menu).
  const moonPage = read('app/moon/page.jsx');
  assert.ok(moonPage.includes("travel('/earth-walk'"), 'Moon page travels to /earth-walk');
  assert.ok(!moonPage.includes("travel('/?enter=earth'"), 'Moon page no longer goes to the Earth menu');
  assert.ok(read('components/MoonScene.jsx').includes('onEarthClick'), 'Moon scene renders a clickable Earth');
  // The Earth walk's Moon tap lands back on the Moon.
  const earthPage = read('app/earth-walk/page.jsx');
  assert.ok(earthPage.includes("travel('/moon'"), 'Earth walk page travels to /moon');
  assert.ok(read('components/EarthWalkScene.jsx').includes('onMoonClick'), 'Earth walk scene renders a clickable Moon');
  // Mars 2: no planet hangs in the sky (DayNightRig + stars only),
  // so no hop is wired — the hub stays the door.
  const mars2 = read('components/mars2/Mars2Scene.jsx');
  assert.ok(!mars2.includes('onEarthClick') && !mars2.includes('onMoonClick') && !mars2.includes('onJupiterClick'), 'Mars 2 wires no sky hop');
  assert.ok(!mars2.includes("travel('/"), 'Mars 2 scene travels nowhere');
  assert.ok(mars2.includes('stepFlatWalker') && mars2.includes("planetParams('mars')"), 'Mars 2 walk runs on the shared walker');
  // Jupiter 2: the storm hides the sky entirely — no hop wired.
  const jup2 = read('components/jupiter2/Jupiter2Scene.jsx');
  assert.ok(!jup2.includes('onEarthClick') && !jup2.includes('onMoonClick') && !jup2.includes('onMarsClick'), 'Jupiter 2 wires no sky hop');
  assert.ok(!jup2.includes("travel('/"), 'Jupiter 2 scene travels nowhere');
  // Full-planet rework (Merlin, Nov 16 ~00:02): the ground radius
  // varies (deck 88 / shelf 74 / mountain), so the flat walker no
  // longer fits — J2 walks on stepJupiter2Walker, which wraps the
  // SAME shared core (radialVelocityStep + sphereTangentBasis)
  // with planetParams('jupiter') for gravity 24.79 / take-off 3.0.
  assert.ok(jup2.includes('stepJupiter2Walker') && jup2.includes("planetParams('jupiter')"), 'Jupiter 2 walk runs on the shared walker core');
  assert.ok(!jup2.includes('stepFlatWalker'), 'the flat walker is gone from Jupiter 2');
  assert.ok(read('lib/jupiter2/planet.js').includes('radialVelocityStep'), 'stepJupiter2Walker wraps the shared radial step');
  // Mars 1: a walkable scene with no planet in its sky either
  // (sun disc + stars only) — no hop wired, reported not built.
  const mars1 = read('components/mars/MarsScene.jsx');
  assert.ok(!mars1.includes('onEarthClick') && !mars1.includes('onMoonClick') && !mars1.includes('onJupiterClick'), 'Mars 1 wires no sky hop');
  // The Earth 1 kart files are untouched by this build (another
  // worker owns them while its rework is unpushed).
  for (const f of ['lib/earth/kart.js', 'lib/earth/globe-click.js', 'lib/earth/metal-tiles.js']) {
    const src = read(f);
    assert.ok(!src.includes('planet-walker'), `${f} does not import the planet walker`);
    assert.ok(!src.includes('earth-walk'), `${f} does not mention the Earth walk`);
  }
  assert.ok(!read('components/EarthKart.jsx').includes('planet-walker'), 'EarthKart untouched by this build');
});

// --- 10. The Moon still reads the same through its old names --------------

test('moon module still exports its old names (back-compat)', async () => {
  const moon = await import('../lib/moon.js');
  assert.equal(moon.MOON_GRAVITY, 1.62, 'MOON_GRAVITY 1.62');
  assert.equal(moon.MOON_WALK_SPEED, 2.5, 'MOON_WALK_SPEED 2.5');
  assert.equal(moon.MOON_LOOK_FULL_SWIPE_TURN, Math.PI, 'MOON_LOOK_FULL_SWIPE_TURN π');
  assert.equal(typeof moon.lookTurnForDrag, 'function', 'moon re-exports lookTurnForDrag');
  assert.equal(moon.globalRockPlacements().length, 40, 'Moon global rocks still 40');
  assert.equal(moon.globalPebblePlacements().length, 24, 'Moon global pebbles still 24');
  // Spawn sits 3 m south of the +Y pole, so up.y = cos(3/14) ≈ 0.977.
  assert.ok(approx(sphereSurfaceUp(moon.MOON_SPAWN_FEET, 14).y, 0.9771, 0.001), 'spawn up is +Y-ish');
});

// --- 11. Joystick inversion (Merlin, Nov 16, 2026): stick right = go right ---

test('Moon + Earth walk: stick right strafes right, stick up walks forward (no inversion)', () => {
  // The chain, end to end: WalkJoystick reports onMove(dx/max, -dy/max)
  // — x+ is stick right, y+ is stick up. Both scenes feed the stick
  // straight into the walker (fwd += y, strafe += x), and the walker
  // steps along basis.right for strafe — and right IS the walker's
  // right (cross(forward, up)), not its mirror. A flipped sign
  // anywhere in that chain would strafe the walker left.
  const stick = read('components/world/WalkJoystick.jsx');
  assert.ok(stick.includes('onMove(dx / max, -dy / max)'), 'WalkJoystick: x+ = stick right, y+ = stick up');
  for (const f of ['components/MoonScene.jsx', 'components/EarthWalkScene.jsx']) {
    const src = read(f);
    assert.ok(src.includes('strafe += moveRef.current.x'), `${f}: strafe takes the stick x`);
    assert.ok(src.includes('fwd += moveRef.current.y'), `${f}: fwd takes the stick y`);
  }
  const check = (label, step, state, basis) => {
    // Strafe +1 (stick right) for one frame, grounded.
    const s = step(state, { fwd: 0, strafe: 1, jump: false, forward: basis.forward, right: basis.right }, 0.05);
    const d = { x: s.feet.x - state.feet.x, y: s.feet.y - state.feet.y, z: s.feet.z - state.feet.z };
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    const alongRight = (basis.right.x * d.x + basis.right.y * d.y + basis.right.z * d.z) / n;
    const alongFwd = (basis.forward.x * d.x + basis.forward.y * d.y + basis.forward.z * d.z) / n;
    assert.ok(alongRight > 0.9, `${label}: stick right moves along the right vector, got ${alongRight}`);
    assert.ok(Math.abs(alongFwd) < 0.1, `${label}: stick right does not move forward/back, got ${alongFwd}`);
    // And forward +1 (stick up) walks along the view, not sideways.
    const s2 = step(state, { fwd: 1, strafe: 0, jump: false, forward: basis.forward, right: basis.right }, 0.05);
    const d2 = { x: s2.feet.x - state.feet.x, y: s2.feet.y - state.feet.y, z: s2.feet.z - state.feet.z };
    const n2 = Math.hypot(d2.x, d2.y, d2.z) || 1;
    const fwdAlong = (basis.forward.x * d2.x + basis.forward.y * d2.y + basis.forward.z * d2.z) / n2;
    assert.ok(fwdAlong > 0.9, `${label}: stick up walks along the view, got ${fwdAlong}`);
  };
  // Moon: the scene's own step + basis, spawn pose, arrival yaw 0.
  const moonState = moonLandingState();
  check('Moon', stepMoonWalker, moonState, moonTangentBasis(moonState.feet, 0));
  // Earth walk: the shared sphere walker on the 55 m sphere.
  const earthState = earthWalkLandingState();
  check('Earth walk', (st, input, dt) => stepSphereWalker(st, input, dt, EARTH_WALK_PLANET), earthState, sphereTangentBasis(earthState.feet, 0, EARTH_WALK_PLANET.radius));
});

// --- 12. Moon + Earth walk auto-center + pull-to-refresh fix (Merlin, Nov 16, 2026) ---

test('Moon + Earth walk: the look eases back on release, and a downward drag cannot reload the page', () => {
  // Both scenes consume the ONE shared helper (no local copy, no
  // local rate), anchor the glance at drag start, and only start
  // the ease-back after a real drag — a tap never starts it. The
  // ease returns to the drag-start view, not the arrival angles:
  // the walker has walked on since arrival.
  for (const f of ['components/MoonScene.jsx', 'components/EarthWalkScene.jsx']) {
    const src = read(f);
    assert.match(src, /recenterLookOffset/);
    assert.match(src, /lookOffsetFromHeading/);
    assert.match(src, /recenterLookOffset\(/);
    assert.match(src, /lookAnchorRef\.current = \{ yaw: yawTarget\.current, pitch: pitchTarget\.current \}/);
    assert.match(src, /if \(lookMovedRef\.current\) recenterRef\.current = true;/);
    assert.match(src, /yawTarget\.current = lookAnchorRef\.current\.yaw \+ eased\.yaw/);
    assert.doesNotMatch(src, /const LOOK_RECENTER_RATE|const RECENTER_RATE|recenterRate =/);
    // Pull-to-refresh: the drag-look handler takes the gesture.
    assert.match(src, /e\.preventDefault\(\);/);
  }
  // The Canvas itself carries touch-action none — that is the fix
  // that stops iOS hijacking a downward drag as pull-to-refresh.
  for (const f of ['app/moon/page.jsx', 'app/earth-walk/page.jsx']) {
    assert.match(read(f), /style=\{\{ touchAction: 'none' \}\}/);
  }
  // The shared helper the scenes call is the same one the J2
  // speeder uses — one implementation, no drift.
  assert.match(read('lib/planet-walker.js'), /export function recenterLookOffset\(offset, dt, rate = LOOK_RECENTER_RATE\)/);
  assert.match(read('components/jupiter2/Jupiter2Scene.jsx'), /recenterLookOffset\(/);
});
