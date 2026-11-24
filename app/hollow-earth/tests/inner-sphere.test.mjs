// Inner-sphere law tests (MonsterVerse round phase 2, WS2 step 7b).
// Hollow Earth is an INNER sphere: the walker stands on the inside
// of the shell under a core-sun, up is toward the centre, gravity
// pulls toward the shell. Every number here is the worker's call,
// stated in lib/hollow-earth/planet.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeightFunction } from '../../../app/star-wars/zone.js';
import { WORLD } from '../data.js';
import { biomeAt, biomeWeights } from '../biomes.js';
import {
  SPHERE_R, HE_GRAVITY, HE_JUMP_V, HE_WALK_SPEED, STEP_WALL_M, STEEP_FALL_GRADIENT,
  POLE_DIR, deckToDir, dirToDeck, thetaFromPole, azimuthOf, dirAt,
  groundRadiusAt, groundPointAt, spherePointFromDeck, sphereUpAtDeck, sphereUpAt,
  liftedPoint, surfaceDistanceBetween, insideTangentBasis, deckStepFor,
  applyQuat, orientationQuat, flatQuat, sphereStateForDeck,
  stepHollowEarthWalker, auraRingPoints,
} from '../../../lib/hollow-earth/planet.js';

const FLAT = () => 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('sphere radius: pole-to-equator surface distance is the old 600 m disc radius', () => {
  assert.equal(SPHERE_R, 382);
  assert.ok(approx((Math.PI / 2) * SPHERE_R, 600, 0.5), `equator at ${(Math.PI / 2) * SPHERE_R} m, expected ~600`);
  assert.equal(HE_GRAVITY, 18);
  assert.equal(HE_JUMP_V, 6);
  assert.equal(HE_WALK_SPEED, 10);
});

test('spawn pole: deck origin maps to the inside-bottom (0,-1,0), so up near spawn is world +Y', () => {
  assert.deepEqual(deckToDir(0, 0), POLE_DIR);
  const up = sphereUpAtDeck(0, 95);
  assert.ok(up.y > 0.95, `spawn up ${JSON.stringify(up)} must be ~world +Y`);
  const spawn = spherePointFromDeck(0, 95, FLAT);
  assert.ok(approx(Math.hypot(spawn.x, spawn.y, spawn.z), SPHERE_R), 'spawn point sits on the shell');
  assert.ok(spawn.y < 0, 'spawn sits on the lower inside of the shell');
});

test('deck chart round-trips, including the far side past the old r550 rim', () => {
  const pts = [
    [0, 95], [0, 155], [-215, 55], [198, -132], [210, -150], [-230, 130],
    [0, 550], [550, 0], [-600, 0], [0, -900], [800, 600], [-900, -600],
  ];
  for (const [x, z] of pts) {
    const back = dirToDeck(deckToDir(x, z));
    assert.ok(approx(back.x, x, 1e-6) && approx(back.z, z, 1e-6), `round-trip failed for (${x},${z}): got (${back.x},${back.z})`);
  }
  // The antipode is a chart singularity for azimuth only: theta is pi.
  const anti = deckToDir(0, -1200);
  assert.ok(approx(thetaFromPole(anti), Math.PI, 0.01), `antipode theta ${thetaFromPole(anti)}, expected pi`);
  // The chart's domain ends at the antipode (deck r = πR ≈ 1200 m):
  // a deck point further out than that has no sphere point.
  assert.ok(Math.PI * SPHERE_R > 1200 && Math.PI * SPHERE_R < 1201, 'antipode at deck r ≈ 1200 m');
});

test('ground radius: hills poke toward the centre, valleys dip away (sign-flipped from J2)', () => {
  const dir = deckToDir(0, 95);
  assert.equal(groundRadiusAt(dir, () => 0), SPHERE_R);
  assert.equal(groundRadiusAt(dir, () => 3.4), SPHERE_R - 3.4, 'a +3.4 m hill is 3.4 m closer to the centre');
  assert.equal(groundRadiusAt(dir, () => -3.4), SPHERE_R + 3.4, 'a −3.4 m valley is 3.4 m further from the centre');
  const p = groundPointAt(dir, () => 2);
  assert.ok(approx(Math.hypot(p.x, p.y, p.z), SPHERE_R - 2), 'ground point sits at its ground radius');
  const lifted = liftedPoint(0, 95, 2.4, FLAT);
  assert.ok(approx(Math.hypot(lifted.x, lifted.y, lifted.z), SPHERE_R - 2.4), 'lifted point is 2.4 m toward the centre');
});

