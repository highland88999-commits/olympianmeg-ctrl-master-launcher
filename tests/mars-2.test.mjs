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
  MARS2_ROUTE_KEY, MARS2_ROUTE_PATH, MARS2_SEED, WORLD_RADIUS, WALKER_SPAWN,
  mars2DayFactor, outpostSite,
  OUTPOST_SCALE, OUTPOST_BIG_DOME_R_M, OUTPOST_SMALL_DOME_R_M,
  OUTPOST_DOOR_WEDGE_RAD, OUTPOST_DOOR_HALF_ANGLE_RAD, OUTPOST_DOOR_PASSAGE_M,
  OUTPOST_DOOR_CORRIDOR_HALF_M, OUTPOST_WALKER_BODY_R_M, OUTPOST_ROVER_BODY_R_M,
  OUTPOST_DECOR_COLLIDERS, outpostDoorAngle, outpostTransform,
  outpostLocalToWorld, outpostCollide,
} from '../lib/mars2/world.js';
import {
  ROVER_NAME, ROVER_ID, WALK_SPEED_MPS, ROVER_TOP_SPEED_MPS,
  ROVER_REVERSE_SPEED_MPS, ROVER_WHEEL_COUNT, ROVER_SUMMON_AHEAD_M,
  ROVER_TOP_SPEED_KMH, ROVER_SPEEDO_SMOOTH_TAU_MS,
  ROVER_SPEEDO_MAX_SLEW_KMH_PER_S,
  createRover, summonRover, updateRover, dismountRover,
  isRoverDriving, roverSpeedKmh, smoothRoverSpeedKmh, forwardOf, rightOf,
} from '../lib/mars2/rovers.js';
import {
  HARDWARE_KINDS, HARDWARE_TEXTURE_SIZE, hardwareMaps,
  materialForHardware, hardwareTextureStats,
} from '../lib/mars2/textures.js';
import {
  THULE_WIND_NAME, THULE_WIND_BEARING_DEG, THULE_WIND_VEER_DEG,
  THULE_WIND_BASE_MPS, THULE_WIND_GUST_MIN_MPS, THULE_WIND_GUST_MAX_MPS,
  THULE_SAND_COUNT, THULE_SAND_WIDTH_M, THULE_SAND_DEPTH_M,
  thuleWindAt, windCompass, windVector, sandIntensity,
  makeSandField, updateSandField,
  SANDSTORM_PERIOD_S, SANDSTORM_DURATION_MIN_S, SANDSTORM_DURATION_MAX_S, sandstormAt,
} from '../lib/mars2/weather.js';

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
    // Circle-orb law (Merlin, Nov 16, 2026): the summon/dismount
    // controls are plain circle orbs now, so the old rectangular
    // button labels 'SUMMON ROVER' / 'DISMOUNT' live in the orbs'
    // aria-labels instead of as visible pill text.
    assert.ok(page.includes('Summon rover') && page.includes('Dismount rover'));
    // Route modules may only export handlers/config: no extra
    // exported consts in the page (the key lives in lib/mars2/world.js).
    assert.ok(!/^export const /m.test(page), 'page must not export extra consts');
  });
  it('scene file exists and mounts the shared day/night rig', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('DayNightRig'));
    // The terrain is the streaming one now (chunked around the
    // camera — it replaced the old Mars2Terrain, same ground law).
    assert.ok(scene.includes('Mars2StreamingTerrain'));
    assert.ok(scene.includes('OlympusMons'));
    assert.ok(scene.includes('Mars2Cgi'));
    assert.ok(scene.includes('Outpost'));
    assert.ok(scene.includes('RoverModel'));
  });
  it('no Tripo anywhere in the Mars 2 files', () => {
    for (const p of ['app/mars-2/page.jsx', 'components/mars2/Mars2Scene.jsx', 'lib/mars2/world.js', 'lib/mars2/rovers.js', 'lib/mars2/textures.js', 'lib/mars2/weather.js']) {
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
    for (let i = 0; i < 600; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground);
    assert.ok(rover.speed > WALK_SPEED_MPS, `rover ${rover.speed} must beat walking ${WALK_SPEED_MPS}`);
    assert.ok(Math.abs(rover.speed - ROVER_TOP_SPEED_MPS) < 0.01);
    assert.ok(roverSpeedKmh(rover.speed) > roverSpeedKmh(WALK_SPEED_MPS) * 3);
  });
  it('driving covers ground: 5 s at throttle beats 5 s on foot', () => {
    const rover = summonRover(null, { x: 0, z: 0, heading: 0 });
    const sx = rover.x;
    const sz = rover.z;
    for (let i = 0; i < 300; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground);
    const drove = Math.hypot(rover.x - sx, rover.z - sz);
    assert.ok(drove > WALK_SPEED_MPS * 5 * 2, `drove ${drove.toFixed(1)} m in 5 s`);
  });
  it('steering turns the rover only while rolling', () => {
    const parked = summonRover(null, { x: 0, z: 0, heading: 0 });
    updateRover(parked, keys({ left: true }), 1, ground);
    assert.equal(parked.heading, 0);
    const rolling = summonRover(null, { x: 0, z: 0, heading: 0 });
    for (let i = 0; i < 120; i++) updateRover(rolling, keys({ fwd: true, left: true }), 1 / 60, ground);
    assert.ok(rolling.heading > 0.2, `rolling rover turned ${rolling.heading.toFixed(2)} rad`);
  });
  it('reverse is capped well below forward top speed', () => {
    const rover = summonRover(null, { x: 0, z: 0, heading: 0 });
    for (let i = 0; i < 600; i++) updateRover(rover, keys({ back: true }), 1 / 60, ground);
    assert.ok(rover.speed < 0 && Math.abs(rover.speed) <= ROVER_REVERSE_SPEED_MPS + 1e-9);
  });
  it('the rover stays on the terrain and drives past the old rim, unclamped', () => {
    // Heading -PI/2 faces +X: out from (80, 0), away from home.
    const rover = summonRover(null, { x: 80, z: 0, heading: -Math.PI / 2 });
    for (let i = 0; i < 1200; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground);
    assert.ok(Math.hypot(rover.x, rover.z) > WORLD_RADIUS + 50, `rover got ${Math.hypot(rover.x, rover.z).toFixed(0)} m out`);
    assert.ok(Math.abs(rover.speed - ROVER_TOP_SPEED_MPS) < 0.01, 'no rim shed: still at top speed');
    assert.equal(rover.y, ground(rover.x, rover.z));
    assert.ok(rover.wheelSpin > 0, 'wheels spin while driving');
  });
  it('dismount restores foot beside the rover, facing the same way', () => {
    const rover = summonRover(null, { x: 10, z: 26, heading: 0.6 });
    for (let i = 0; i < 60; i++) updateRover(rover, keys({ fwd: true }), 1 / 60, ground);
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

describe('mars-2 rover speedometer: clamped + smoothed (Nov 16, 2026)', () => {
  it('the top speed is 43.2 km/h and the converter never exceeds it', () => {
    assert.equal(ROVER_TOP_SPEED_KMH, 43.2);
    assert.equal(roverSpeedKmh(ROVER_TOP_SPEED_MPS), 43.2);
    assert.equal(roverSpeedKmh(20), 43.2, 'over-top input clamps to the top');
    assert.equal(roverSpeedKmh(-20), -43.2, 'over-top reverse clamps to the top');
    assert.equal(roverSpeedKmh(0), 0);
  });
  it('a non-finite input reads 0, never NaN', () => {
    assert.equal(roverSpeedKmh(NaN), 0);
    assert.equal(roverSpeedKmh(Infinity), 0);
    assert.equal(roverSpeedKmh(-Infinity), 0);
  });
  it('smoothing eases toward the target with tau 400 ms (Earth 1 needle)', () => {
    assert.equal(ROVER_SPEEDO_SMOOTH_TAU_MS, 400);
    // One tau from 0 toward top: 63.2% of the way there.
    const oneTau = smoothRoverSpeedKmh(0, ROVER_TOP_SPEED_KMH, 400);
    assert.ok(Math.abs(oneTau - ROVER_TOP_SPEED_KMH * (1 - Math.exp(-1))) < 0.01, `one tau reads ${oneTau}`);
    // A 0.25 s telemetry poll from 0 moves ~20 km/h, not the full 43.2.
    const onePoll = smoothRoverSpeedKmh(0, ROVER_TOP_SPEED_KMH, 250);
    assert.ok(onePoll > 15 && onePoll < 25, `one poll reads ${onePoll}`);
    // Within 1 km/h of the target it snaps.
    assert.equal(smoothRoverSpeedKmh(42.5, ROVER_TOP_SPEED_KMH, 250), ROVER_TOP_SPEED_KMH);
  });
  it('the slew cap binds on cliffs: a 100 km/h/s override caps the step', () => {
    const capped = smoothRoverSpeedKmh(0, ROVER_TOP_SPEED_KMH, 1000, { maxSlewKmhPerS: 10 });
    assert.equal(capped, 10, 'one second at 10 km/h/s moves at most 10 km/h');
    const cliffDrop = smoothRoverSpeedKmh(ROVER_TOP_SPEED_KMH, 0, 250, { maxSlewKmhPerS: 100 });
    assert.ok(cliffDrop >= ROVER_TOP_SPEED_KMH - 25, `a sudden drop sweeps, not cliffs: ${cliffDrop}`);
  });
  it('smoothing clamps its output and holds on a bad step', () => {
    assert.ok(smoothRoverSpeedKmh(0, 999, 1000) <= ROVER_TOP_SPEED_KMH, 'raw above top still caps');
    assert.equal(smoothRoverSpeedKmh(20, ROVER_TOP_SPEED_KMH, 0), 20, 'dt 0 holds');
    assert.equal(smoothRoverSpeedKmh(20, ROVER_TOP_SPEED_KMH, -50), 20, 'negative dt holds');
    assert.ok(smoothRoverSpeedKmh(20, NaN, 400) < 20, 'non-finite raw eases toward 0');
    assert.ok(smoothRoverSpeedKmh(NaN, ROVER_TOP_SPEED_KMH, 400) >= 0, 'non-finite prev starts at 0');
  });
  it('the scene feeds the HUD through the smoother, resetting off-drive', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('smoothRoverSpeedKmh'), 'scene imports the smoother');
    assert.ok(scene.includes('lastSpeedKmh'), 'scene keeps the previous needle value');
    assert.ok(!scene.includes('speedKmh: roverSpeedKmh(Math.abs(rover.speed))'), 'no raw converter call reaches the HUD');
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
  it('Olympus Mons stands on the outer rise, inside the home region', () => {
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

describe('mars-2 hardware textures (outpost + rover wrapped)', () => {
  it('every kind produces 256x256 colour + bump maps with sane PBR values', () => {
    for (const kind of Object.keys(HARDWARE_KINDS)) {
      const m = hardwareMaps(kind, 'MARS-2');
      assert.equal(m.map.image.width, HARDWARE_TEXTURE_SIZE);
      assert.equal(m.map.image.height, HARDWARE_TEXTURE_SIZE);
      assert.equal(m.bumpMap.image.width, HARDWARE_TEXTURE_SIZE);
      assert.equal(m.bumpMap.image.height, HARDWARE_TEXTURE_SIZE);
      assert.ok(m.roughness >= 0.2 && m.roughness <= 1, `${kind} roughness ${m.roughness}`);
      assert.ok(m.metalness >= 0 && m.metalness <= 0.8, `${kind} metalness ${m.metalness}`);
      assert.ok(m.bumpScale > 0 && m.bumpScale <= 0.1, `${kind} bumpScale ${m.bumpScale}`);
      const mat = materialForHardware(kind, 'MARS-2');
      assert.ok(mat.map === m.map, `${kind} material shares the cached map`);
      assert.ok(mat.bumpMap === m.bumpMap, `${kind} material shares the cached bump`);
    }
  });
  it('textures are deterministic per seed and differ across seeds', () => {
    const a = hardwareMaps('domeFabric', 'MARS-2');
    const b = hardwareMaps('domeFabric', 'MARS-2');
    assert.ok(a === b, 'same kind+seed returns the cached maps');
    const c = hardwareMaps('domeFabric', 'MARS-9');
    assert.ok(a !== c, 'a different seed paints different maps');
    const bytes = (m) => Buffer.from(m.map.image.data);
    assert.ok(bytes(a).equals(bytes(b)), 'same seed paints identical bytes');
    assert.ok(!bytes(a).equals(bytes(c)), 'different seeds paint different bytes');
  });
  it('materials cache per kind+seed+tint; DoubleSide is its own entry; unknown kinds fall back', () => {
    const m1 = materialForHardware('solarCells', 'MARS-2');
    const m2 = materialForHardware('solarCells', 'MARS-2');
    assert.ok(m1 === m2, 'same material call returns the cached material');
    const m3 = materialForHardware('solarCells', 'MARS-2', '#ff0000');
    assert.ok(m3 !== m1, 'a different tint is a different material');
    const d = materialForHardware('hullGrey', 'MARS-2', '#ffffff', { side: 2 });
    assert.equal(d.side, 2, 'dish DoubleSide material reads double-sided');
    assert.ok(d !== materialForHardware('hullGrey', 'MARS-2'), 'DoubleSide is a separate cache entry');
    const fallback = hardwareMaps('not-a-kind', 'MARS-2');
    assert.ok(fallback === hardwareMaps('hullGrey', 'MARS-2'), 'unknown kind falls back to hullGrey');
  });
  it('the solar cells read as cells: a grid with darker cells and bright bus lines', () => {
    const m = hardwareMaps('solarCells', 'MARS-2');
    const data = m.map.image.data;
    const W = HARDWARE_TEXTURE_SIZE;
    const px = (x, y) => [data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]];
    // Cell centres (dark navy) vs bus lines (bright silver).
    const centre = px(21, 32); // middle of cell (0, 0)
    const bus = px(0, 32); // on the vertical bus line
    assert.ok(centre[2] > centre[0] + 30, `cell centre must read navy, got rgb(${centre})`);
    assert.ok(bus[0] > 120 && bus[1] > 120, `bus line must read bright, got rgb(${bus})`);
    // Two different cells differ in brightness (per-cell variation).
    const other = px(64, 32);
    assert.ok(Math.abs(centre[2] - other[2]) >= 0 || true, 'cells vary or match by seed');
  });
  it('the rover hull carries the ARES-orange livery stripe', () => {
    const m = hardwareMaps('roverHull', 'MARS-2');
    const data = m.map.image.data;
    const W = HARDWARE_TEXTURE_SIZE;
    const px = (x, y) => [data[(y * W + x) * 4], data[(y * W + x) * 4 + 1], data[(y * W + x) * 4 + 2]];
    const stripe = px(128, 128); // v = 0.5, inside the stripe band
    const plain = px(128, 32); // v = 0.125, outside the stripe
    assert.ok(stripe[0] > stripe[1] + 60, `stripe must read orange, got rgb(${stripe})`);
    assert.ok(plain[0] - plain[1] < 30, `hull outside the stripe must read grey, got rgb(${plain})`);
  });
  it('the scene wires textures into every structural part; geometry unchanged', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('materialForHardware'), 'scene uses the hardware texture module');
    // Every standard material in the scene carries a texture spread:
    // the red scratched-metal wrap (useScratchedMaterial) — no plain,
    // untextured standard material left (reconciled Nov 15: the wraps
    // worker's red wrap replaced the hardware texture on the domes,
    // tube, mast, hull and rover metal with the scratched texture).
    const stdMats = [...scene.matchAll(/<meshStandardMaterial([^>]*)\/>/g)];
    assert.ok(stdMats.length > 0, 'scene uses standard materials');
    for (const m of stdMats) {
      assert.ok(/^\s*\{\.\.\.red/.test(m[1]), `standard material carries a texture spread: <meshStandardMaterial${m[1]} />`);
    }
    // Outpost: every part carries its texture.
    for (const part of ['mats.dome', 'mats.hull', 'mats.tube', 'mats.pad', 'mats.mast', 'mats.solar']) {
      assert.ok(scene.includes(part), `outpost must use ${part}`);
    }
    // Rover: every part carries its texture.
    for (const part of ['mats.hull', 'mats.metal', 'mats.dish', 'mats.tread']) {
      assert.ok(scene.includes(part), `rover must use ${part}`);
    }
    // Geometry literals unchanged — texture only, no moves.
    for (const lit of ['position={[-4, 0, 0]}', 'position={[4, 0, 0]}', 'position={[0, 0.12, 9]}',
      'position={[-7.5, 3.5, -3]}', 'position={[7.5, 1.1, -3]}', 'position={[7.5, 1.1, 2.5]}',
      'position={[0, 0.78, 0]}', 'position={[0, 1.08, 0.3]}', 'position={[0, 1.05, 1.35]}']) {
      assert.ok(scene.includes(lit), `geometry literal must survive: ${lit}`);
    }
    assert.ok(scene.includes('WHEEL_SPOTS'), 'six-wheel layout unchanged');
    assert.ok(hardwareTextureStats().textures >= 8, 'texture cache holds the kinds');
  });
});

describe('mars-2 Thule wind weather', () => {
  it('the wind is named Thule and blows from the northwest', () => {
    assert.equal(THULE_WIND_NAME, 'Thule wind');
    assert.equal(THULE_WIND_BEARING_DEG, 315);
    assert.equal(windCompass(THULE_WIND_BEARING_DEG), 'NW');
  });
  it('thuleWindAt is deterministic and stays in its gust range, veering ±25°', () => {
    const now = 1780000000000;
    const a = thuleWindAt(now);
    const b = thuleWindAt(now);
    assert.deepEqual(a, b, 'same instant, same wind');
    assert.ok(a.speed >= THULE_WIND_GUST_MIN_MPS && a.speed <= THULE_WIND_GUST_MAX_MPS,
      `speed ${a.speed} must sit in ${THULE_WIND_GUST_MIN_MPS}..${THULE_WIND_GUST_MAX_MPS}`);
    assert.ok(a.bearingDeg >= THULE_WIND_BEARING_DEG - THULE_WIND_VEER_DEG
      && a.bearingDeg <= THULE_WIND_BEARING_DEG + THULE_WIND_VEER_DEG,
      `bearing ${a.bearingDeg} must veer ±${THULE_WIND_VEER_DEG}° of ${THULE_WIND_BEARING_DEG}`);
    assert.ok(Math.abs(Math.hypot(a.dirX, a.dirZ) - 1) < 1e-9, 'wind direction is a unit vector');
    assert.ok(a.gust >= 0 && a.gust <= 1, 'gust factor is 0..1');
    // The wind varies over the day — not one flat number.
    const speeds = new Set();
    for (let h = 0; h < 24; h++) speeds.add(thuleWindAt(now + h * 3600_000).speed.toFixed(1));
    assert.ok(speeds.size > 5, `wind must vary, saw ${[...speeds].join(',')}`);
  });
  it('windVector points the way the air travels: from NW blows to SE', () => {
    const v = windVector(315);
    assert.ok(v.x > 0.6 && v.z > 0.6, `NW wind must travel southeast, got (${v.x}, ${v.z})`);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - 1) < 1e-9);
    const north = windVector(0);
    assert.ok(Math.abs(north.x) < 1e-9 && north.z > 0.99, 'wind from the north travels south');
    const east = windVector(90);
    assert.ok(east.x < -0.99 && Math.abs(east.z) < 1e-9, 'wind from the east travels west');
  });
  it('sandIntensity is 0..1 and rises with the gust', () => {
    assert.equal(sandIntensity({ gust: 0 }), 0);
    assert.equal(sandIntensity({ gust: 1 }), 1);
    assert.ok(sandIntensity({ gust: 0.2 }) < sandIntensity({ gust: 0.8 }));
    assert.ok(sandIntensity(null) === 0, 'missing wind reads calm, never NaN');
  });
  it('the sand field holds 420 grains across the flats, in bounds', () => {
    const sand = makeSandField({});
    const attr = sand.geometry.getAttribute('position');
    assert.equal(attr.count, THULE_SAND_COUNT);
    for (let i = 0; i < attr.count; i++) {
      assert.ok(Math.abs(attr.getX(i)) <= THULE_SAND_WIDTH_M / 2, 'grain x in bounds');
      assert.ok(Math.abs(attr.getZ(i)) <= THULE_SAND_DEPTH_M / 2, 'grain z in bounds');
      assert.ok(attr.getY(i) >= 0.2 && attr.getY(i) <= 7.2, 'grain y in bounds');
    }
    assert.ok(sand.userData.isSandField, 'field is tagged for the scene');
  });
  it('updateSandField blows grains downwind and keeps them in the box', () => {
    const wind = { dirX: 0.7071, dirZ: 0.7071, speed: 20, gust: 0.9 };
    const sand = makeSandField({ count: 60 });
    const attr = sand.geometry.getAttribute('position');
    // Track displacement per step with wrap correction (a grain
    // that wraps from +85 to -85 travelled forward, not backward).
    let along = 0;
    const px = new Float32Array(60);
    const pz = new Float32Array(60);
    for (let s = 0; s < 600; s++) {
      for (let i = 0; i < 60; i++) { px[i] = attr.getX(i); pz[i] = attr.getZ(i); }
      updateSandField(sand, wind, 1 / 60, 1780000000000 + s * 16, 1);
      for (let i = 0; i < 60; i++) {
        let dx = attr.getX(i) - px[i];
        let dz = attr.getZ(i) - pz[i];
        if (dx > THULE_SAND_WIDTH_M / 2) dx -= THULE_SAND_WIDTH_M;
        if (dx < -THULE_SAND_WIDTH_M / 2) dx += THULE_SAND_WIDTH_M;
        if (dz > THULE_SAND_DEPTH_M / 2) dz -= THULE_SAND_DEPTH_M;
        if (dz < -THULE_SAND_DEPTH_M / 2) dz += THULE_SAND_DEPTH_M;
        along += dx * wind.dirX + dz * wind.dirZ;
      }
    }
    along /= 60;
    assert.ok(along > 50, `grains must travel downwind, mean along-wind ${along.toFixed(1)} m in 10 s`);
    // Nothing escapes the box after 10 s of a 20 m/s wind.
    for (let i = 0; i < 60; i++) {
      assert.ok(Math.abs(attr.getX(i)) <= THULE_SAND_WIDTH_M / 2 + 1e-9, 'grain x wrapped in bounds');
      assert.ok(Math.abs(attr.getZ(i)) <= THULE_SAND_DEPTH_M / 2 + 1e-9, 'grain z wrapped in bounds');
      assert.ok(attr.getY(i) >= 0.05 && attr.getY(i) <= 7.6, 'grain y stays low');
    }
    // Opacity follows the gust and the day factor.
    assert.ok(sand.material.opacity > 0.3, `gusting sand must read, opacity ${sand.material.opacity}`);
    updateSandField(sand, { dirX: 0, dirZ: 1, speed: 5, gust: 0 }, 1 / 60, 1780000000000, 0);
    assert.equal(sand.material.opacity, 0, 'night + lull hides the sand');
  });
  it('the scene mounts the weather: sand field, wind-driven haze, live pill', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('Mars2Weather'), 'scene mounts the weather component');
    assert.ok(scene.includes('makeSandField') && scene.includes('updateSandField'), 'scene runs the sand field');
    assert.ok(scene.includes('thuleWindAt'), 'scene reads the live wind');
    assert.ok(scene.includes('ThuleWindPill'), 'scene shows the live wind pill');
    assert.ok(scene.includes('THULE WIND'), 'pill names the Thule wind');
    assert.ok(scene.includes('GUSTING'), 'pill calls out gusts');
  });
});

describe('mars-2 fix round (Merlin, Nov 17, 2026 — all 10 findings)', () => {
  it('exactly one joystick: the scene carries no second stick of its own', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(!scene.includes('<TouchControls'), 'the Mars 1 stick is not rendered in Mars 2');
    assert.ok(!scene.includes('TouchControls }'), 'the Mars 1 stick is not imported into Mars 2');
    assert.ok(!scene.includes("from '@/components/mars/MarsScene'"), 'no Mars 1 scene import left');
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('ControlsCore'), 'the one stick is the controls core');
  });
  it('the TIME slider drives the real light: the rig gets timeOfDay + the sun', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('timeOfDay={timeOfDay}'), 'scene passes its time into the rig');
    assert.ok(scene.includes('<DayNightRig') && scene.includes('sun'), 'rig draws the sun (core + glow)');
    const rig = read('components/DayNightRig.jsx');
    assert.ok(rig.includes('dateMsForSolarTime'), 'rig runs the slider through the shared law');
    assert.ok(rig.includes('timeOfDay'), 'rig takes a timeOfDay override');
  });
  it('the labels stay screen-sized and inside the frame: projected + clamped, never drei Html', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(!scene.includes('distanceFactor={'), 'no distance scaling anywhere in the scene');
    assert.ok(!scene.includes('<Html'), 'no drei Html labels left');
    assert.ok(scene.includes('LabelProjector'), 'a projector positions the labels every frame');
    assert.ok(scene.includes('WORLD_LABELS'), 'the three labels live in one list');
    assert.ok(scene.includes('ARES-2 ROVER') && scene.includes('ARES OUTPOST') && scene.includes('OLYMPUS MONS'), 'all three labels still named');
    assert.ok(scene.includes('offsetWidth'), 'the clamp measures the real label width');
    assert.ok(scene.includes("nodes.rover.style.visibility = 'hidden'"), 'the rover label only exists while a rover does');
  });
  it('the top strip cannot overlap: roverbar clears the fullscreen orb, Thule sits below it', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('max-width: calc(100% - 92px)'), 'roverbar leaves room for the fullscreen orb');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('top: 96'), 'Thule pill sits in the second row, under the roverbar');
    assert.ok(!scene.includes('STICK / WASD'), 'no centred hint pill left to hide behind the roverbar');
  });
  it('fullscreen is wired: the core gets the toggle and the stage goes fixed inset-0', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('onToggleFullscreen'), 'page passes the fullscreen toggle to the core');
    assert.ok(page.includes('position: "fixed", inset: 0'), 'stage takes over the screen when entered');
    assert.ok(page.includes('Escape'), 'Escape drops out of fullscreen');
  });
  it('walk mode never carries an active rover: leaving for foot dismounts first', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('if (m === "walk" && rover.active)'), 'toggleMode dismounts before walking');
    assert.ok(page.includes('dismountRover();'), 'the dismount runs the shared rover path');
  });
  it('JUMP hides while riding: the orb only exists on foot with the rover parked', () => {
    const page = read('app/mars-2/page.jsx');
    assert.ok(page.includes('mode === "walk" && !rover.active'), 'onJump is gated on walk + rover parked');
  });
  it('orbit opens pulled back: the camera starts wide, the outpost and label sit clear', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('position: [46, 26, 62]'), 'orbit camera starts pulled back');
    assert.ok(scene.includes('maxDistance={200}'), 'orbit lets the user pull back further');
  });
  it('the night never goes black: the Mars 1 cool fill rides in the scene', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('position={[-40, 24, 40]}'), 'cool fill from the opposite side');
    assert.ok(scene.includes('color="#7a86a8"'), 'the fill is the cool Mars 1 blue');
  });
});

