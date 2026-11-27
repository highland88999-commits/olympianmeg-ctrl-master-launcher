// Part 13 — perfect-circle orbit rings + exponential ring placement.
// The hub's orbit ring must read as a perfect circle when scrolled out,
// and new planets join the ring matching their distance, on rings whose
// radii grow exponentially outward from the hub at the centre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORBIT_RING_GROWTH,
  HUB_EDGE_RADIUS,
  HUB_ORBIT_RING_RADII,
  HUB_ORBIT_RING_COUNT,
  hubOrbitRingRadius,
  hubOrbitRingBoundary,
  ringIndexForDistance,
  placePlanetOnRing,
  orbitRingBillboardBlend,
  ORBIT_RING_BILLBOARD_NEAR,
  ORBIT_RING_BILLBOARD_FAR,
} from '../lib/hub-orbit-rings.js';
import {
  PLANETS,
  ORBIT_CENTER,
  GOD_BANDS,
  MAX_BAND_RADIUS,
  menuSatellitePosition,
  orbitPositionFor,
} from '../lib/god-orbits.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// --- The exponential family ------------------------------------------------

test('growth factor is 2 (measured off Merlin\'s drawing: ratios ~2.6/2.1/1.4, mean ~2.0)', () => {
  assert.equal(ORBIT_RING_GROWTH, 2);
});

test('hub edge is the outermost god lane plus satellite bulk — the hub is not rebuilt', () => {
  assert.equal(MAX_BAND_RADIUS, 231);
  assert.ok(approx(HUB_EDGE_RADIUS, 231 + 14.7));
  assert.equal(GOD_BANDS.length, 24);
  assert.equal(ORBIT_CENTER.x, 0);
  assert.equal(ORBIT_CENTER.y, 35);
  assert.equal(ORBIT_CENTER.z, -80);
});

test('ring radii follow r_n = r_0 x k^n, strictly increasing, gaps growing', () => {
  assert.equal(HUB_ORBIT_RING_COUNT, 3);
  assert.deepEqual(
    HUB_ORBIT_RING_RADII.map((r) => Math.round(r * 10) / 10),
    [491.4, 982.8, 1965.6]
  );
  for (let n = 1; n <= 3; n++) {
    assert.ok(approx(hubOrbitRingRadius(n), HUB_EDGE_RADIUS * 2 ** n));
    assert.ok(approx(hubOrbitRingRadius(n + 1) / hubOrbitRingRadius(n), 2));
  }
  const gaps = HUB_ORBIT_RING_RADII.map((r, i) =>
    i === 0 ? r - HUB_EDGE_RADIUS : r - HUB_ORBIT_RING_RADII[i - 1]
  );
  assert.ok(gaps[0] < gaps[1] && gaps[1] < gaps[2], 'gaps grow outward: ' + gaps.join(', '));
});

test('ring boundaries sit at the geometric midpoints between rings', () => {
  assert.ok(approx(hubOrbitRingBoundary(1), Math.sqrt(491.4 * 982.8), 0.5));
  assert.ok(approx(hubOrbitRingBoundary(2), Math.sqrt(982.8 * 1965.6), 0.5));
});

// --- Placement by distance -------------------------------------------------

test('ringIndexForDistance: near -> inner, far -> outer, open-ended', () => {
  assert.equal(ringIndexForDistance(100), 1);
  assert.equal(ringIndexForDistance(344), 1);
  assert.equal(ringIndexForDistance(694), 1);
  assert.equal(ringIndexForDistance(696), 2);
  assert.equal(ringIndexForDistance(1389), 2);
  assert.equal(ringIndexForDistance(1391), 3);
  assert.equal(ringIndexForDistance(3000), 4);
  assert.equal(ringIndexForDistance(0), 1);
  assert.equal(ringIndexForDistance(-5), 1);
  assert.equal(ringIndexForDistance(NaN), 1);
});

