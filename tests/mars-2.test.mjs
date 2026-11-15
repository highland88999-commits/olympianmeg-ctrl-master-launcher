// tests/mars-2.test.mjs
// MARS 2 — the successor world (Merlin, Nov 15, 2026; one-word
// spec: ROVERS). Run: node --test tests/mars-2.test.mjs
//
// Covers the contract, not the pixels: the route file exists with
// a default export and the scene wired in; the rover summons,
// drives faster than walking, and dismount restores foot; the
// terrain, Mons, devils, haze and outpost are present; day/night
// runs the shared law. No Tripo anywhere in the Mars 2 files.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile, getTerrainHeight } from '../lib/mars/engine.js';
import { monsSite, MONS_HEIGHT, MONS_RADIUS, DUST_DEVIL_COUNT, DUST_DEVIL_AREA, HAZE_COUNT } from '../lib/mars/cgi.js';
import { makeDustField, devilFor } from '../lib/planet-cgi/motion.js';
import { dayNightFor, timeOfDay01 } from '../lib/day-night.js';
import {
  MARS2_ROUTE_KEY, MARS2_ROUTE_PATH, MARS2_SEED, WORLD_RADIUS,
  mars2DayFactor, outpostSite, clampToWorld,
} from '../lib/mars2/world.js';
import {
  ROVER_NAME, ROVER_ID, WALK_SPEED_MPS, ROVER_TOP_SPEED_MPS,
  ROVER_REVERSE_SPEED_MPS, ROVER_WHEEL_COUNT, ROVER_SUMMON_AHEAD_M,
  createRover, summonRover, updateRover, dismountRover,
  isRoverDriving, roverSpeedKmh, forwardOf, rightOf,
} from '../lib/mars2/rovers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
const ground = (x, z) => getTerrainHeight(x, z, profile);
const keys = (over = {}) => ({ fwd: false, back: false, left: false, right: false, ...over });

describe('mars-2 route identity', () => {
  it('route key and path are mars-2 / /mars-2', () => {
    assert.equal(MARS2_ROUTE_KEY, 'mars-2');
    assert.equal(MARS2_ROUTE_PATH, '/mars-2');
  });
  it('route file exists, default-exports the page, wires the scene', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('export default function Mars2Page'));
    assert.ok(page.includes('components/mars2/Mars2Scene'));
    assert.ok(page.includes('SUMMON ROVER') && page.includes('DISMOUNT'));
    // Route modules may only export handlers/config: no extra
    // exported consts in the page (the key lives in lib/mars2/world.js).
    assert.ok(!/^export const /m.test(page), 'page must not export extra consts');
  });
  it('scene file exists and mounts the shared day/night rig', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('DayNightRig'));
    assert.ok(scene.includes('Mars2Terrain'));
    assert.ok(scene.includes('OlympusMons'));
    assert.ok(scene.includes('Mars2Cgi'));
    assert.ok(scene.includes('Outpost'));
    assert.ok(scene.includes('RoverModel'));
  });
  it('no Tripo anywhere in the Mars 2 files', () => {
    for (const p of ['app/mars-2/page.jsx', 'components/mars2/Mars2Scene.jsx', 'lib/mars2/world.js', 'lib/mars2/rovers.js']) {
      assert.ok(!/tripo/i.test(read(p)), `${p} must not mention Tripo`);
    }
  });
});

