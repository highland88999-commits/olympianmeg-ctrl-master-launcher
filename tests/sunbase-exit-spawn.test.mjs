// tests/sunbase-exit-spawn.test.mjs — SUN-BASE EXIT SPAWN
// (Merlin, Nov 24, 2026): exiting /sun-base back to the hub must
// spawn the user right outside the sun, looking forwards toward
// where they entered from (the hub) — not at the far default hub
// spawn. Same transition as the entry pull, in reverse: 1.4 s,
// same line, ease-out instead of ease-in, the flare fading as the
// user emerges. "Not so far" — close to the sun, not flung away.
//
// Run: node tests/sunbase-exit-spawn.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits.
// NOT provable headlessly: the 3D hub vista does not mount in
// headless swiftshader, so the transition itself is pinned here
// (spawn math, easing, flag, wiring) and the feel of it is
// Merlin's phone check: exit the base → just outside the sun,
// facing the hub, no far fling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUN_CENTER,
  SUN_RADIUS,
  SUN_BASE_TRIGGER_RADIUS,
  SUN_BASE_PULL_MS,
  SUN_BASE_EXIT_DISTANCE_M,
  SUN_BASE_EXIT_INNER_M,
  SUN_BASE_EXIT_KEY,
  sunBaseExitSpawn,
  pullEasedProgress,
  exitEasedProgress,
  markSunBaseExit,
  consumeSunBaseExit,
} from '../lib/sun-base.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const SUN = [SUN_CENTER.x, SUN_CENTER.y, SUN_CENTER.z];
const HUB = [0, 35, -80]; // ORBIT_CENTER (lib/god-orbits.js)

test('exit constants: close, not far — 75 m out, 18 m in, 1400 ms', () => {
  assert.equal(SUN_BASE_EXIT_DISTANCE_M, 75, 'spawn 75 m from the sun centre');
  assert.equal(SUN_BASE_EXIT_INNER_M, 18, 'reverse transition starts 18 m off the centre — the pull target');
  assert.equal(SUN_BASE_PULL_MS, 1400, 'same duration as the entry pull');
  assert.equal(SUN_BASE_EXIT_KEY, 'olympus:sun-base-exit:v1', 'one-shot flag key');
  // The default spawn (ORBIT_CENTER) is ~753 units from the sun;
  // the exit spawn is an order of magnitude closer.
  const defaultDist = Math.hypot(HUB[0] - SUN[0], HUB[1] - SUN[1], HUB[2] - SUN[2]);
  assert.ok(defaultDist > 700, `default spawn is far: ${defaultDist}`);
  assert.ok(SUN_BASE_EXIT_DISTANCE_M < defaultDist / 5, 'exit spawn is close by comparison');
});

test('exit spawn sits just outside the sun on the hub line, facing the hub', () => {
  const spawn = sunBaseExitSpawn({ x: HUB[0], y: HUB[1], z: HUB[2] });
  // Exactly 75 m from the sun centre.
  approx(dist(spawn.position, SUN), SUN_BASE_EXIT_DISTANCE_M, 1e-9, 'spawn distance from sun centre');
  // 7.5 m clear of the 67.5 surface.
  approx(dist(spawn.position, SUN) - SUN_RADIUS, 7.5, 1e-9, 'clearance off the surface');
  // Outside the fly-through re-entry trigger, with margin — the
  // hub must not suck the user straight back in on arrival.
  assert.ok(
    dist(spawn.position, SUN) > SUN_BASE_TRIGGER_RADIUS,
    `spawn ${dist(spawn.position, SUN)} must clear the ${SUN_BASE_TRIGGER_RADIUS} re-entry trigger`
  );
  approx(dist(spawn.position, SUN) - SUN_BASE_TRIGGER_RADIUS, 3.5, 1e-9, 'margin past the trigger');
  // Outside the collider rest (68 + 1.2 rider = 69.2) too.
  assert.ok(dist(spawn.position, SUN) > 69.2, 'spawn clears the collider rest');
  // On the line from the sun to the hub centre: the spawn, the
  // centre and the hub are collinear (cross product ~ 0).
  const toSpawn = [spawn.position[0] - SUN[0], spawn.position[1] - SUN[1], spawn.position[2] - SUN[2]];
  const toHub = [HUB[0] - SUN[0], HUB[1] - SUN[1], HUB[2] - SUN[2]];
  const cross = [
    toSpawn[1] * toHub[2] - toSpawn[2] * toHub[1],
    toSpawn[2] * toHub[0] - toSpawn[0] * toHub[2],
    toSpawn[0] * toHub[1] - toSpawn[1] * toHub[0],
  ];
  approx(Math.hypot(...cross), 0, 1e-6, 'spawn lies on the sun-to-hub line');
  // Facing the hub: lookAt IS the hub centre.
  assert.deepEqual(spawn.lookAt, HUB, 'lookAt is the hub centre — facing where they entered from');
  // Pinned numbers (the phone-check reference point).
  approx(spawn.position[0], 0, 1e-9, 'spawn x');
  approx(spawn.position[1], 146.4201, 1e-3, 'spawn y');
  approx(spawn.position[2], 588.5205, 1e-3, 'spawn z');
});

