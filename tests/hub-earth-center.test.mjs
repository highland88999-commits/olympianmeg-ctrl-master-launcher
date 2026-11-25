// tests/hub-earth-center.test.mjs — EARTH CENTERED TO THE GOD TOWERS
// (Merlin, 2026-11-13, from his hub video: Earth hung low and off-axis
// next to the tower ring). Earth now sits ON the hub axis — same x/z as
// ORBIT_CENTER, the ring the 24 god towers circle — raised from y -60
// to y -30. It cannot sit at ring height (y 35): the satellites orbit
// through that plane and the spawn camera sits at ORBIT_CENTER itself,
// so Earth stays 65 below the ring plane — spawn stays outside the
// planet (65 from centre vs radius 55) and outside the atmosphere
// shell gate (57.5). The Nether disc follows Earth, 35 below its
// underside; Heaven disc, Earth and Nether all share the hub axis.
// The star field grows with it (HubStars 400/200/20000, endless since
// Nov 25, 2026 — the shell rides on the camera now).
// Run: node tests/hub-earth-center.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS } from '../lib/god-orbits.js';
import { HUB_STAR_PARAMS } from '../lib/hub-stars.js';
import { HEAVEN_PORTAL, NETHER_PORTAL } from '../lib/portal/realms.js';
import { moonPositionAt, MOON_ORBIT_RADIUS } from '../lib/hub-layout.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// The atmosphere shell gate (components/NexusEarth.jsx).
const SHELL_CAMERA_MIN_DIST = 57.5;

test('Earth sits on the hub axis with the god towers', () => {
  assert.equal(EARTH_CENTER.x, ORBIT_CENTER.x, 'Earth x must match the tower-ring centre');
  assert.equal(EARTH_CENTER.z, ORBIT_CENTER.z, 'Earth z must match the tower-ring centre');
  assert.equal(EARTH_CENTER.y, -30, 'Earth y is 65 below the ring plane — as high as the lanes allow');
});

test('spawn camera stays outside Earth and outside the shell gate', () => {
  const d = Math.hypot(
    ORBIT_CENTER.x - EARTH_CENTER.x,
    ORBIT_CENTER.y - EARTH_CENTER.y,
    ORBIT_CENTER.z - EARTH_CENTER.z,
  );
  assert.ok(d > EARTH_RADIUS, `spawn must be outside the planet (dist ${d} vs radius ${EARTH_RADIUS})`);
  assert.ok(d > SHELL_CAMERA_MIN_DIST, `spawn must clear the shell gate (dist ${d} vs ${SHELL_CAMERA_MIN_DIST})`);
  assert.ok(d < 100, `spawn must stay close enough to read Earth (dist ${d})`);
});

test('Earth top stays below the tower tops and the Heaven disc', () => {
  const earthTop = EARTH_CENTER.y + EARTH_RADIUS; // 25
  assert.ok(earthTop < 74, `Earth top ${earthTop} must stay below the tower tops (~74)`);
  assert.ok(earthTop < HEAVEN_PORTAL.center[1], `Earth top ${earthTop} must stay below the Heaven disc`);
});

test('Heaven disc, Earth and Nether disc share the hub axis', () => {
  for (const [name, c] of [
    ['Heaven', HEAVEN_PORTAL.center],
    ['Nether', NETHER_PORTAL.center],
  ]) {
    assert.equal(c[0], ORBIT_CENTER.x, `${name} disc x must sit on the hub axis`);
    assert.equal(c[2], ORBIT_CENTER.z, `${name} disc z must sit on the hub axis`);
  }
  assert.equal(NETHER_PORTAL.center[0], EARTH_CENTER.x);
  assert.equal(NETHER_PORTAL.center[2], EARTH_CENTER.z);
});

test('Nether disc follows Earth, 35 below its underside', () => {
  const earthBottom = EARTH_CENTER.y - EARTH_RADIUS; // -85
  assert.equal(
    NETHER_PORTAL.center[1],
    earthBottom - 35,
    `nether disc y ${NETHER_PORTAL.center[1]} must sit 35 below Earth's underside (${earthBottom})`,
  );
});

test('the Moon still orbits the moved Earth', () => {
  const p = moonPositionAt(0);
  const d = Math.hypot(p.x - EARTH_CENTER.x, p.y - (EARTH_CENTER.y + 18), p.z - EARTH_CENTER.z);
  assert.ok(Math.abs(d - MOON_ORBIT_RADIUS) < 1e-9, `moon orbit radius ${d} must equal ${MOON_ORBIT_RADIUS}`);
});

test('every Earth-centre copy in the codebase agrees', () => {
  const nexus = src('../components/NexusEarth.jsx');
  const flight = src('../components/EarthFlightController.jsx');
  const globe = src('../components/ProceduralEarthGlobe.jsx');
  const scene = src('../components/HomeScene.jsx');
  assert.match(nexus, /const EARTH_CENTER_WORLD = new THREE\.Vector3\(0, -30, -80\);/);
  assert.match(nexus, /<group position=\{\[0, -30, -80\]\}>/);
  assert.match(flight, /export const EARTH_CENTER = new THREE\.Vector3\(0, -30, -80\);/);
  assert.match(globe, /const earthPos = new THREE\.Vector3\(0, -30, -80\);/);
  assert.match(scene, /target-position=\{\[0, -30, -80\]\}/);
  assert.ok(!nexus.includes('[0, -60, -120]'), 'NexusEarth must not still carry the old centre');
  assert.ok(!flight.includes('(0, -60, -120)'), 'EarthFlightController must not still carry the old centre');
  assert.ok(!globe.includes('(0, -60, -120)'), 'ProceduralEarthGlobe must not still carry the old centre');
});

test('the hub star field is greatly expanded', () => {
  // Endless stars (Merlin, Nov 25, 2026 — infinite hub space): the
  // finite drei <Stars> shell is gone; HubStars renders the same field
  // (400/200/20000/5) from a seeded generator and rides on the camera,
  // so the stars never end. Params live in lib/hub-stars.js now.
  const scene = src('../components/HomeScene.jsx');
  assert.ok(scene.includes('<HubStars />'), 'HomeScene must mount HubStars');
  assert.ok(!/<Stars\s+radius=/.test(scene), 'HomeScene must no longer mount the finite drei Stars shell');
  assert.ok(HUB_STAR_PARAMS.radius >= 400, `star radius ${HUB_STAR_PARAMS.radius} must be at least 400 (was 100)`);
  assert.ok(HUB_STAR_PARAMS.depth >= 200, `star depth ${HUB_STAR_PARAMS.depth} must be at least 200 (was 50)`);
  assert.ok(HUB_STAR_PARAMS.count >= 20000, `star count ${HUB_STAR_PARAMS.count} must be at least 20000 (was 7000)`);
  assert.ok(HUB_STAR_PARAMS.factor >= 5, `star factor ${HUB_STAR_PARAMS.factor} must be at least 5 (was 4)`);
});