describe('mars-2 rover: summon, drive, dismount', () => {
  it('summon places one rover ahead of the walker, facing the same way', () => {
    const walker = { x: 10, z: 26, heading: 0.6 };
    const rover = summonRover(null, walker);
    assert.equal(rover.id, ROVER_ID);
    assert.equal(rover.name, ROVER_NAME);
    assert.equal(rover.active, true);
    assert.equal(rover.heading, walker.heading);
    const f = forwardOf(walker.heading);
    assert.ok(Math.abs(rover.x - (walker.x + f.x * ROVER_SUMMON_AHEAD_M)) < 1e-9);
    assert.ok(Math.abs(rover.z - (walker.z + f.z * ROVER_SUMMON_AHEAD_M)) < 1e-9);
    assert.ok(isRoverDriving(rover));
  });
  it('summoning again moves the same rover — never a second one', () => {
    const first = summonRover(null, { x: 0, z: 0, heading: 0 });
    const again = summonRover(first, { x: 20, z: 20, heading: 1.2 });
    assert.equal(again, first);
    assert.equal(again.heading, 1.2);
  });
  it('driving is faster than walking: full throttle reaches top speed', () => {
    const rover = summonRover(null, { x: 10, z: 26, heading: 0 });
    for (let i = 0; i < 600; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground, WORLD_RADIUS);
    assert.ok(rover.speed > WALK_SPEED_MPS, `rover ${rover.speed} must beat walking ${WALK_SPEED_MPS}`);
    assert.ok(Math.abs(rover.speed - ROVER_TOP_SPEED_MPS) < 0.01);
    assert.ok(roverSpeedKmh(rover.speed) > roverSpeedKmh(WALK_SPEED_MPS) * 3);
  });
  it('driving covers ground: 5 s at throttle beats 5 s on foot', () => {
    const rover = summonRover(null, { x: 0, z: 0, heading: 0 });
    const sx = rover.x;
    const sz = rover.z;
    for (let i = 0; i < 300; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground, WORLD_RADIUS);
    const drove = Math.hypot(rover.x - sx, rover.z - sz);
    assert.ok(drove > WALK_SPEED_MPS * 5 * 2, `drove ${drove.toFixed(1)} m in 5 s`);
  });
  it('steering turns the rover only while rolling', () => {
    const parked = summonRover(null, { x: 0, z: 0, heading: 0 });
    updateRover(parked, keys({ left: true }), 1, ground, WORLD_RADIUS);
    assert.equal(parked.heading, 0);
    const rolling = summonRover(null, { x: 0, z: 0, heading: 0 });
    for (let i = 0; i < 120; i++) updateRover(rolling, keys({ fwd: true, left: true }), 1 / 60, ground, WORLD_RADIUS);
    assert.ok(rolling.heading > 0.2, `rolling rover turned ${rolling.heading.toFixed(2)} rad`);
  });
  it('reverse is capped well below forward top speed', () => {
    const rover = summonRover(null, { x: 0, z: 0, heading: 0 });
    for (let i = 0; i < 600; i++) updateRover(rover, keys({ back: true }), 1 / 60, ground, WORLD_RADIUS);
    assert.ok(rover.speed < 0 && Math.abs(rover.speed) <= ROVER_REVERSE_SPEED_MPS + 1e-9);
  });
  it('the rover stays on the terrain and inside the world rim', () => {
    const rover = summonRover(null, { x: 80, z: 0, heading: Math.PI / 2 });
    for (let i = 0; i < 1200; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground, WORLD_RADIUS);
    assert.ok(Math.hypot(rover.x, rover.z) <= WORLD_RADIUS + 1e-9);
    assert.equal(rover.y, ground(rover.x, rover.z));
    assert.ok(rover.wheelSpin > 0, 'wheels spin while driving');
  });
  it('dismount restores foot beside the rover, facing the same way', () => {
    const rover = summonRover(null, { x: 10, z: 26, heading: 0.6 });
    for (let i = 0; i < 60; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground, WORLD_RADIUS);
    const walker = dismountRover(rover);
    assert.equal(rover.active, false);
    assert.equal(rover.parked, true);
    assert.equal(rover.speed, 0);
    assert.equal(walker.heading, rover.heading);
    const r = rightOf(rover.heading);
    const dist = Math.hypot(walker.x - rover.x, walker.z - rover.z);
    assert.ok(Math.abs(dist - 1.8) < 0.01, `walker ${dist.toFixed(2)} m from rover`);
    assert.ok(Math.abs((walker.x - rover.x) - r.x * 1.8) < 1e-9);
    assert.ok(!isRoverDriving(rover));
  });
  it('the procedural rover has six wheels', () => {
    assert.equal(ROVER_WHEEL_COUNT, 6);
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('WHEEL_SPOTS'));
    assert.ok(scene.includes('camera mast') || scene.includes('mast'));
    assert.ok(scene.includes('high-gain') || scene.includes('dish'));
  });
});

