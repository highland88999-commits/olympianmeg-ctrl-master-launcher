// tests/shadow-realm-orbit.test.mjs — Headless tests for the Shadow Realm
// orbit-camera overhaul (Merlin's 2026-10-03 ask).
// Run: node tests/shadow-realm-orbit.test.mjs (from the repo root).
// No browser, no network — asserts on the pure orbit math in
// app/shadow-realm/orbit.js plus source-level checks that scene.jsx wires
// the gestures and page.jsx dropped the steer pads, killed the iOS
// hold-to-select callout, and kept everything else (BOOST, pause, tilt,
// gyro look).
//
// Merlin's directives under test:
//   1. Orbit controls on ALL Tron tracks (drag = orbit camera around rider,
//      pinch = dolly) — implemented once in RealmScene, which is
//      track-agnostic, so all 20 TRACKS entries get it.
//   2. Steering buttons REMOVED — tilt is the steering now.
//   3. iOS long-press callout disabled (no Copy/Look Up menu over the realm).
//   4. Solid-geometry law: the orbiting camera never clips through geometry
//      (clamped distance + elevation).
//   5. No gesture conflicts: drag = orbit, device rotation = gyro look,
//      tilt = steering.

import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import {
  createOrbit,
  resetOrbit,
  applyDrag,
  applyPinch,
  applyWheel,
  orbitCamera,
  ORBIT_MIN_DIST,
  ORBIT_MAX_DIST,
  ORBIT_MIN_ELEV_DEG,
  ORBIT_MAX_ELEV_DEG,
  ORBIT_YAW_PER_PX,
  ORBIT_ELEV_PER_PX,
} from '../app/shadow-realm/orbit.js';
import { TRACKS, TRACK_COUNT } from '../app/shadow-realm/tracks.js';

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

const SRC = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sceneSrc = SRC('../app/shadow-realm/scene.jsx');
const pageSrc = SRC('../app/shadow-realm/page.jsx');
const orbitSrc = SRC('../app/shadow-realm/orbit.js');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- orbit state ---

ok('createOrbit: zeroed offsets (legacy chase by default)', () => {
  assert.deepStrictEqual(createOrbit(), { yaw: 0, dDist: 0, dElev: 0 });
});

ok('resetOrbit: zeroes an orbited state', () => {
  const o = createOrbit();
  applyDrag(o, 120, -40);
  applyPinch(o, 0.5);
  resetOrbit(o);
  assert.deepStrictEqual(o, { yaw: 0, dDist: 0, dElev: 0 });
});

// --- drag: OrbitControls grab-the-world ---

ok('applyDrag: drag right swings the camera so the world follows the finger', () => {
  const o = createOrbit();
  applyDrag(o, 100, 0);
  assert.ok(approx(o.yaw, -100 * ORBIT_YAW_PER_PX), `yaw=${o.yaw}`);
  assert.ok(o.yaw < 0, 'yaw decreases on drag-right');
});

ok('applyDrag: drag up drops the camera (view tilts up, OrbitControls-style)', () => {
  const o = createOrbit();
  applyDrag(o, 0, -60); // dy negative = finger moved up
  assert.ok(approx(o.dElev, -60 * ORBIT_ELEV_PER_PX), `dElev=${o.dElev}`);
  assert.ok(o.dElev < 0, 'elevation offset decreases on drag-up');
});

ok('applyDrag: ignores non-finite input (lying sensor never corrupts orbit)', () => {
  const o = createOrbit();
  applyDrag(o, NaN, 0);
  applyDrag(o, 0, Infinity);
  assert.deepStrictEqual(o, { yaw: 0, dDist: 0, dElev: 0 });
});

// --- pinch + wheel ---

ok('applyPinch: spread zooms in, pinch zooms out', () => {
  const o = createOrbit();
  applyPinch(o, 0.25); // fingers spreading
  assert.ok(o.dDist < 0, `spread should close in, dDist=${o.dDist}`);
  applyPinch(o, -0.5); // fingers pinching
  assert.ok(o.dDist > 0, `pinch should pull back, dDist=${o.dDist}`);
});

ok('applyWheel: scroll down pulls back', () => {
  const o = createOrbit();
  applyWheel(o, 120);
  assert.ok(o.dDist > 0, `dDist=${o.dDist}`);
});

