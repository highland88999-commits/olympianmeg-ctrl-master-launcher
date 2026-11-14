// tests/planets-day-night.test.mjs
// Planets day/night (Merlin, 2026-11-14): Earth 1, Earth 3, Mars
// and the Moon all run the SAME real-clock cycle as Earth 2
// (lib/day-night.js), each keeping its own look. Jupiter has no
// walkable scene, so it is pinned as SKIPPED, not wired.
//
// The scenes are R3F / plain-three and cannot be imported in
// node, so the wiring is pinned two ways: (1) the shared law
// values that drive each scene, at instants whose answer is
// known; (2) a source audit that the scene file actually calls
// the law and that the old look / manual controls survived.
//
// Run: node --test tests/planets-day-night.test.mjs (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

import { timeOfDay01, moonPhaseDaylight } from '../lib/day-night.js';

const NOON_EQUINOX = Date.UTC(2026, 2, 20, 12, 0);
const MIDNIGHT_EQUINOX = Date.UTC(2026, 2, 20, 0, 0);

const nexusEarth = readFileSync('components/NexusEarth.jsx', 'utf8');
const newEarth = readFileSync('app/new-earth/scene.js', 'utf8');
const marsPage = readFileSync('app/mars/page.jsx', 'utf8');
const moonScene = readFileSync('components/MoonScene.jsx', 'utf8');

// marsSky's own arc (components/mars/MarsScene.jsx): dayF is a
// smoothstep of sin((t - 0.25) * 2π). Recomputed here from the
// law's t so the test pins the DRIVE, not a copy of the scene.
function marsDayF(t) {
  const elev = Math.sin((t - 0.25) * Math.PI * 2);
  const s = Math.max(0, Math.min(1, (elev + 0.06) / 0.34));
  return s * s * (3 - 2 * s);
}

// The Moon scene's scaling (components/MoonScene.jsx): full moon
// keeps the built 2.2, new moon floors at 0.05.
function moonSunlight(dateMs) {
  return 0.05 + 2.15 * moonPhaseDaylight(dateMs);
}

test('Mars: real noon drives marsSky to full day, real midnight to full night', () => {
  const noonT = timeOfDay01(NOON_EQUINOX, 0, 0);
  assert.ok(noonT > 0.48 && noonT < 0.52, `noon t ${noonT}`);
  assert.equal(marsDayF(noonT), 1, 'noon is full day');
  const midT = timeOfDay01(MIDNIGHT_EQUINOX, 0, 0);
  assert.ok(midT < 0.02 || midT > 0.98, `midnight t ${midT}`);
  assert.equal(marsDayF(midT), 0, 'midnight is full night');
});

test('Mars: the page drives time from the shared law and keeps the manual controls', () => {
  assert.ok(marsPage.includes('timeOfDay01'), 'page calls timeOfDay01');
  assert.ok(marsPage.includes('requestDayNightPlace'), 'page asks for the place once');
  assert.ok(marsPage.includes('setInterval(applyRealTime, 10000)'), 'real time refreshes every 10 s');
  assert.ok(marsPage.includes('setManualTime'), 'slider/presets go through a manual setter');
  assert.ok(marsPage.includes('REAL TIME'), 'a REAL TIME button hands the clock back');
  assert.ok(marsPage.includes('type="range"'), 'the time slider still exists');
  assert.ok(marsPage.includes('"Dawn"'), 'the Dawn/Day/Dusk/Night presets still exist');
  assert.ok(marsPage.includes('liveTime ? " · LIVE" : " · MANUAL"'), 'the clock says LIVE or MANUAL');
});

test('Moon: full moon keeps full daylight, new moon floors at 0.05, never black', () => {
  // Known moons: new 2000-01-06 18:14 UTC, full 2000-01-21 04:40 UTC.
  const full = moonSunlight(Date.UTC(2000, 0, 21, 4, 40));
  assert.ok(full > 2.09 && full <= 2.2, `full-moon sunlight ${full}`);
  const fresh = moonSunlight(Date.UTC(2000, 0, 6, 18, 14));
  assert.ok(fresh >= 0.05 && fresh < 0.16, `new-moon sunlight ${fresh}`);
});

test('Moon: the scene scales its hard sunlight by the real phase and keeps Earth + black sky', () => {
  assert.ok(moonScene.includes('moonPhaseDaylight'), 'scene calls moonPhaseDaylight');
  assert.ok(moonScene.includes('0.05 + 2.15'), 'scene scales 0.05 + 2.15 × daylight');
  assert.ok(moonScene.includes('setInterval(applyPhase, 10000)'), 'phase refreshes every 10 s');
  assert.ok(moonScene.includes('intensity={sunlight}'), 'the directional light takes the scaled value');
  assert.ok(moonScene.includes('position={[50, 80, 40]}'), 'the sun position is unchanged');
  assert.ok(moonScene.includes('color="#fff2dd"'), 'the hard white colour is unchanged');
  assert.ok(moonScene.includes('EARTH_POS'), 'Earth still hangs in the sky');
});

test('Earth 1: the street sky dome follows the real sun vector, shader kept', () => {
  assert.ok(nexusEarth.includes('sunVector(Date.now()'), 'dome driven by sunVector(now)');
  assert.ok(nexusEarth.includes('requestDayNightPlace'), 'place asked once');
  assert.ok(nexusEarth.includes('setInterval(updateSun, 1000)'), 'sun refreshes ~once a second');
  assert.ok(nexusEarth.includes('mat.uniforms.sunDirection.value.set(v.x, v.y, v.z)'), 'uniform takes the real vector');
  assert.ok(nexusEarth.includes('nightBlue'), 'the night-blue floor survives');
  assert.ok(nexusEarth.includes('skyBlue'), 'the blue-day sky survives');
});

test('Earth 3: the scene drives background/fog/hemi/sun + the sun disc from the law, blue day kept', () => {
  assert.ok(newEarth.includes('dayNightFor(Date.now()'), 'scene calls dayNightFor(now)');
  assert.ok(newEarth.includes('applyDayNightRig('), 'scene drives the rig from the palette');
  assert.ok(newEarth.includes('requestDayNightPlace'), 'place asked once');
  assert.ok(newEarth.includes('SUN_DISC_DIST'), 'the sun disc keeps its built distance');
  assert.ok(newEarth.includes('ctx.sunDisc.position.set('), 'the disc rides the real sun vector');
  assert.ok(newEarth.includes('ctx.sunDisc.visible = sunUp'), 'the disc sets below the horizon');
  assert.ok(newEarth.includes('ctx.skyDomeMat'), 'the baked sky dome is tinted by the day factor');
  assert.ok(newEarth.includes('0x9fd0e8'), 'the blue-day background is still the starting sky');
  assert.ok(newEarth.includes('refreshDayNight(performance.now())'), 'the refresh runs in tick()');
});

test('Jupiter: no walkable scene exists, so there is nothing to light', () => {
  assert.equal(existsSync('app/jupiter'), false, 'no /jupiter route');
  assert.equal(existsSync('components/JupiterScene.jsx'), false, 'no Jupiter scene component');
  const componentFiles = readdirSync('components', { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  assert.ok(!componentFiles.some((n) => /jupiter/i.test(n)), 'no Jupiter file anywhere under components/');
  assert.ok(existsSync('app/mars'), 'sanity: Mars route exists');
  assert.ok(existsSync('app/moon'), 'sanity: Moon route exists');
  assert.ok(existsSync('app/new-earth'), 'sanity: Earth 3 route exists');
});