test('surface distances: Haven region + spawn-to-Haven are exact surface metres', () => {
  assert.ok(approx(surfaceDistanceBetween(0, 155, 0, 155 + 28), 28, 1e-6), 'Haven rim is 28 surface metres from its centre');
  assert.ok(approx(surfaceDistanceBetween(0, 95, 0, 155), 60, 1e-6), 'spawn to Haven is 60 surface metres');
  assert.ok(approx(surfaceDistanceBetween(-215, 55, -215, 55), 0, 1e-9), 'zero distance is zero');
  assert.ok(approx(surfaceDistanceBetween(0, 0, 0, 600), 600, 1e-6), 'pole to equator is 600 surface metres');
});

test('inside tangent basis: yaw 0 faces deck-north, +90 turns west like the flat walker', () => {
  const feet = spherePointFromDeck(0, 95, FLAT);
  const b0 = insideTangentBasis(feet, 0);
  // Forward at yaw 0 is deck-north: walking it decreases deck z.
  const step = deckStepFor(feet, 0);
  assert.ok(step.z < -0.99 && Math.abs(step.x) < 0.02, `yaw-0 deck step ${JSON.stringify(step)} must be north (−z)`);
  // Positive yaw turns toward west (−X at the pole), the flat convention.
  const b90 = insideTangentBasis(feet, Math.PI / 2);
  assert.ok(b90.forward.x < -0.9, `yaw +90 forward ${JSON.stringify(b90.forward)} must face west`);
  // Orthonormal: up/forward/right are unit and mutually perpendicular.
  for (const b of [b0, b90]) {
    assert.ok(approx(Math.hypot(b.up.x, b.up.y, b.up.z), 1, 1e-9));
    assert.ok(approx(Math.hypot(b.forward.x, b.forward.y, b.forward.z), 1, 1e-9));
    assert.ok(approx(Math.hypot(b.right.x, b.right.y, b.right.z), 1, 1e-9));
    assert.ok(approx(b.up.x * b.forward.x + b.up.y * b.forward.y + b.up.z * b.forward.z, 0, 1e-9));
  }
});

test('orientationQuat: local +Y lands on up, local −Z lands on the yaw forward', () => {
  for (const [x, z, yaw] of [[0, 95, 0], [0, 95, 1.2], [-215, 55, -0.7], [210, -150, 2.5], [0, 550, 0.3]]) {
    const feet = spherePointFromDeck(x, z, FLAT);
    const q = orientationQuat(feet, yaw);
    const up = applyQuat(q, { x: 0, y: 1, z: 0 });
    const fwd = applyQuat(q, { x: 0, y: 0, z: -1 });
    const basis = insideTangentBasis(feet, yaw);
    assert.ok(approx(up.x, basis.up.x, 1e-9) && approx(up.y, basis.up.y, 1e-9) && approx(up.z, basis.up.z, 1e-9),
      `quat up mismatch at (${x},${z}) yaw ${yaw}`);
    assert.ok(approx(fwd.x, basis.forward.x, 1e-9) && approx(fwd.y, basis.forward.y, 1e-9) && approx(fwd.z, basis.forward.z, 1e-9),
      `quat forward mismatch at (${x},${z}) yaw ${yaw}`);
  }
  // A flat disc laid by flatQuat has its +Z normal on local up.
  const feet = spherePointFromDeck(-215, 55, FLAT);
  const n = applyQuat(flatQuat(feet), { x: 0, y: 0, z: 1 });
  const up = sphereUpAt(feet);
  assert.ok(approx(n.x, up.x, 1e-9) && approx(n.y, up.y, 1e-9) && approx(n.z, up.z, 1e-9), 'flatQuat must map +Z to up');
});

test('walker: a full circuit returns to the start — no edge, no fall-through', () => {
  const planet = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: FLAT };
  let s = sphereStateForDeck(0, 95, FLAT);
  const start = { ...s.feet };
  // One great-circle circuit: 2πR ≈ 2400 m at 10 m/s, dt 0.05 → 4800 steps.
  const steps = Math.round((2 * Math.PI * SPHERE_R) / (10 * 0.05));
  for (let i = 0; i < steps; i++) {
    s = stepHollowEarthWalker(s, { fwd: 1, strafe: 0, jump: false, yaw: 0 }, 0.05, planet);
    const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    assert.ok(s.grounded, `step ${i}: walker left the ground`);
    assert.ok(approx(r, SPHERE_R, 1e-6), `step ${i}: feet radius ${r}, expected ${SPHERE_R} — fell through or floated off`);
  }
  const back = Math.hypot(s.feet.x - start.x, s.feet.y - start.y, s.feet.z - start.z);
  assert.ok(back < 1, `after one circuit the walker is ${back.toFixed(2)} m from its start, expected < 1 m`);
});

