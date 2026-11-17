// tests/earth1-collision.test.mjs — Earth 1 solid collision in
// DISPLAY metres (Merlin, 2026-11-16, fix sweep item 4).
//
// ROOT CAUSE (verified in code, not assumed): checkCollision
// measured with haversineM — real Earth, 111,320 m per degree —
// while the walker, bike and car all drive in display metres
// (1° ≈ 60 display m on the 55-unit globe) and the collider
// radii (scaleM/2) and player radii (walker 0.5, car half its
// lengthM) are display-metre numbers. A real-metre reading of a
// display-metre step is 1,855x too large, so the car essentially
// never collided: a 12 m building (radius 6 display m) at 10
// display m — 0.167° — read as 18,553 real m away, 2,800x past
// its 8.3 m trigger. Only gigantic assets at point-blank ever
// fired (Fuji, scaleM 3,776: radius 1,888 real m needs the car
// within 1.02 display m of its centre).
//
// Pins here:
// - haversineDisplayM reads ~60 display m per degree (same
//   display scale as lib/earth/kart.js); haversineM itself is
//   untouched and still reads real metres.
// - A collider blocks at display-metre range and clears just
//   past radius + player radius — including the 0.1° case the
//   old code read as 11,132 real m and missed.
// - moveWithCollision blocks a drive into a collider.
// - The interior door sector still passes at the door and blocks
//   at the wall, in display metres (bearing only — the door
//   math reads localOffsetsM's direction, which is invariant
//   under the 1,855x rescale).
//
// Run: node tests/earth1-collision.test.mjs (from the repo root).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPLAY_M_PER_DEGREE,
  HAVERSINE_M_PER_DISPLAY_M,
  haversineM,
  haversineDisplayM,
  publishColliders,
  checkCollision,
  moveWithCollision,
} from '../lib/earth/collision.js';

// Degrees of latitude per display metre (north/south steps keep
// the longitude fixed, so no cos(lat) factor is involved).
const DEG_PER_DISPLAY_M = 1 / DISPLAY_M_PER_DEGREE;
const BASE_LAT = 53.5;
const BASE_LON = -113.5;
const atNorth = (displayM) => ({ lat: BASE_LAT + displayM * DEG_PER_DISPLAY_M, lon: BASE_LON });
const atSouth = (displayM) => ({ lat: BASE_LAT - displayM * DEG_PER_DISPLAY_M, lon: BASE_LON });

test('display scale: ~60 display m per degree, ~1,855x real/display split', () => {
  assert.ok(Math.abs(DISPLAY_M_PER_DEGREE - 60) < 0.01,
    `DISPLAY_M_PER_DEGREE must be ~60, got ${DISPLAY_M_PER_DEGREE}`);
  assert.ok(Math.abs(HAVERSINE_M_PER_DISPLAY_M - 1855.5) < 0.5,
    `split must be ~1855.5, got ${HAVERSINE_M_PER_DISPLAY_M}`);
  // haversineDisplayM itself: one degree ≈ 60 display m (0.1%
  // slack — the 111,320 constant in the split is the rounded
  // real metres-per-degree, same as lib/earth/kart.js).
  const perDeg = haversineDisplayM(0, 0, 1, 0);
  assert.ok(Math.abs(perDeg - 60) < 0.5, `1° must read ~60 display m, got ${perDeg}`);
  assert.equal(haversineDisplayM(10, 20, 10, 20), 0);
});

test('haversineM is untouched: still real Earth metres', () => {
  const perDeg = haversineM(0, 0, 1, 0);
  assert.ok(Math.abs(perDeg - 111195) < 1, `1° must read ~111,195 real m, got ${perDeg}`);
});

test('checkCollision fires at display-metre range (12 m building, car radius 2.3)', () => {
  publishColliders([{
    lat: BASE_LAT, lon: BASE_LON, radiusM: 6,
    id: 'test-building', category: 'building', name: 'Test building',
  }]);
  // Trigger is radius + player radius = 8.3 display m.
  const inside = atNorth(5);
  const hit = checkCollision(inside.lat, inside.lon, 2.3, true);
  assert.ok(hit && hit.id === 'test-building', '5 display m out must hit');
  const outside = atNorth(10);
  assert.equal(checkCollision(outside.lat, outside.lon, 2.3, true), null,
    '10 display m out must clear (trigger 8.3)');
  // The old bug, pinned: 0.1° is 6 display m — inside the
  // trigger — but haversineM read it as 11,132 real m and missed.
  const tenthDeg = { lat: BASE_LAT + 0.1, lon: BASE_LON };
  assert.ok(haversineM(BASE_LAT, BASE_LON, tenthDeg.lat, tenthDeg.lon) > 11000,
    'sanity: the old unit really did read 0.1° as >11,000 m');
  const oldBugHit = checkCollision(tenthDeg.lat, tenthDeg.lon, 2.3, true);
  assert.ok(oldBugHit && oldBugHit.id === 'test-building',
    '0.1° (6 display m) must hit under the display unit');
});

test('moveWithCollision blocks a drive into a collider', () => {
  publishColliders([{
    lat: BASE_LAT, lon: BASE_LON, radiusM: 6,
    id: 'test-building', category: 'building', name: 'Test building',
  }]);
  const start = atNorth(20);
  const target = atNorth(5);
  const moved = moveWithCollision(start.lat, start.lon, target.lat, target.lon, 2.3, true);
  assert.equal(moved.blocked, true, 'driving into the collider must block');
  assert.ok(Math.abs(moved.lat - start.lat) < 1e-9,
    'a due-south drive into the wall must not advance (no sideways slide)');
  assert.ok(moved.hit && moved.hit.id === 'test-building');
  // A clear drive still goes through.
  const clear = moveWithCollision(start.lat, start.lon, atNorth(15).lat, atNorth(15).lon, 2.3, true);
  assert.equal(clear.blocked, false, 'a drive that stays clear must not block');
});

test('door collider: wall blocks, door passes, room is free — in display metres', () => {
  publishColliders([{
    lat: BASE_LAT, lon: BASE_LON, radiusM: 6,
    id: 'test-house', category: 'building', name: 'Test house',
    door: { bearingDeg: 180, widthM: 1.3, wallM: 2.5, interiorId: 'test-house' },
  }]);
  // Wall band is d in [radius - wall, radius + player] = [3.5, 6.5].
  const atWall = atNorth(5);
  const wallHit = checkCollision(atWall.lat, atWall.lon, 0.5, false);
  assert.ok(wallHit && wallHit.id === 'test-house', 'wall band (north, d=5) must block');
  const atDoor = atSouth(5);
  assert.equal(checkCollision(atDoor.lat, atDoor.lon, 0.5, false), null,
    'door sector (south, d=5) must pass');
  const inside = atNorth(2);
  assert.equal(checkCollision(inside.lat, inside.lon, 0.5, false), null,
    'inside the wall band (d=2) must be free');
  const outside = atNorth(8);
  assert.equal(checkCollision(outside.lat, outside.lon, 0.5, false), null,
    'outside the band (d=8) must be free');
});
