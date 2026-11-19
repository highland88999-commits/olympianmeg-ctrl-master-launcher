// tests/earth-walk-landing.test.mjs — LANDING SPOT (Merlin, Nov 19, 2026).
//
// "Make the new landing spot New York City as default, unless
// location enabled, then upon user location" — New York City.
//
// The on-foot Earth (/earth-walk) lands the walker at New York City
// by default; when location is on and a fix is available, the
// walker lands at the user's own position instead. The Moon hangs
// ahead of wherever the walker lands, and the scatter stays clear
// of the landing site. Run:
// node --test tests/earth-walk-landing.test.mjs (from the repo root).
// No browser, no network — pure geometry + source audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EARTH_WALK_DEFAULT_LANDING,
  EARTH_WALK_LANDING_DIR,
  EARTH_WALK_LANDING_FEET,
  EARTH_WALK_SPAWN_FEET,
  EARTH_WALK_SPAWN_OFFSET_M,
  EARTH_WALK_MOON_DIR,
  EARTH_WALK_EXCLUDE_RAD,
  earthWalkLandingDirFor,
  earthWalkLandingFeet,
  earthWalkSpawnFeet,
  earthWalkMoonDir,
  earthWalkLandingState,
  earthWalkRockPlacements,
  earthWalkPebblePlacements,
} from '../lib/earth-walk.js';
import { latLonToVec3, vec3ToLatLon, DEFAULT_LANDING_SPOT } from '../lib/geo.js';
import { sphereTangentBasis } from '../lib/planet-walker.js';

const vlen = (p) => Math.hypot(p.x, p.y, p.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const arcM = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / vlen(a) / vlen(b)))) * 55;

const read = (rel) =>
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', rel), 'utf8');

test('default landing spot is New York City (40.7128° N, 74.0060° W)', () => {
  assert.equal(EARTH_WALK_DEFAULT_LANDING.lat, 40.7128, 'NYC latitude');
  assert.equal(EARTH_WALK_DEFAULT_LANDING.lon, -74.0060, 'NYC longitude');
  assert.equal(EARTH_WALK_DEFAULT_LANDING.label, 'New York City, USA', 'NYC label');
  assert.deepEqual(
    { lat: DEFAULT_LANDING_SPOT.lat, lon: DEFAULT_LANDING_SPOT.lon },
    { lat: 40.7128, lon: -74.0060 },
    'geo.js holds the same default'
  );
});

test('NYC landing feet sit on the 55 m sphere at the real NYC lat/lon', () => {
  assert.deepEqual(EARTH_WALK_LANDING_FEET, latLonToVec3(40.7128, -74.0060, 55), 'feet = latLonToVec3(NYC)');
  assert.ok(approx(vlen(EARTH_WALK_LANDING_FEET), 55, 1e-9), `|feet| = 55 (got ${vlen(EARTH_WALK_LANDING_FEET)})`);
  const back = vec3ToLatLon(EARTH_WALK_LANDING_FEET);
  assert.ok(approx(back.lat, 40.7128, 1e-9), `round-trips to lat 40.7128 (got ${back.lat})`);
  assert.ok(approx(back.lon, -74.0060, 1e-9), `round-trips to lon -74.0060 (got ${back.lon})`);
  assert.ok(approx(vlen(EARTH_WALK_LANDING_DIR), 1, 1e-9), 'landing dir is unit');
  assert.ok(
    approx(dot(EARTH_WALK_LANDING_DIR, EARTH_WALK_LANDING_FEET) / 55, 1, 1e-9),
    'landing dir points at the landing feet'
  );
});