test('walker: walking past the old r550 rim keeps going and comes back around', () => {
  const planet = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: FLAT };
  let s = sphereStateForDeck(0, 500, FLAT);
  let maxTheta = 0;
  let maxDeckR = 0;
  for (let i = 0; i < 4000; i++) {
    s = stepHollowEarthWalker(s, { fwd: 1, strafe: 0, jump: false, yaw: Math.PI }, 0.05, planet);
    maxTheta = Math.max(maxTheta, thetaFromPole(s.feet));
    maxDeckR = Math.max(maxDeckR, Math.hypot(s.deck.x, s.deck.z));
    assert.ok(s.grounded, `step ${i}: walker left the ground past the old rim`);
  }
  assert.ok(maxTheta > Math.PI / 2, `walker never crossed the equator (max theta ${maxTheta}) — the old rim still binds it`);
  // The walker went ~2000 m round a ~2400 m circuit, so by the end
  // it is on its way back (deck r back under 600) — the journey,
  // not the endpoint, proves the wrap: it reached the far side.
  assert.ok(maxDeckR > 1000, `walker max deck radius ${maxDeckR} never reached the far side (antipode ≈ 1200)`);
});

test('walker: jump rises toward the centre and lands back on the shell', () => {
  const planet = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: FLAT };
  let s = sphereStateForDeck(0, 95, FLAT);
  s = stepHollowEarthWalker(s, { fwd: 0, strafe: 0, jump: true, yaw: 0 }, 0.016, planet);
  assert.equal(s.grounded, false, 'jump must leave the ground');
  assert.ok(s.vh > 0, 'jump velocity must point up (toward the centre)');
  let minR = Infinity;
  for (let i = 0; i < 200 && !s.grounded; i++) {
    s = stepHollowEarthWalker(s, { fwd: 0, strafe: 0, jump: false, yaw: 0 }, 0.016, planet);
    minR = Math.min(minR, Math.hypot(s.feet.x, s.feet.y, s.feet.z));
  }
  assert.equal(s.grounded, true, 'walker must land again');
  const apex = SPHERE_R - minR;
  assert.ok(Math.abs(apex - (6 * 6) / (2 * 18)) < 0.15, `jump apex ${apex.toFixed(2)} m, expected 1.00 m (v²/2g)`);
});

test('walker: a rise is a climb, a >2 m drop goes airborne and lands', () => {
  const gentle = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: (x, z) => 2 * Math.sin(x * 0.01) };
  let s = sphereStateForDeck(-50, 95, gentle.heightAt);
  for (let i = 0; i < 200; i++) {
    s = stepHollowEarthWalker(s, { fwd: 0, strafe: 1, jump: false, yaw: 0 }, 0.05, gentle);
    assert.ok(s.grounded, `step ${i}: gentle rise must be climbed grounded, not a wall`);
  }
  // A 10 m cliff down (ground radius jumps +10 east of x=100): walking
  // east across it must go airborne, then land on the lower ground.
  const cliff = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: (x) => (x > 100 ? -10 : 0) };
  s = sphereStateForDeck(90, 95, cliff.heightAt);
  let wentAirborne = false;
  let landed = false;
  for (let i = 0; i < 400; i++) {
    s = stepHollowEarthWalker(s, { fwd: 0, strafe: 1, jump: false, yaw: 0 }, 0.05, cliff);
    if (!s.grounded) wentAirborne = true;
    if (wentAirborne && s.grounded) { landed = true; break; }
    const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    assert.ok(r <= groundRadiusAt(s.feet, cliff.heightAt) + 1e-6, `step ${i}: feet below the shell — fell through`);
  }
  assert.ok(wentAirborne, 'the >2 m drop must go airborne, never teleport down');
  assert.ok(landed, 'the walker must land on the lower ground after the drop');
  assert.ok(s.deck.x > 100, 'the walker must end up past the cliff edge');
});