ok('applyPinch/applyWheel: ignore non-finite input', () => {
  const o = createOrbit();
  applyPinch(o, NaN);
  applyWheel(o, NaN);
  assert.deepStrictEqual(o, { yaw: 0, dDist: 0, dElev: 0 });
});

// --- orbitCamera ---

const BIKE = { x: 10, z: -40 };
// Legacy chase baseline: 13 behind, 5.6 up (speed 0).
const CHASE = { x: 10, y: 5.6, z: -53 };

ok('orbitCamera: zeroed orbit reproduces the chase position EXACTLY', () => {
  const p = orbitCamera(BIKE, CHASE, createOrbit());
  assert.ok(approx(p.x, CHASE.x), `x=${p.x}`);
  assert.ok(approx(p.y, CHASE.y), `y=${p.y}`);
  assert.ok(approx(p.z, CHASE.z), `z=${p.z}`);
});

ok('orbitCamera: yaw=PI puts the camera on the opposite side of the rider', () => {
  const o = createOrbit();
  o.yaw = Math.PI;
  const p = orbitCamera(BIKE, CHASE, o);
  // Offset (0,5.6,-13) rotated PI about Y -> (0,5.6,+13), dist/elev unchanged.
  assert.ok(approx(p.x, 10), `x=${p.x}`);
  assert.ok(approx(p.y, 5.6), `y=${p.y}`);
  assert.ok(approx(p.z, -27), `z=${p.z}`);
});

ok('orbitCamera: distance clamps to [MIN_DIST, MAX_DIST]', () => {
  const o = createOrbit();
  o.dDist = -1000;
  let p = orbitCamera(BIKE, CHASE, o);
  assert.ok(approx(Math.hypot(p.x - BIKE.x, p.y, p.z - BIKE.z), ORBIT_MIN_DIST), `d=${p.y}`);
  o.dDist = 1000;
  p = orbitCamera(BIKE, CHASE, o);
  assert.ok(approx(Math.hypot(p.x - BIKE.x, p.y, p.z - BIKE.z), ORBIT_MAX_DIST));
  assert.strictEqual(ORBIT_MIN_DIST, 7);
  assert.strictEqual(ORBIT_MAX_DIST, 42);
});

ok('orbitCamera: elevation clamps to [12deg, 75deg]', () => {
  const o = createOrbit();
  o.dElev = -10; // slam down
  let p = orbitCamera(BIKE, CHASE, o);
  let elev = Math.asin(p.y / Math.hypot(p.x - BIKE.x, p.y, p.z - BIKE.z));
  assert.ok(elev >= (ORBIT_MIN_ELEV_DEG * Math.PI) / 180 - 1e-9, `elev=${elev}`);
  o.dElev = 10; // slam up
  p = orbitCamera(BIKE, CHASE, o);
  elev = Math.asin(p.y / Math.hypot(p.x - BIKE.x, p.y, p.z - BIKE.z));
  assert.ok(elev <= (ORBIT_MAX_ELEV_DEG * Math.PI) / 180 + 1e-9, `elev=${elev}`);
});

ok('orbitCamera SOLID GEOMETRY: tightest setting still clears walls+bike', () => {
  const o = createOrbit();
  o.dDist = -1000; // min distance
  o.dElev = -1000; // min elevation
  const p = orbitCamera(BIKE, CHASE, o);
  // Barrier walls are 1.15 high; camera must stay above them.
  assert.ok(p.y > 1.4, `camera y=${p.y} must clear 1.15 walls`);
  // 7 out from the rider: clear of the ~3-long bike.
  assert.ok(Math.hypot(p.x - BIKE.x, p.z - BIKE.z) > 5, 'horizontal clearance');
  // Never below the grid plane.
  assert.ok(p.y > 0, 'never under the grid');
});