test('spawn feet are 3 m south of the landing site, on the sphere', () => {
  assert.equal(EARTH_WALK_SPAWN_OFFSET_M, 3, 'spawn offset stays 3 m');
  assert.ok(approx(vlen(EARTH_WALK_SPAWN_FEET), 55, 1e-9), `|spawn| = 55 (got ${vlen(EARTH_WALK_SPAWN_FEET)})`);
  assert.ok(approx(arcM(EARTH_WALK_LANDING_FEET, EARTH_WALK_SPAWN_FEET), 3, 1e-6), 'landing→spawn arc is 3 m');
  const spawnLatLon = vec3ToLatLon(EARTH_WALK_SPAWN_FEET);
  assert.ok(spawnLatLon.lat < 40.7128, `spawn is south: lat ${spawnLatLon.lat} < 40.7128`);
  // South is the rig's south — opposite the arrival facing (the
  // Moon's azimuth), not the geographic meridian: the rig's north
  // at NYC sits ~24° off true north, so the spawn's longitude
  // moves a touch. What must hold is the direction: the spawn lies
  // along −north from the landing site.
  const north = sphereTangentBasis(EARTH_WALK_LANDING_FEET, 0, 55).forward;
  const disp = {
    x: EARTH_WALK_SPAWN_FEET.x - EARTH_WALK_LANDING_FEET.x,
    y: EARTH_WALK_SPAWN_FEET.y - EARTH_WALK_LANDING_FEET.y,
    z: EARTH_WALK_SPAWN_FEET.z - EARTH_WALK_LANDING_FEET.z,
  };
  const dispLen = vlen(disp);
  assert.ok(
    dot(disp, north) / dispLen < -0.99,
    `spawn displacement runs opposite the arrival facing (dot = ${dot(disp, north) / dispLen})`
  );
  assert.deepEqual(
    earthWalkSpawnFeet(40.7128, -74.0060),
    EARTH_WALK_SPAWN_FEET,
    'spawn fn reproduces the default spawn feet'
  );
});

test('the Moon hangs 30° up, ahead of the arrival facing, at the NYC site', () => {
  assert.ok(approx(vlen(EARTH_WALK_MOON_DIR), 1, 1e-9), 'Moon dir is unit');
  const up = EARTH_WALK_LANDING_DIR;
  // 30° above the horizon = dot with up is cos 60° = 0.5.
  assert.ok(approx(dot(EARTH_WALK_MOON_DIR, up), 0.5, 1e-9), `Moon 30° up (dot with up = ${dot(EARTH_WALK_MOON_DIR, up)})`);
  // Ahead of the arrival facing: the rig faces the basis north on arrival.
  const north = sphereTangentBasis(EARTH_WALK_LANDING_FEET, 0, 55).forward;
  assert.ok(
    approx(dot(EARTH_WALK_MOON_DIR, north), Math.sin(Math.PI / 3), 1e-9),
    `Moon straight ahead (dot with north = ${dot(EARTH_WALK_MOON_DIR, north)})`
  );
  // From NYC the OLD fixed Moon sat 32.6° below the horizon — the
  // new one is above it, so the tap-to-Moon return still works.
  const oldMoon = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
  assert.ok(dot(oldMoon, up) < 0, 'old fixed Moon was below the NYC horizon');
});

test('a user location lands the same way (Redwater example)', () => {
  const lat = 53.95235;
  const lon = -113.11636;
  const feet = earthWalkLandingFeet(lat, lon);
  assert.ok(approx(vlen(feet), 55, 1e-9), '|feet| = 55 at a user location');
  const back = vec3ToLatLon(feet);
  assert.ok(approx(back.lat, lat, 1e-9) && approx(back.lon, lon, 1e-9), 'round-trips to the user lat/lon');
  const spawn = earthWalkSpawnFeet(lat, lon);
  assert.ok(approx(vlen(spawn), 55, 1e-9), '|spawn| = 55 at a user location');
  assert.ok(approx(arcM(feet, spawn), 3, 1e-6), 'spawn is 3 m south of a user location');
  const moon = earthWalkMoonDir(lat, lon);
  const up = earthWalkLandingDirFor(lat, lon);
  assert.ok(approx(vlen(moon), 1, 1e-9), 'Moon dir is unit at a user location');
  assert.ok(approx(dot(moon, up), 0.5, 1e-9), 'Moon 30° up at a user location');
});