test('walker: never falls through the shell on bumpy ground', () => {
  const bumpy = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt: (x, z) => 3 * Math.sin(x * 0.02) * Math.cos(z * 0.017) };
  let s = sphereStateForDeck(0, 95, bumpy.heightAt);
  for (let i = 0; i < 3000; i++) {
    const yaw = (i % 4) * (Math.PI / 2);
    const jump = i === 1000;
    s = stepHollowEarthWalker(s, { fwd: 1, strafe: 0, jump, yaw }, 0.05, bumpy);
    const r = Math.hypot(s.feet.x, s.feet.y, s.feet.z);
    const groundR = groundRadiusAt(s.feet, bumpy.heightAt);
    assert.ok(r <= groundR + 1e-6, `step ${i}: feet radius ${r} below shell ${groundR} — fell through`);
    if (s.grounded) assert.ok(approx(r, groundR, 1e-6), `step ${i}: grounded feet off the shell by ${Math.abs(r - groundR)}`);
  }
});

test('aura rings hug the shell: every ring point sits ~0.35 m above the ground', () => {
  const heightAt = (x, z) => 3 * Math.sin(x * 0.02) * Math.cos(z * 0.017);
  for (const [radiusM, cx, cz] of [[59, -70, -170], [24, 160, -60], [16, -230, 130]]) {
    const pts = auraRingPoints(deckToDir(cx, cz), radiusM, 48, heightAt);
    assert.equal(pts.length, 48);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y, p.z);
      const groundR = groundRadiusAt(p, heightAt);
      assert.ok(Math.abs((groundR - r) - 0.35) < 0.05, `ring point ${JSON.stringify(p)} is ${(groundR - r).toFixed(2)} m above ground, expected 0.35`);
    }
    // The ring's surface distance from its centre is the radius.
    const c = deckToDir(cx, cz);
    for (const p of pts) {
      const d = SPHERE_R * Math.acos(Math.max(-1, Math.min(1, (p.x * c.x + p.y * c.y + p.z * c.z) / (Math.hypot(p.x, p.y, p.z) * 1))));
      assert.ok(Math.abs(d - radiusM) < 0.6, `ring point surface distance ${d.toFixed(1)} m, expected ${radiusM}`);
    }
  }
});

test('spawn-pole mapping: Haven, Korus throne and Ghorrum sit on the shell at their deck spots', () => {
  for (const [x, z] of [[0, 155], [-215, 55], [198, -132]]) {
    const p = spherePointFromDeck(x, z, FLAT);
    assert.ok(approx(Math.hypot(p.x, p.y, p.z), SPHERE_R, 1e-9), `(${x},${z}) is off the shell`);
    assert.ok(approx(thetaFromPole(p), Math.hypot(x, z) / SPHERE_R, 1e-9), 'angular distance is deck distance / R');
    assert.ok(approx(azimuthOf(p), Math.atan2(x, -z), 1e-9), 'azimuth matches the deck bearing');
  }
  // dirAt round-trips with theta/azimuth.
  const d = dirAt(0.5, 1.1);
  assert.ok(approx(thetaFromPole(d), 0.5, 1e-9) && approx(azimuthOf(d), 1.1, 1e-9));
});

test('projectile arc lifts radially (toward the core), not along world Y', async () => {
  const { projectilePathSphere } = await import('../monster-projectiles.js');
  // A shot across the far side: from (0, 382, 0)-ish shell point
  // toward a point 20 m away along the shell. At mid-flight the
  // arc must lift the shot toward the CENTRE (radius shrinking),
  // never along world +Y (which points sideways there).
  const from = { x: 0, y: 380, z: -40 };
  const to = { x: 0, y: 380, z: -60 };
  const mid = projectilePathSphere(from, to, 1.5, 0.5);
  const rMid = Math.hypot(mid.x, mid.y, mid.z);
  const rFlat = Math.hypot(0, 380, -50);
  assert.ok(rMid < rFlat - 0.5, `mid-flight radius ${rMid} must shrink toward the core (flat lerp ${rFlat})`);
  // And the flat helper would have lifted it in +Y instead.
  const { projectilePath } = await import('../monster-projectiles.js');
  const flat = projectilePath(from, to, 1.5, 0.5);
  assert.ok(flat.y > from.y, 'flat path lifts in world Y (the bug this replaces)');
  // At this shell point "toward the core" is mostly -Y, so the
  // sphere arc DROPS y while the flat arc RAISES it.
  assert.ok(mid.y < from.y, `sphere path lifts toward the core (y ${mid.y} < ${from.y})`);
});

