// Headless tests for lib/babel/walk.js — run with: node test-walk.mjs
import {
  WALK_EYE, WALK_SPEED, LOOK_SENS, PITCH_LIMIT, WALK_AREAS,
  getWalkArea, clampWalker, stepWalker, applyLook,
  toggleCameraMode, prefersReducedMotion, isTouchDevice,
} from './walk.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

ok('walk areas cover tower + four scene floors', ['tower', 'sylva', 'duat', 'avalon', 'hermes'].every((v) => !!getWalkArea(v)));
ok('unknown view has no walk area', getWalkArea('atlantis') === null);
ok('eye height is sensible', WALK_EYE > 1 && WALK_EYE < 3);
ok('walk speed is sensible', WALK_SPEED >= 4 && WALK_SPEED <= 12);

// --- clamp: tower plaza ring (endless outside, shaft still closed) ---
let c = clampWalker({ x: 0, z: 100 }, 'tower');
ok('tower: beyond old max radius roams free (endless)', near(c.x, 0) && near(c.z, 100));
c = clampWalker({ x: 3, z: 4 }, 'tower'); // r = 5, inside the shaft
ok('tower: inside min radius pushed out to 12', near(Math.hypot(c.x, c.z), 12));
c = clampWalker({ x: 0, z: 0 }, 'tower');
ok('tower: exact center pushed out to min radius', near(Math.hypot(c.x, c.z), 12));
c = clampWalker({ x: 0, z: 30 }, 'tower');
ok('tower: inside the ring stays put', near(c.x, 0) && near(c.z, 30));

// --- clamp: circle floors (endless — no outer clamp) ---
c = clampWalker({ x: 0, z: 200 }, 'sylva');
ok('sylva: roams free past the old circle (endless)', near(c.x, 0) && near(c.z, 200));
c = clampWalker({ x: 0, z: 200 }, 'avalon');
ok('avalon: roams free past the old circle (endless)', near(c.x, 0) && near(c.z, 200));
c = clampWalker({ x: 0, z: 10 }, 'sylva');
ok('sylva: center is walkable (no min radius)', near(c.x, 0) && near(c.z, 10));

// --- clamp: box floors (duat endless, hermes room stays) ---
c = clampWalker({ x: 400, z: -500 }, 'duat');
ok('duat: roams free past the old box (endless)', near(c.x, 400) && near(c.z, -500));
c = clampWalker({ x: 35, z: -40 }, 'hermes');
ok('hermes: clamps to room box', near(c.x, 20) && near(c.z, -20));
c = clampWalker({ x: 5, z: -7 }, 'hermes');
ok('hermes: inside the room stays put', near(c.x, 5) && near(c.z, -7));

// --- clamp: unknown view ---
c = clampWalker({ x: 999, z: -999 }, 'atlantis');
ok('unknown view: position returned unchanged', near(c.x, 999) && near(c.z, -999));

// --- spawns sit inside their bounds ---
for (const [view, area] of Object.entries(WALK_AREAS)) {
  const s = area.spawn;
  const cl = clampWalker({ x: s.x, z: s.z }, view);
  ok(`${view}: spawn is inside bounds`, near(cl.x, s.x) && near(cl.z, s.z));
}

// --- stepWalker movement ---
let p = stepWalker({ x: 0, z: 30 }, 0, { fwd: 1, strafe: 0 }, 1);
ok('yaw 0 + forward walks toward -z', near(p.x, 0) && near(p.z, 30 - WALK_SPEED));
p = stepWalker({ x: 0, z: 0 }, Math.PI / 2, { fwd: 1, strafe: 0 }, 1);
ok('yaw 90deg + forward walks toward -x', near(p.x, -WALK_SPEED) && near(p.z, 0, 1e-5));
p = stepWalker({ x: 0, z: 0 }, 0, { fwd: 0, strafe: 1 }, 1);
ok('strafe right walks toward +x', near(p.x, WALK_SPEED) && near(p.z, 0));
p = stepWalker({ x: 0, z: 0 }, 0, { fwd: 1, strafe: 1 }, 1);
ok('diagonal input is normalized (not root-2 fast)', near(Math.hypot(p.x, p.z), WALK_SPEED));
p = stepWalker({ x: 5, z: -3 }, 0, { fwd: -1, strafe: 0 }, 0.5);
ok('backward + half dt', near(p.x, 5) && near(p.z, -3 + WALK_SPEED * 0.5));
p = stepWalker({ x: 1, z: 2 }, 0.7, { fwd: 0, strafe: 0 }, 1);
ok('zero input stays put', near(p.x, 1) && near(p.z, 2));

// --- applyLook ---
let l = applyLook(0, 0, 100, 0);
ok('drag right turns yaw left (negative)', near(l.yaw, -100 * LOOK_SENS) && near(l.pitch, 0));
l = applyLook(0, 0, 0, -50);
ok('drag up pitches up', l.pitch > 0);
l = applyLook(0, PITCH_LIMIT, 0, -10000);
ok('pitch clamps at +limit', near(l.pitch, PITCH_LIMIT));
l = applyLook(0, -PITCH_LIMIT, 0, 10000);
ok('pitch clamps at -limit', near(l.pitch, -PITCH_LIMIT));

// --- mode toggle state machine ---
ok('orbit toggles to walk', toggleCameraMode('orbit') === 'walk');
ok('walk toggles to orbit', toggleCameraMode('walk') === 'orbit');
ok('unknown mode falls through to walk', toggleCameraMode('banana') === 'walk');

// --- environment gates (headless: no window) ---
ok('prefersReducedMotion is false without window', prefersReducedMotion() === false);
ok('isTouchDevice is false without window', isTouchDevice() === false);

console.log(`walk: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