test('the old pole site reproduces exactly (no silent geometry drift)', () => {
  const feet = earthWalkLandingFeet(90, -90);
  assert.ok(approx(feet.x, 0, 1e-9) && approx(feet.y, 55, 1e-9) && approx(feet.z, 0, 1e-9), `pole landing feet (got ${JSON.stringify(feet)})`);
  const spawn = earthWalkSpawnFeet(90, -90);
  assert.ok(approx(spawn.x, 0, 1e-9) && approx(spawn.y, 54.918202101669756, 1e-9), 'pole spawn feet');
  assert.ok(approx(spawn.z, 2.998512617974898, 1e-9), 'pole spawn is +Z south');
  const moon = earthWalkMoonDir(90, -90);
  assert.ok(approx(moon.x, 0, 1e-9) && approx(moon.y, 0.5, 1e-9), 'pole Moon dir');
  assert.ok(approx(moon.z, -Math.sqrt(3) / 2, 1e-9), 'pole Moon dir is the old (0, 0.5, −√3/2)');
});

test('scatter stays clear of wherever the walker lands', () => {
  for (const p of earthWalkRockPlacements()) {
    const d = dot(p.pos, EARTH_WALK_LANDING_DIR) / vlen(p.pos);
    assert.ok(d <= Math.cos(EARTH_WALK_EXCLUDE_RAD) + 1e-9, 'rock clear of the NYC landing site');
  }
  for (const p of earthWalkPebblePlacements()) {
    const d = dot(p.pos, EARTH_WALK_LANDING_DIR) / vlen(p.pos);
    assert.ok(d <= Math.cos(EARTH_WALK_EXCLUDE_RAD) + 1e-9, 'pebble clear of the NYC landing site');
  }
  // An explicit other site clears around IT instead (the user-location case).
  const redwaterDir = earthWalkLandingDirFor(53.95235, -113.11636);
  for (const p of earthWalkRockPlacements(redwaterDir)) {
    const d = dot(p.pos, redwaterDir) / vlen(p.pos);
    assert.ok(d <= Math.cos(EARTH_WALK_EXCLUDE_RAD) + 1e-9, 'rock clear of the resolved landing site');
  }
});

test('landing state honours the feet it is given; default is the NYC spawn', () => {
  const def = earthWalkLandingState();
  assert.deepEqual(def, { feet: { ...EARTH_WALK_SPAWN_FEET }, vr: 0, grounded: true }, 'default state at NYC spawn');
  const elsewhere = earthWalkSpawnFeet(53.95235, -113.11636);
  const st = earthWalkLandingState(elsewhere);
  assert.deepEqual(st.feet, elsewhere, 'state re-seats at the resolved feet');
  assert.equal(st.vr, 0, 're-seated walker is still');
  assert.equal(st.grounded, true, 're-seated walker is grounded');
});

test('page wiring: NYC default first, location on → user fix, never blocked', () => {
  const page = read('app/earth-walk/page.jsx');
  assert.ok(page.includes("import { fetchDevicePrefs, LOCATION_ENABLED_KEY } from '@/lib/device-prefs'"), 'reads the location pref');
  assert.ok(page.includes("import { getUserPosition } from '@/lib/geo'"), 'uses the session-memoized geolocation');
  assert.ok(page.includes('useState({ ...EARTH_WALK_DEFAULT_LANDING })'), 'mounts at the NYC default before any fix');
  // The location toggle is the master switch: the geolocation call
  // sits behind the pref check, so location-off never prompts.
  const guardAt = page.indexOf('!prefs[LOCATION_ENABLED_KEY]');
  const geoAt = page.indexOf('getUserPosition()');
  assert.ok(guardAt !== -1 && geoAt !== -1 && guardAt < geoAt, 'pref guard runs before geolocation');
  assert.ok(page.includes("label: 'Your location'"), 'resolved fix is labelled as the user location');
  assert.ok(page.includes('landing={landing}'), 'scene gets the resolved landing');
  assert.ok(page.includes('spawnFeet={spawnFeet}'), 'scene gets the resolved spawn feet');
  assert.ok(page.includes('Landed: {landing.label}'), 'HUD names where the walker landed');
  const scene = read('components/EarthWalkScene.jsx');
  assert.ok(scene.includes('earthWalkLandingState(spawnFeet)'), 'rig re-seats on the resolved spawn feet');
  assert.ok(scene.includes('earthWalkMoonDir(landing.lat, landing.lon)'), 'Moon follows the landing site');
});