test('existing worlds keep their places: the rule only assigns, nothing moves', () => {
  // Every existing house planet, run through the rule, lands on a ring —
  // and its TABLE position is untouched (placePlanetOnRing never mutates).
  const expected = {
    mercury: 1, vesta: 1, tempest: 1, venus: 1,
    jupiter: 1, saturn: 1, uranus: 2, neptune: 2,
  };
  for (const p of PLANETS) {
    const before = { ...p.center };
    const placed = placePlanetOnRing(p.center);
    assert.equal(placed.ringIndex, expected[p.key], p.key);
    assert.deepEqual(p.center, before, p.key + ' table position untouched');
    assert.ok(approx(dist(placed.center, ORBIT_CENTER), placed.radius),
      p.key + ' snapped onto its ring');
    // Direction from the hub is preserved — only the distance changes.
    const d0 = { x: p.center.x - ORBIT_CENTER.x, y: p.center.y - ORBIT_CENTER.y, z: p.center.z - ORBIT_CENTER.z };
    const d1 = { x: placed.center.x - ORBIT_CENTER.x, y: placed.center.y - ORBIT_CENTER.y, z: placed.center.z - ORBIT_CENTER.z };
    const cross = Math.hypot(
      d0.y * d1.z - d0.z * d1.y,
      d0.z * d1.x - d0.x * d1.z,
      d0.x * d1.y - d0.y * d1.x
    );
    assert.ok(cross < 1e-6, p.key + ' keeps its direction from the hub');
  }
});

test('a new planet at the hub centre still lands on ring 1 (no direction, +X fallback)', () => {
  const placed = placePlanetOnRing({ ...ORBIT_CENTER });
  assert.equal(placed.ringIndex, 1);
  assert.ok(approx(dist(placed.center, ORBIT_CENTER), placed.radius));
});

// --- The analytic home model is untouched ----------------------------------

test('analytic satellite model unchanged: orbitPositionFor still equals menuSatellitePosition', () => {
  for (let i = 0; i < GOD_BANDS.length; i++) {
    const p = menuSatellitePosition(i, 42);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    assert.ok(dist(p, ORBIT_CENTER) > 190 && dist(p, ORBIT_CENTER) < 240);
  }
  const p = orbitPositionFor('chess', 42);
  const q = menuSatellitePosition(0, 42);
  assert.ok(approx(p.x, q.x) && approx(p.y, q.y) && approx(p.z, q.z));
});

// --- Billboard blend ---------------------------------------------------------

test('billboard blend: 0 at the hub, 1 scrolled out, smooth in between', () => {
  assert.equal(orbitRingBillboardBlend(0), 0);
  assert.equal(orbitRingBillboardBlend(ORBIT_RING_BILLBOARD_NEAR), 0);
  assert.equal(orbitRingBillboardBlend(ORBIT_RING_BILLBOARD_FAR), 1);
  assert.equal(orbitRingBillboardBlend(5000), 1);
  assert.ok(approx(orbitRingBillboardBlend(475), 0.5));
  const a = orbitRingBillboardBlend(300);
  const b = orbitRingBillboardBlend(475);
  const c = orbitRingBillboardBlend(650);
  assert.ok(a > 0 && a < b && b < c && c < 1, 'monotonic 0 -> 1');
});

// --- Projection: why the old ring read as an ellipse, and the fix -----------

const FOV = 52 * Math.PI / 180;
const ASPECT = 720 / 1558;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
// Physical screen-space w/h of a circle (radius R, centre O, plane basis
// u/v) seen from camPos through a perspective camera. Tolerance: 2%.
function screenWH(camPos, O, R, u, v) {
  const fwd = norm(sub(O, camPos));
  let right = cross(fwd, { x: 0, y: 1, z: 0 });
  if (Math.hypot(right.x, right.y, right.z) < 1e-6) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = cross(right, fwd);
  const tanV = Math.tan(FOV / 2);
  const tanH = tanV * ASPECT;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i <= 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    const p = {
      x: O.x + R * Math.cos(a) * u.x + R * Math.sin(a) * v.x,
      y: O.y + R * Math.cos(a) * u.y + R * Math.sin(a) * v.y,
      z: O.z + R * Math.cos(a) * u.z + R * Math.sin(a) * v.z,
    };
    const d = sub(p, camPos);
    const zc = dot(d, fwd);
    assert.ok(zc > 0, 'ring point behind camera');
    const nx = dot(d, right) / (tanH * zc);
    const ny = dot(d, up) / (tanV * zc);
    minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
    minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
  }
  return ((maxX - minX) * ASPECT) / (maxY - minY);
}
const HORIZONTAL = { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 } };
function billboardBasis(camPos, O) {
  const n = norm(sub(camPos, O));
  const ref = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = norm(cross(ref, n));
  return { u, v: cross(n, u) };
}