test('the reverse transition starts where the entry ended', () => {
  const spawn = sunBaseExitSpawn({ x: HUB[0], y: HUB[1], z: HUB[2] });
  // 18 m off the centre — the pull stops 18 short of it.
  approx(dist(spawn.inner, SUN), SUN_BASE_EXIT_INNER_M, 1e-9, 'inner distance from sun centre');
  // Same line as the spawn (collinear), closer in.
  approx(spawn.inner[0], 0, 1e-9, 'inner x');
  approx(spawn.inner[1], 155.7908, 1e-3, 'inner y');
  approx(spawn.inner[2], 644.7449, 1e-3, 'inner z');
  // Deep inside the glare — and inside the re-entry trigger, which
  // is why the exit branch must hold the pull guard while it runs.
  assert.ok(dist(spawn.inner, SUN) < SUN_BASE_TRIGGER_RADIUS, 'inner point is inside the trigger radius');
});

test('the spawn follows whatever hub centre it is given', () => {
  const other = { x: 100, y: 35, z: -80 };
  const spawn = sunBaseExitSpawn(other);
  approx(dist(spawn.position, SUN), SUN_BASE_EXIT_DISTANCE_M, 1e-9, 'distance follows the argument');
  assert.deepEqual(spawn.lookAt, [100, 35, -80], 'lookAt follows the argument');
  assert.notDeepEqual(spawn.position, sunBaseExitSpawn({ x: HUB[0], y: HUB[1], z: HUB[2] }).position, 'different hub, different spawn');
});

test('exit easing is the pull easing in reverse', () => {
  assert.equal(exitEasedProgress(0), 0, 'starts at 0');
  assert.equal(exitEasedProgress(SUN_BASE_PULL_MS), 1, 'lands at 1');
  assert.equal(exitEasedProgress(9999), 1, 'clamped past the end');
  assert.equal(exitEasedProgress(-5), 0, 'clamped before the start');
  // Ease-OUT: fast out of the glare, settling gently — past halfway
  // at the midpoint, the time-reversed mirror of the pull's ease-in.
  approx(exitEasedProgress(700), 0.875, 1e-9, 'halfway through, 7/8 out');
  for (const t of [0, 100, 350, 700, 1050, 1400]) {
    approx(exitEasedProgress(t), 1 - pullEasedProgress(SUN_BASE_PULL_MS - t), 1e-9, `exit(${t}) = 1 - pull(${SUN_BASE_PULL_MS - t})`);
  }
});