describe('mars-2 terrain and landmarks', () => {
  it('terrain is real Mars ground: finite heights, dunes vary', () => {
    const samples = [];
    for (let x = -80; x <= 80; x += 10) {
      for (let z = -80; z <= 80; z += 10) {
        const h = ground(x, z);
        assert.ok(Number.isFinite(h), `height at ${x},${z} must be finite`);
        samples.push(h);
      }
    }
    assert.ok(Math.max(...samples) - Math.min(...samples) > 2, 'dunes must vary');
  });
  it('Olympus Mons stands on the outer rise, inside the world', () => {
    const site = monsSite(profile);
    assert.ok(site.dist >= 70 && site.dist <= 78);
    assert.ok(Math.hypot(site.x, site.z) < WORLD_RADIUS);
    assert.equal(site.height, MONS_HEIGHT);
    assert.equal(site.radius, MONS_RADIUS);
  });
  it('dust devils live and die on the clock; haze and dust exist', () => {
    assert.equal(DUST_DEVIL_COUNT, 3);
    assert.ok(HAZE_COUNT >= 1);
    const now = Date.now();
    const states = [0, 1, 2].map((i) => devilFor(i, now, DUST_DEVIL_AREA));
    for (const d of states) {
      assert.ok(d.height >= 4 && d.height <= 13);
      assert.ok(d.opacity >= 0 && d.opacity <= 1);
    }
    const dust = makeDustField({ count: 50, seed: 'mars-2-test' });
    assert.equal(dust.geometry.getAttribute('position').count, 50);
  });
  it('the ARES outpost sits near spawn, clear of the Mons and basins', () => {
    const site = outpostSite(profile);
    assert.ok(site.dist >= 16 && site.dist <= 24);
    assert.ok(Math.hypot(site.x, site.z) < 40);
    assert.ok(Number.isFinite(site.y));
    for (const b of profile.basins) {
      assert.ok(Math.hypot(site.x - b.x, site.z - b.z) >= b.radius * 1.1, 'outpost must clear basins');
    }
  });
  it('clampToWorld holds the rim', () => {
    assert.deepEqual(clampToWorld(10, 10), { x: 10, z: 10, clamped: false });
    const c = clampToWorld(200, 0);
    assert.equal(c.clamped, true);
    assert.ok(Math.abs(Math.hypot(c.x, c.z) - WORLD_RADIUS) < 1e-9);
  });
});

describe('mars-2 day/night (the shared law)', () => {
  it('dayNightFor runs for the walker place: palette, sun, night 0..1', () => {
    const dn = dayNightFor(Date.now(), -33.8688, 151.2093);
    assert.ok(dn.palette);
    assert.ok(dn.night >= 0 && dn.night <= 1);
    assert.ok(Number.isFinite(dn.sun.elevationDeg));
    assert.ok(typeof dn.clock === 'string' && dn.clock.length > 0);
  });
  it('timeOfDay01 is 0..1 and the day factor follows it (night 0, day 1)', () => {
    const t = timeOfDay01(Date.now(), -33.8688, 151.2093);
    assert.ok(t >= 0 && t < 1);
    assert.ok(Math.abs(mars2DayFactor(0.5) - 1) < 1e-9, 'noon is full day');
    assert.ok(Math.abs(mars2DayFactor(0.0) - 0) < 1e-9, 'midnight is full night');
    const f = mars2DayFactor(t);
    assert.ok(f >= 0 && f <= 1);
  });
});