test('cause is perspective, not geometry: horizontal ring squashes as elevation drops', () => {
  const O = ORBIT_CENTER;
  const R = 213; // mean god lane
  const topDown = { x: 0, y: 1235, z: -80 };
  const oblique25 = { x: 0, y: 35 + 1270 * Math.sin(25 * Math.PI / 180), z: -80 + 1270 * Math.cos(25 * Math.PI / 180) };
  const low10 = { x: 1000 * Math.cos(10 * Math.PI / 180), y: 35 + 1000 * Math.sin(10 * Math.PI / 180), z: -80 };
  assert.ok(approx(screenWH(topDown, O, R, HORIZONTAL.u, HORIZONTAL.v), 1.0, 0.02));
  // f_20 in Merlin's video reads ~2.28 wide:tall — the projection agrees.
  assert.ok(approx(screenWH(oblique25, O, R, HORIZONTAL.u, HORIZONTAL.v), 2.34, 0.1));
  assert.ok(screenWH(low10, O, R, HORIZONTAL.u, HORIZONTAL.v) > 5);
});

test('billboarded ring reads as a perfect circle (w/h 1.00 +/- 0.02) at every camera angle', () => {
  const O = ORBIT_CENTER;
  const R = 213;
  const cams = [
    { x: 0, y: 1235, z: -80 }, // top-down
    { x: 0, y: 35 + 1270 * Math.sin(25 * Math.PI / 180), z: -80 + 1270 * Math.cos(25 * Math.PI / 180) },
    { x: 800 * Math.cos(45 * Math.PI / 180), y: 35 + 800 * Math.sin(45 * Math.PI / 180), z: -80 },
    { x: 1000 * Math.cos(10 * Math.PI / 180), y: 35 + 1000 * Math.sin(10 * Math.PI / 180), z: -80 },
    { x: 2000 * Math.cos(10 * Math.PI / 180), y: 35 + 2000 * Math.sin(10 * Math.PI / 180), z: -80 },
    { x: -900, y: 35 + 900 * Math.sin(60 * Math.PI / 180), z: -80 - 900 * Math.cos(60 * Math.PI / 180) },
  ];
  for (const cam of cams) {
    const bb = billboardBasis(cam, O);
    assert.ok(approx(screenWH(cam, O, R, bb.u, bb.v), 1.0, 0.02),
      'billboard w/h at cam ' + JSON.stringify(cam));
  }
  // The exponential rings are perfect circles too, at their own radii.
  for (const RR of HUB_ORBIT_RING_RADII) {
    const cam = { x: 0, y: 35 + 3000 * Math.sin(20 * Math.PI / 180), z: -80 + 3000 * Math.cos(20 * Math.PI / 180) };
    const bb = billboardBasis(cam, O);
    assert.ok(approx(screenWH(cam, O, RR, bb.u, bb.v), 1.0, 0.02), 'ring ' + RR);
  }
});

// --- Component wiring ---------------------------------------------------------

test('GodOrbitRings billboards the assembly and draws the exponential rings', () => {
  const src = readFileSync('components/GodOrbitRings.jsx', 'utf8');
  assert.ok(src.includes('setFromUnitVectors'), 'camera-facing alignment');
  assert.ok(src.includes('.slerp('), 'smooth home <-> billboard morph');
  assert.ok(src.includes('-RING_SPIN * orbitTime()'), 'counter-rotation kept (analytic clock)');
  assert.ok(src.includes('orbitRingBillboardBlend'), 'distance blend');
  assert.ok(src.includes('HUB_ORBIT_RING_RADII'), 'exponential rings rendered');
  assert.ok(src.includes('getWorldPosition'), 'colliders follow the rendered satellites');
  assert.ok(!src.includes('router.push') && !src.includes('onLaunch'), 'no launch wiring');
});