ok('orbitCamera: drag actually moves the camera around the rider', () => {
  const o = createOrbit();
  applyDrag(o, 200, 0);
  const p = orbitCamera(BIKE, CHASE, o);
  assert.ok(!approx(p.x, CHASE.x) || !approx(p.z, CHASE.z), 'camera moved');
  // Still the same distance from the rider (pure orbit, no dolly).
  const d0 = Math.hypot(CHASE.x - BIKE.x, CHASE.y, CHASE.z - BIKE.z);
  const d1 = Math.hypot(p.x - BIKE.x, p.y, p.z - BIKE.z);
  assert.ok(approx(d0, d1, 1e-6), `d0=${d0} d1=${d1}`);
});

// --- all-tracks coverage ---

ok('TRACKS: 20 tracks, all rendered through the one orbit-enabled RealmScene', () => {
  assert.strictEqual(TRACK_COUNT, 20);
  assert.strictEqual(TRACKS.length, 20);
  // The scene never branches the camera per track key: one code path for all.
  // (Strip comments first — a stale doc line mentions trackKey in prose.)
  const sceneCode = sceneSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  assert.ok(!/trackKey/.test(sceneCode), 'no per-track camera branch in the scene');
  assert.ok(sceneSrc.includes('<OrbitDriver orbitRef={orbitRef} />'), 'OrbitDriver mounted in Canvas');
  assert.ok(sceneSrc.includes('orbitRef={orbitRef}'), 'orbit state passed to Rig');
});

// --- scene wiring ---

ok('scene.jsx: imports the orbit module', () => {
  assert.ok(sceneSrc.includes("from './orbit'"), 'orbit import present');
  assert.ok(sceneSrc.includes('orbitCamera'), 'orbitCamera used');
});

ok('scene.jsx: canvas is a no-browser-gesture surface', () => {
  assert.ok(sceneSrc.includes("touchAction = 'none'"), 'touch-action none on canvas');
});

ok('scene.jsx: gyro look-around untouched (lookYaw/lookPitch still drive lookAt)', () => {
  assert.ok(sceneSrc.includes('input.lookYaw'), 'lookYaw read');
  assert.ok(sceneSrc.includes('input.lookPitch'), 'lookPitch read');
  assert.ok(sceneSrc.includes('cam.lookAt(lx, ly, lz)'), 'lookAt preserved');
});

ok('scene.jsx: tilt steering channels untouched', () => {
  assert.ok(sceneSrc.includes('input.steer'), 'steer read');
  assert.ok(sceneSrc.includes('motionDrive'), 'motionDrive read');
});

// --- page: steer buttons GONE, everything else kept ---

ok('page.jsx: steering pads removed (no pad handlers, no steer glyphs)', () => {
  assert.ok(!pageSrc.includes('padDown'), 'padDown gone');
  assert.ok(!pageSrc.includes('padUp'), 'padUp gone');
  assert.ok(!pageSrc.includes('◀'), 'left steer glyph gone');
});

ok('page.jsx: BOOST kept', () => {
  assert.ok(pageSrc.includes('BOOST'), 'BOOST button kept');
});

ok('page.jsx: ride chrome kept (pause, motion toggle, fullscreen, leave)', () => {
  assert.ok(pageSrc.includes('Pause ride'), 'pause kept');
  assert.ok(pageSrc.includes('Tilt steering + gyro look'), 'motion toggle kept');
  assert.ok(pageSrc.includes('Fullscreen ride'), 'fullscreen kept');
  assert.ok(pageSrc.includes('Leave the realm'), 'leave kept');
});

ok('page.jsx: tilt steering still wired (useBikeMotion + keyboard survive)', () => {
  assert.ok(pageSrc.includes('useBikeMotion'), 'useBikeMotion kept');
  assert.ok(pageSrc.includes('ArrowLeft'), 'keyboard steering kept');
});

ok('page.jsx: iOS hold-to-select callout killed', () => {
  assert.ok(pageSrc.includes('WebkitTouchCallout'), '-webkit-touch-callout: none present');
  assert.ok(pageSrc.includes("WebkitUserSelect: 'none'"), 'user-select none present');
  const menus = (pageSrc.match(/onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/g) || []).length;
  assert.ok(menus >= 2, `contextmenu suppressed on ${menus} realm containers (menus + ride)`);
});

// --- orbit module hygiene ---

ok('orbit.js: documents the solid-geometry law', () => {
  assert.ok(/solid.geometry/i.test(orbitSrc), 'geometry law documented');
});

console.log(`\n${pass} passed`);