test('the one-shot flag: mark once, consume once, then gone', () => {
  // No sessionStorage in node: the helpers fail closed, never throw.
  assert.equal(markSunBaseExit(), false, 'mark fails closed without sessionStorage');
  assert.equal(consumeSunBaseExit(), false, 'consume fails closed without sessionStorage');

  // Stub sessionStorage (Map-backed, same contract as the browser).
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.equal(consumeSunBaseExit(), false, 'nothing to consume before a mark');
    assert.equal(markSunBaseExit(), true, 'mark stores the flag');
    assert.equal(store.get(SUN_BASE_EXIT_KEY), '1', 'flag value is 1');
    assert.equal(consumeSunBaseExit(), true, 'consume reads it once');
    assert.equal(store.has(SUN_BASE_EXIT_KEY), false, 'consume removes it');
    assert.equal(consumeSunBaseExit(), false, 'second consume finds nothing');
    markSunBaseExit();
    markSunBaseExit();
    assert.equal(consumeSunBaseExit(), true, 'double mark still consumes once');
    assert.equal(consumeSunBaseExit(), false, 'and then it is gone');
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('HomeScene: the exit branch runs before the pull branch and owns the camera', () => {
  const scene = src('../components/HomeScene.jsx');
  assert.ok(scene.includes('sunBaseExitSpawn'), 'imports the spawn helper');
  assert.ok(scene.includes('exitEasedProgress'), 'imports the reverse easing');
  const exitIdx = scene.indexOf('SUN BASE EXIT (Merlin, Nov 24 ~07:06)');
  const pullIdx = scene.indexOf('SUN BASE PULL (Merlin, Nov 13 ~22:18)');
  assert.ok(exitIdx > 0, 'exit branch comment exists');
  assert.ok(pullIdx > 0, 'pull branch comment exists');
  assert.ok(exitIdx < pullIdx, 'exit branch runs before the pull branch');
  // The branch holds the fly-through guard while the camera starts
  // deep inside the trigger radius, and fades the flare out.
  assert.ok(scene.includes('sunPullRef.current.active = true'), 'exit holds the pull guard');
  assert.ok(scene.includes('sunPullRef.current.progress = 1 - e'), 'flare fades as the user emerges');
  assert.ok(scene.includes("setLaunchState('hub_freeroam')"), 'exit hands off to freeroam');
  // The prop is threaded from the page through HomeScene.
  assert.ok(scene.includes('sunExit })'), 'SequenceController takes the sunExit prop');
  assert.ok(scene.includes('sunExit={sunExit}'), 'HomeScene passes sunExit to SequenceController');
  // The exit spawn is computed from the real hub centre.
  assert.ok(scene.includes('sunBaseExitSpawn(ORBIT_CENTER)'), 'spawn is computed from ORBIT_CENTER');
  // The exit looks at the hub, never at the sun.
  assert.ok(scene.includes('camera.lookAt(exit.lookAt.x, exit.lookAt.y, exit.lookAt.z)'), 'exit faces the hub');
});

test('hub page: the flag is consumed before the first frame and the flash reverses', () => {
  const page = src('../app/page.jsx');
  assert.ok(page.includes('consumeSunBaseExit'), 'page consumes the flag');
  assert.ok(page.includes('useLayoutEffect'), 'layout effect (before the first frame)');
  assert.ok(page.includes('sunExit={sunBaseExit}'), 'page passes the exit to HomeScene');
  // The gold overlay is the entry flash in reverse: same gradient,
  // fading over the same 1.4 s as the camera drifts out.
  assert.ok(page.includes('sunExitFlash'), 'exit flash overlay exists');
  assert.ok(page.includes('opacity: sunExitFaded ? 0 : 1'), 'flash starts gold, fades to clear');
  assert.ok(page.includes('transition: `opacity ${SUN_BASE_PULL_MS}ms ease-out`'), 'fade lasts the pull duration');
});

test('sun-base page: only hub-bound exits mark the flag', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('markSunBaseExit'), 'page marks the flag');
  assert.ok(page.includes("if (route === '/') markSunBaseExit();"), 'portal walk marks on the hub route');
  assert.ok(page.includes("if (backRoute === '/') markSunBaseExit();"), 'back orb marks on the hub route only');
  // Exactly two mark sites: the doorway/portal walk and the HUD
  // back orb. The locked-screen back button never marks (the user
  // never entered the base), and the Mars 2 way back never marks.
  const marks = page.match(/markSunBaseExit\(\);/g) || [];
  assert.equal(marks.length, 2, `exactly 2 mark sites, got ${marks.length}`);
  assert.ok(page.includes("backRoute = fromMars ? '/mars-2' : '/'"), 'Mars 2 branch still exists');
  assert.equal((page.match(/onClick=\{\(\) => router\.push\(backRoute\)\}/g) || []).length, 1, 'locked-screen back button stays a plain push');
  // The hub page never marks — it only consumes.
  const hub = src('../app/page.jsx');
  assert.ok(!hub.includes('markSunBaseExit'), 'hub page never marks the flag');
});

test('the exit spawn clears the re-entry trigger with margin', () => {
  // The fly-through check fires at <= 71.5; the spawn is at 75.
  // Any spawn inside the trigger would re-enter the base the
  // instant the hub mounted — this pins the margin.
  const spawn = sunBaseExitSpawn({ x: HUB[0], y: HUB[1], z: HUB[2] });
  const d = dist(spawn.position, SUN);
  assert.ok(d - SUN_BASE_TRIGGER_RADIUS >= 3, `margin past trigger is ${d - SUN_BASE_TRIGGER_RADIUS}, want >= 3`);
  assert.ok(d - SUN_RADIUS <= 10, `spawn is close to the surface: ${d - SUN_RADIUS} m off it, want <= 10`);
});