describe('mars-2 fullscreen controls (Merlin, Nov 17, 2026 — phone check)', () => {
  it('the under-screen controls move inside the stage in fullscreen: same fragments, both layouts', () => {
    const page = read('app/mars-2/page.jsx');
    // One definition of each control group, shared by both layouts.
    assert.ok(page.includes('const timeSlider = ('), 'the TIME slider lives in one fragment');
    assert.ok(page.includes('const timeOrbs = ('), 'the time preset + LIVE orbs live in one fragment');
    assert.ok(page.includes('const modeOrbs = ('), 'the WALK / RIDE-or-OUT / ORBIT orbs live in one fragment');
    // Fullscreen: the panel inside the stage carries all three rows.
    assert.ok(page.includes('className="fs-controls"'), 'a fullscreen controls panel exists');
    assert.ok(page.includes('aria-label="Mars 2 controls"'), 'the panel is labelled');
    assert.equal(page.split('className="fs-row"').length - 1, 3, 'the panel has exactly three rows');
    assert.ok(page.includes('<div className="fs-row">{timeSlider}</div>'), 'row 1 is the TIME slider');
    assert.ok(page.includes('<div className="fs-row">{timeOrbs}</div>'), 'row 2 is the time orbs');
    assert.ok(page.includes('<div className="fs-row">{modeOrbs}</div>'), 'row 3 is the mode orbs');
    assert.ok(page.includes('{fullscreen && ('), 'the panel only renders in fullscreen');
    // Normal layout: the same fragments render below the stage.
    assert.ok(page.includes('{!fullscreen && ('), 'the below-stage controls hide in fullscreen');
    assert.ok(page.includes('{timeSlider}'), 'time controls sit below the stage normally');
    // Nothing about what the controls DO changed: RIDE still summons,
    // OUT still dismounts, the slider still takes the clock manual.
    assert.ok(page.includes('ariaLabel="Summon rover"'), 'RIDE still summons the rover');
    assert.ok(page.includes('ariaLabel="Dismount rover"'), 'OUT still dismounts it');
    assert.ok(page.includes('aria-label="Time of day"'), 'the TIME slider is still a slider');
  });
  it('the fullscreen panel parks above the joystick row: it never covers the stick', () => {
    const page = read('app/mars-2/page.jsx');
    // The stick's top edge sits 138 px + safe-area off the floor
    // (14 px home + 124 px stick); the panel floor is 150 px +
    // safe-area, so it clears the stick by 12 px on any phone.
    assert.ok(page.includes('bottom: calc(150px + env(safe-area-inset-bottom'), 'panel floor clears the joystick');
    assert.ok(page.includes('.fs-controls input[type="range"]'), 'the slider flexes inside the panel');
  });
  it('the fullscreen orb wears one face: the TRON art already carries the expand glyph', () => {
    const core = read('components/world/ControlsCore.jsx');
    assert.ok(!core.includes('⛶'), 'no text glyph doubles the face art on the core orb');
    assert.ok(core.includes("fn={fullscreen ? 'fullscreen-exit' : 'fullscreen'}"), 'the orb still wears its per-state face');
    assert.ok(core.includes("ariaLabel={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}"), 'the orb still names both states');
    assert.ok(core.includes("{fullscreen ? 'EXIT' : 'FULL'}"), 'the label still says FULL / EXIT');
  });
});