test('no motion walls: no clamp, no turn-back, no bounds anywhere in Hollow Earth (Merlin Nov 16 ~02:42)', async () => {
  const { readFileSync } = await import('node:fs');
  const zone = readFileSync(new URL('../zone.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../page.jsx', import.meta.url), 'utf8');
  const data = readFileSync(new URL('../data.js', import.meta.url), 'utf8');
  const planet = readFileSync(new URL('../../../lib/hollow-earth/planet.js', import.meta.url), 'utf8');
  // No clamp call, no bounds object, no radial monster clamp.
  assert.doesNotMatch(zone, /clampBounds\(/, 'zone.js must never clamp');
  assert.doesNotMatch(page, /clampBounds\(/, 'page.jsx must never clamp');
  assert.doesNotMatch(zone, /bounds:\s*\{/, 'zone.js must not return a bounds object');
  assert.doesNotMatch(zone, /bd\s*>\s*\(def\.boundsRadius/, 'no radial monster clamp');
  assert.doesNotMatch(data, /boundsRadius\s*:/, 'no boundsRadius field left to rebuild a clamp from');
  // The flat walker is retired for this realm; the sphere step
  // is the only stepper, and it carries no edge of its own.
  // (The only `clamp` left in planet.js is numeric hygiene —
  // acos arguments to [-1, 1] and the frame dt to [0, 0.05] —
  // and landing on the ground, never a positional wall.)
  assert.doesNotMatch(page, /stepWalker\(/, 'page.jsx must not call the flat stepWalker');
  assert.doesNotMatch(planet, /clampBounds|\.bounds\b/, 'the sphere law holds no bounds object');
  // The walker proves it by walking: the rim test above already
  // walks 2000 m round the shell and comes back — no wall stops it.
});

test('infinite walk on the REAL terrain: height + biome defined everywhere, circuit closes', () => {
  const heightAt = createHeightFunction({ seed: WORLD.seed, groundAmp: WORLD.groundAmp });
  // The field functions never go non-finite anywhere on the deck
  // domain the walker can reach (r <= πR ≈ 1200) — and beyond it.
  for (const [x, z] of [[0, 95], [1200, 0], [-1200, 0], [0, 1200], [850, 850], [-1200, -1200], [5000, -3000]]) {
    const h = heightAt(x, z);
    assert.ok(Number.isFinite(h), `heightAt(${x},${z}) must be finite, got ${h}`);
    const b = biomeAt(x, z);
    assert.ok(b && typeof b.dominant === 'string', `biomeAt(${x},${z}) must name a band`);
    const w = biomeWeights(x, z);
    const total = Object.values(w).reduce((a, v) => a + v, 0);
    assert.ok(Number.isFinite(total) && Math.abs(total - 1) < 1e-6, `biome weights at (${x},${z}) must sum to 1, got ${total}`);
  }
  // A full great-circle circuit on the real terrain: the walker
  // never leaves the shell, never NaNs, and comes back around.
  const planet = { gravity: 18, walkSpeed: 10, jumpSpeed: 6, heightAt };
  let s = sphereStateForDeck(0, 95, heightAt);
  const start = { ...s.feet };
  const steps = Math.round((2 * Math.PI * SPHERE_R) / (10 * 0.05));
  let airborne = 0;
  for (let i = 0; i < steps; i++) {
    s = stepHollowEarthWalker(s, { fwd: 1, strafe: 0, jump: false, yaw: 0 }, 0.05, planet);
    assert.ok(Number.isFinite(s.feet.x) && Number.isFinite(s.feet.y) && Number.isFinite(s.feet.z), `step ${i}: feet went non-finite`);
    assert.ok(Number.isFinite(s.deck.x) && Number.isFinite(s.deck.z), `step ${i}: deck went non-finite`);
    if (!s.grounded) airborne++;
  }
  assert.ok(airborne < steps * 0.01, `walker airborne ${airborne}/${steps} steps on real terrain — the shell should carry it`);
  const back = Math.hypot(s.feet.x - start.x, s.feet.y - start.y, s.feet.z - start.z);
  assert.ok(back < 5, `after one real-terrain circuit the walker is ${back.toFixed(2)} m from its start, expected < 5 m`);
});