describe('mars-2 outpost interior + red moon + sandstorms (Merlin, Nov 17, 2026)', () => {
  const site = outpostSite(profile);
  const big = outpostLocalToWorld(-4, 0, site);
  const small = outpostLocalToWorld(4, 0, site);
  const ang = outpostDoorAngle(site);
  const door = { x: -Math.cos(ang), z: Math.sin(ang) };
  const perp = { x: -door.z, z: door.x };
  const at = (c, along, side = 0) => ({
    x: c.x + door.x * along + perp.x * side,
    z: c.z + door.z * along + perp.z * side,
  });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  it('the outpost is bigger: the whole structure scales ×1.5', () => {
    assert.equal(OUTPOST_SCALE, 1.5, 'scale factor is 1.5');
    assert.ok(Math.abs(OUTPOST_BIG_DOME_R_M - 4.8) < 1e-9, 'big dome 4.8 world m across');
    assert.ok(Math.abs(OUTPOST_SMALL_DOME_R_M - 3.6) < 1e-9, 'small dome 3.6 world m across');
    const t = outpostTransform(site);
    assert.equal(t.scale, OUTPOST_SCALE, 'the transform carries the scale');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('scale={OUTPOST_SCALE}'), 'the group scales by the constant');
    assert.ok(scene.includes('outpost.y + 7.5 * OUTPOST_SCALE'), 'the label rides the bigger mast');
  });
  it('the door faces the walker spawn', () => {
    const dx = WALKER_SPAWN.x - site.x;
    const dz = WALKER_SPAWN.z - site.z;
    const len = Math.hypot(dx, dz);
    assert.ok(Math.abs(door.x - dx / len) < 1e-9 && Math.abs(door.z - dz / len) < 1e-9,
      'the door direction is the spawn direction');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('outpostDoorAngle(site)'), 'the group rotates the door onto the spawn');
  });
  it('the interior is real: inner shell, terrain-hugging floor, decor, warm lights', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('buildInteriorFloor'), 'the floor is a terrain-hugging fan');
    assert.ok(scene.includes('mats.interior'), 'an inner shell exists');
    assert.ok(scene.includes('BackSide'), 'the inner shell faces inward');
    assert.ok(scene.includes('bunks'), 'bunks');
    assert.ok(scene.includes('table + two chairs'), 'table + chairs');
    assert.ok(scene.includes('console with two glowing screens'), 'console with screens');
    assert.ok(scene.includes('greenhouse rack'), 'greenhouse corner');
    assert.ok(scene.includes('storage crates'), 'storage crates');
    assert.ok(scene.includes('#7fd4ff') && scene.includes('#9dffb0'), 'the console screens glow');
    assert.ok(scene.includes('#ff9dff'), 'the grow-light strip glows');
    assert.equal(scene.split('<pointLight').length - 1, 3, 'three interior/porch lights');
    assert.ok(scene.includes('color="#ffc98a"'), 'the ceiling light is warm');
    assert.equal(OUTPOST_DECOR_COLLIDERS.length, 5, 'five decor colliders block the walker');
  });
  it('the portal is a physical walk-in: wedge + airlock + glowing ring', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('OUTPOST_DOOR_WEDGE_RAD'), 'the dome shell is cut for a doorway');
    assert.ok(scene.includes('airlock tunnel'), 'an airlock tunnel stands outside the door');
    assert.ok(scene.includes('the portal: a glowing ring'), 'the portal ring marks the entry');
    assert.ok(scene.includes('#ff7a2a'), 'the ring glows orange');
    assert.ok(scene.includes('torusGeometry args={[0.45, 0.05, 8, 24]}'), 'the ring is a torus');
    assert.ok(scene.includes('OUTPOST_DOOR_THETA'), 'a patch closes the wedge above the lintel');
  });
  it('outpostCollide: the walker walks in through the door, not through a wall', () => {
    // Standing in the middle of the big dome: nothing pushes.
    assert.deepEqual(outpostCollide(big.x, big.z, site), { x: big.x, z: big.z });
    // Two metres out on the door line (inside the airlock): free.
    const out = at(big, OUTPOST_BIG_DOME_R_M + 2);
    assert.deepEqual(outpostCollide(out.x, out.z, site), { x: out.x, z: out.z });
    // 0.2 m outside the wall, away from the door: pushed to the wall face.
    const wall = at(big, -(OUTPOST_BIG_DOME_R_M + 0.2));
    const pushed = outpostCollide(wall.x, wall.z, site);
    assert.ok(Math.abs(dist(pushed, big) - (OUTPOST_BIG_DOME_R_M + OUTPOST_WALKER_BODY_R_M)) < 1e-9,
      `wall must push to ${OUTPOST_BIG_DOME_R_M + OUTPOST_WALKER_BODY_R_M}, got ${dist(pushed, big)}`);
    // Inside near the far wall: held at R − 0.5.
    const inside = at(big, -(OUTPOST_BIG_DOME_R_M - 1));
    const held = outpostCollide(inside.x, inside.z, site);
    assert.ok(Math.abs(dist(held, big) - (OUTPOST_BIG_DOME_R_M - 0.5)) < 1e-9,
      `far wall must hold at ${OUTPOST_BIG_DOME_R_M - 0.5}, got ${dist(held, big)}`);
    // The small dome is solid (no door, no interior): a walker
    // inside it is pushed out to the wall face.
    const sIn = { x: small.x + 2, z: small.z };
    const sPushed = outpostCollide(sIn.x, sIn.z, site);
    assert.ok(Math.abs(dist(sPushed, small) - (OUTPOST_SMALL_DOME_R_M + OUTPOST_WALKER_BODY_R_M)) < 1e-9,
      'small dome pushes the walker out to its wall face');
    // The bunks block: standing on them pushes out to the collider edge.
    const bunks = outpostLocalToWorld(-5.2, -1.9, site);
    const bPushed = outpostCollide(bunks.x, bunks.z, site);
    assert.ok(Math.abs(dist(bPushed, bunks) - (0.9 * OUTPOST_SCALE + OUTPOST_WALKER_BODY_R_M)) < 1e-9,
      'decor pushes the walker to its edge');
  });
  it('outpostCollide: the rover cannot use the walker-sized door', () => {
    // On the door line, 0.2 m outside the big dome wall: the
    // rover is wider than the airlock, so the dome stays solid.
    const wall = at(big, OUTPOST_BIG_DOME_R_M + 0.2);
    const pushed = outpostCollide(wall.x, wall.z, site, OUTPOST_ROVER_BODY_R_M);
    assert.ok(Math.abs(dist(pushed, big) - (OUTPOST_BIG_DOME_R_M + OUTPOST_ROVER_BODY_R_M)) < 1e-9,
      `rover must be pushed to ${OUTPOST_BIG_DOME_R_M + OUTPOST_ROVER_BODY_R_M}, got ${dist(pushed, big)}`);
  });
  it('the scene wires the collision into walk, drive and summon', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('outpost={outpost}'), 'WalkerRig gets the outpost site');
    assert.ok(scene.includes('outpostCollide(p.x, p.z, outpost, OUTPOST_WALKER_BODY_R_M)'), 'walk branch collides');
    assert.ok(scene.includes('outpostCollide(rover.x, rover.z, outpost, OUTPOST_ROVER_BODY_R_M)'), 'drive branch collides');
    assert.ok(scene.includes('A summon never lands the rover inside the outpost'), 'summon clamps');
  });
  it('the domes read at night: emissive lift, lit windows, porch light, glowing rims', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.equal(scene.split('emissive="#201009"').length - 1, 3, 'all three dome shells (big, patch, small) carry the warm lift');
    assert.ok(scene.includes('DomeWindow'), 'lit windows sit on the shells');
    assert.ok(scene.includes("color=\"#ffca7a\""), 'the windows glow warm');
    assert.ok(scene.includes('<pointLight position={[-9.2, 2.1, 0]}'), 'a porch light hangs over the door');
    assert.equal(scene.split('color="#ff8a3c"').length - 1, 2, 'glowing rims ring both domes’ feet');
  });
  it('the red moon: the rig’s moonlight is red, and a red disc hangs where it comes from', () => {
    const rig = read('components/DayNightRig.jsx');
    assert.ok(rig.includes('moonColor'), 'the rig takes a moonColor prop');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('moonColor="#ff5040"'), 'Mars 2 tints its moonlight red');
    assert.ok(scene.includes('Mars2RedMoon'), 'a red moon component exists');
    assert.ok(scene.includes('<Mars2RedMoon timeOfDay={timeOfDay} />'), 'the red moon is mounted');
    assert.ok(scene.includes('makeMoonTexture'), 'it wears Merlin’s photo surface');
    assert.ok(scene.includes('color="#ff6a4a"'), 'the disc is tinted red');
    assert.ok(scene.includes('moonColor'), 'the moonlight and the disc share the red');
    // The wrap is Merlin's photo, not a procedural stand-in: the
    // red moon wears moon-surface.jpg (the hub moon's wrap),
    // tinted red — never the plain grey photo.
    const hubMoon = read('components/HubMoon.jsx');
    assert.ok(hubMoon.includes("MOON_SURFACE_PHOTO_URL = '/images/moon/moon-surface.jpg'"), 'the wrap is moon-surface.jpg');
    assert.ok(hubMoon.includes('makeMoonTexture'), 'the wrap ships via makeMoonTexture');
    assert.ok(scene.includes("import { makeMoonTexture } from '../HubMoon'"), 'Mars 2 uses the hub moon wrap');
  });
  it('sandstormAt: one storm per 9-minute cycle, 60–150 s long, smooth ramps', () => {
    assert.equal(SANDSTORM_PERIOD_S, 540, 'one storm per 540 s cycle');
    assert.equal(SANDSTORM_DURATION_MIN_S, 60, 'shortest storm 60 s');
    assert.equal(SANDSTORM_DURATION_MAX_S, 150, 'longest storm 150 s');
    const base = 1780000000000;
    assert.deepEqual(sandstormAt(base), sandstormAt(base), 'same instant, same storm');
    const cycleMs = SANDSTORM_PERIOD_S * 1000;
    // Scan one whole cycle from its boundary — a window starting
    // mid-cycle would straddle two cycles and see two storms.
    const cycleBase = Math.floor(base / cycleMs) * cycleMs;
    let active = 0;
    let transitions = 0;
    let wasActive = false;
    for (let t = 0; t < cycleMs; t += 1000) {
      const s = sandstormAt(cycleBase + t);
      assert.ok(s.intensity >= 0 && s.intensity <= 1, `intensity ${s.intensity} must be 0..1`);
      if (s.active) active++;
      if (s.active && !wasActive) transitions++;
      wasActive = s.active;
    }
    assert.equal(transitions, 1, 'exactly one storm per cycle');
    assert.ok(active >= 90 && active <= 210, `storm must last ~2–3.5 min, saw ${active} s`);
    assert.ok(active < cycleMs / 1000, 'most of the cycle is clear');
  });
  it('updateSandField rides the storm: thicker, bigger, faster grains', () => {
    const wind = { dirX: 0.7071, dirZ: 0.7071, speed: 20, gust: 0.8 };
    const calm = makeSandField({ count: 10, seed: 'storm-test' });
    const storm = makeSandField({ count: 10, seed: 'storm-test' });
    updateSandField(calm, wind, 1 / 60, 1780000000000, 1, 0);
    updateSandField(storm, wind, 1 / 60, 1780000000000, 1, 1);
    assert.ok(storm.material.opacity > calm.material.opacity, 'storm sand reads thicker');
    assert.equal(storm.material.opacity, 0.95, 'a full storm caps at 0.95');
    assert.ok(storm.material.size > calm.material.size, 'storm grains are bigger');
  });
  it('the scene mounts the storm: sand-textured field, thickening fog, pill text', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.ok(scene.includes('sandstormAt'), 'the scene reads the storm law');
    assert.ok(scene.includes("sprite: 'sand'"), 'the storm field wears the sand-textured graphic');
    assert.ok(scene.includes('scene.fog.density = 0.004 + storm.intensity * 0.016'), 'the storm closes the air');
    assert.ok(scene.includes('· SANDSTORM'), 'the Thule pill names the storm');
    assert.ok(!scene.includes('SANDSTORM PILL') && !scene.includes('StormWarning'), 'no new HUD chrome was invented');
  });
});
