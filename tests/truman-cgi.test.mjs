/*
 * TRUMAN CGI tests — run with: node --test tests/truman-cgi.test.mjs
 * Pins the Nov 15, 2026 CGI makeover of the live Three.js town
 * (gta-scene.js): procedural DataTextures, sky/day-night, breeze,
 * lighthouse beam, ambient traffic, pedestrian operators — and
 * that every mechanic (missions, wanted, driving, boarding,
 * collisions, HUD) is still wired exactly as before.
 * No DOM, no canvas: cgi.js / traffic.js / life.js are node-safe;
 * the scene file itself is pinned by static audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TRUMAN_TEXTURE_SIZE, TRUMAN_EPOCH_MS, TRUMAN_MAP_KINDS, TRUMAN_KINDS,
  trumanMaps, materialForTruman, trumanTextureStats,
  trumanSkyAt, TRUMAN_WIND, trumanWind,
  LIGHTHOUSE_BEAM_RATE_RAD_S, lighthouseBeamAngle,
  TRUMAN_CLOUD_COUNT, TRUMAN_CLOUD_SPAN, trumanClouds, cloudOffset,
} from '../app/truman/cgi.js';
import {
  TRUMAN_TOWN_HALF, TRUMAN_BLOCK, TRUMAN_ROAD_WIDTH, TRUMAN_LANE_OFFSET,
  TRUMAN_TRAFFIC_COUNT, TRUMAN_TRAFFIC_COLORS,
  townRoadLines, nearestRoadLine, isOnRoad,
  alignCarToTownLane, isTownTrafficLaneAligned, trafficHeading,
  createTownTraffic, stepTownTraffic,
} from '../app/truman/traffic.js';
import {
  TRUMAN_PEDESTRIAN_COUNT, PEDESTRIAN_KINDS, PEDESTRIAN_KIND_NAMES,
  PEDESTRIAN_COLORS, pedestrianRoute, pedestrianAt,
} from '../app/truman/life.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const sceneSrc = read('../app/truman/gta-scene.js');
const townSrc = read('../app/truman/town.js');
const cgiSrc = read('../app/truman/cgi.js');
const texturesSrc = read('../app/truman/textures.js');

// ---------- CGI textures (house idiom: seeded DataTextures) ----------

test('truman texture kinds are the four town materials', () => {
  assert.deepEqual([...TRUMAN_KINDS].sort(),
    ['brickShop', 'houseSiding', 'roofShingle', 'woodPlank']);
  for (const k of TRUMAN_KINDS) {
    assert.ok(TRUMAN_MAP_KINDS[k].roughness > 0 && TRUMAN_MAP_KINDS[k].roughness <= 1);
    assert.ok(TRUMAN_MAP_KINDS[k].bumpScale > 0);
  }
});

test('trumanMaps returns 256x256 colour + bump DataTextures', () => {
  for (const k of TRUMAN_KINDS) {
    const m = trumanMaps(k, 4242);
    assert.equal(m.map.image.width, TRUMAN_TEXTURE_SIZE);
    assert.equal(m.map.image.height, TRUMAN_TEXTURE_SIZE);
    assert.equal(m.map.image.data.length, TRUMAN_TEXTURE_SIZE * TRUMAN_TEXTURE_SIZE * 4);
    assert.equal(m.bumpMap.image.data.length, TRUMAN_TEXTURE_SIZE * TRUMAN_TEXTURE_SIZE);
    assert.ok(m.roughness > 0 && m.roughness <= 1);
  }
});

test('trumanMaps is deterministic per seed and varies per seed', () => {
  const a = trumanMaps('houseSiding', 4242).map.image.data;
  const b = trumanMaps('houseSiding', 4242).map.image.data;
  const c = trumanMaps('houseSiding', 4243).map.image.data;
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  assert.notDeepEqual(Buffer.from(a), Buffer.from(c));
  // Different kinds paint different maps.
  const d = trumanMaps('brickShop', 4242).map.image.data;
  assert.notDeepEqual(Buffer.from(a), Buffer.from(d));
});

test('materialForTruman caches per kind+seed+tint, unknown kind falls back', () => {
  const m1 = materialForTruman('roofShingle', 4242, '#ffffff');
  const m2 = materialForTruman('roofShingle', 4242, '#ffffff');
  assert.equal(m1, m2);
  const fb = materialForTruman('nope', 4242);
  assert.deepEqual(Buffer.from(fb.map.image.data),
    Buffer.from(trumanMaps('houseSiding', 4242).map.image.data));
  assert.ok(trumanTextureStats().textures >= 4);
});

// ---------- Sky + day/night ----------

test('trumanSkyAt: midday is bright, windows dark, stars out', () => {
  const s = trumanSkyAt(0.25); // sun overhead
  assert.ok(Math.abs(s.dayness - 1) < 1e-9);
  assert.equal(s.windowGlow, 0);
  assert.equal(s.starOpacity, 0);
  assert.equal(s.sunOpacity, 1);
  assert.equal(s.moonOpacity, 0);
  assert.ok(Math.abs(s.sunIntensity - 1.25) < 1e-9, 'sun law 0.25 + dayness unchanged');
});

test('trumanSkyAt: midnight is dark, windows lit, stars out', () => {
  const s = trumanSkyAt(0.75); // sun below the horizon
  assert.equal(s.dayness, 0);
  assert.equal(s.windowGlow, 1);
  assert.equal(s.starOpacity, 1);
  assert.equal(s.sunOpacity, 0);
  assert.equal(s.moonOpacity, 1);
  assert.ok(Math.abs(s.sunIntensity - 0.25) < 1e-9);
});

test('trumanSkyAt: low sun reads as dusk, morning is day', () => {
  const dawn = trumanSkyAt(0.05);
  assert.ok(dawn.dusk > 0, 'low sun must carry a dusk wash');
  assert.ok(dawn.windowGlow > 0 && dawn.windowGlow < 1, 'windows half-lit at dawn');
  const morning = trumanSkyAt(0.3); // the scene's start time
  assert.ok(morning.dayness > 0.9, 'morning must read as day');
  assert.notEqual(dawn.sky, morning.sky, 'dawn and morning skies differ');
  assert.notEqual(morning.sky, trumanSkyAt(0.75).sky, 'day and night skies differ');
});

test('trumanSkyAt is deterministic and its hexes are well-formed', () => {
  const a = trumanSkyAt(0.42), b = trumanSkyAt(0.42);
  assert.deepEqual(a, b);
  for (const k of ['sky', 'fog', 'sunColor', 'hemiSky', 'hemiGround']) {
    assert.match(a[k], /^#[0-9a-f]{6}$/, `${k} must be a hex colour`);
  }
});

// ---------- Wind + lighthouse beam + clouds ----------

test('trumanWind is deterministic, gentle, and veers in bounds', () => {
  const t0 = TRUMAN_EPOCH_MS + 100000;
  const a = trumanWind(t0), b = trumanWind(t0);
  assert.deepEqual(a, b);
  assert.ok(a.speed >= 0.4 && a.speed <= TRUMAN_WIND.baseSpeed + TRUMAN_WIND.gustAmp + 1e-9);
  assert.ok(Math.abs(a.direction - TRUMAN_WIND.baseDirection) <= TRUMAN_WIND.veerAmp + 1e-9);
  assert.ok(a.gust >= 0 && a.gust <= 1);
});

test('lighthouseBeamAngle is deterministic and wraps at 2π', () => {
  assert.equal(lighthouseBeamAngle(TRUMAN_EPOCH_MS), 0);
  assert.ok(Math.abs(lighthouseBeamAngle(TRUMAN_EPOCH_MS + 1000) - LIGHTHOUSE_BEAM_RATE_RAD_S) < 1e-9);
  const fullTurn = TRUMAN_EPOCH_MS + Math.round((Math.PI * 2 / LIGHTHOUSE_BEAM_RATE_RAD_S) * 1000);
  const wrapped = lighthouseBeamAngle(fullTurn);
  // Circular distance to 0 (ms rounding lands just short of 2π).
  assert.ok(Math.min(wrapped, Math.PI * 2 - wrapped) < 1e-3, 'one full sweep returns to ~0');
  assert.equal(lighthouseBeamAngle(TRUMAN_EPOCH_MS + 5000), lighthouseBeamAngle(TRUMAN_EPOCH_MS + 5000));
});

test('trumanClouds: ten seeded clouds above the town, deterministic', () => {
  const a = trumanClouds(), b = trumanClouds();
  assert.equal(a.length, TRUMAN_CLOUD_COUNT);
  assert.deepEqual(a, b);
  for (const c of a) {
    assert.ok(c.y >= 55 && c.y <= 90, 'clouds ride above the roofs');
    assert.ok(c.scale >= 14 && c.scale <= 30);
    assert.ok(Math.abs(c.x) <= 240 && Math.abs(c.z) <= 240);
  }
});

test('cloudOffset drifts downwind inside the span', () => {
  const t0 = TRUMAN_EPOCH_MS;
  for (let i = 0; i < TRUMAN_CLOUD_COUNT; i++) {
    const o0 = cloudOffset(i, t0);
    const o1 = cloudOffset(i, t0 + 1000);
    assert.ok(o0 >= 0 && o0 < TRUMAN_CLOUD_SPAN);
    assert.ok(o1 > o0, 'clouds drift forward with time');
    assert.equal(cloudOffset(i, t0), o0, 'deterministic per cloud');
  }
});

// ---------- Ambient traffic ----------

test('town road lines match the town grid (block 60, half 250)', () => {
  assert.deepEqual(townRoadLines(), [-250, -190, -130, -70, -10, 50, 110, 170, 230]);
  assert.equal(nearestRoadLine(0), -10);
  assert.equal(nearestRoadLine(-245), -250);
  assert.equal(nearestRoadLine(229), 230);
  assert.equal(TRUMAN_TOWN_HALF, 250);
  assert.equal(TRUMAN_BLOCK, 60);
  assert.equal(TRUMAN_ROAD_WIDTH, 10);
  assert.equal(TRUMAN_LANE_OFFSET, 2.5);
});

test('createTownTraffic spawns lane-aligned cars on roads, never the beach', () => {
  const cars = createTownTraffic(4242, TRUMAN_TRAFFIC_COUNT);
  assert.equal(cars.length, TRUMAN_TRAFFIC_COUNT);
  for (const c of cars) {
    assert.ok(isTownTrafficLaneAligned(c), `car dir=${c.dir} not lane-aligned`);
    assert.ok(c.x <= 140, 'no traffic on the beach');
    assert.ok(Math.abs(c.x) <= 250 && Math.abs(c.z) <= 250);
    assert.ok(c.cruise >= 6 && c.cruise <= 10, 'town speeds, not highway');
    assert.ok(TRUMAN_TRAFFIC_COLORS.includes(c.color));
  }
  // Deterministic per seed (JSON drops the per-car PRNG functions).
  const a = JSON.stringify(createTownTraffic(4242, 10));
  const b = JSON.stringify(createTownTraffic(4242, 10));
  const c = JSON.stringify(createTownTraffic(4243, 10));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('traffic steps move cars, stay in town and stay lane-aligned', () => {
  const cars = createTownTraffic(4242, 10);
  const before = cars.map((c) => ({ x: c.x, z: c.z }));
  for (let i = 0; i < 600; i++) stepTownTraffic(cars, 1 / 60, null);
  for (const c of cars) {
    assert.ok(Math.abs(c.x) <= 255 && Math.abs(c.z) <= 255, 'car escaped the town');
    assert.ok(isTownTrafficLaneAligned(c), 'car lost lane alignment');
    assert.ok(c.speed > 0, 'cars must roll when the road is clear');
  }
  assert.notDeepEqual(cars.map((c) => ({ x: c.x, z: c.z })), before, 'cars must move');
});

test('traffic brakes to a stop when the player is ahead in its lane', () => {
  // Northbound car in the -10 road's +2.5 lane (x = -7.5), z = 20.
  const car = {
    x: -7.5, z: 20, dir: 0, speed: 8, cruise: 8, color: '#c96f4a',
    _rand: () => 0.5,
  };
  assert.ok(isTownTrafficLaneAligned(car));
  stepTownTraffic([car], 1, { x: -7.5, z: 12 }); // player 8 m ahead
  assert.equal(car.speed, 0, 'car must stop for the player ahead');
  stepTownTraffic([car], 1, { x: 100, z: 100 }); // player far away
  assert.ok(car.speed > 0, 'car rolls on once the lane is clear');
});

test('trafficHeading faces the mesh forward for every dir', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((d) => trafficHeading(d)),
    [Math.PI, Math.PI / 2, 0, -Math.PI / 2],
  );
});

test('isOnRoad matches the road strips', () => {
  assert.equal(isOnRoad(-7.5, 20), true); // on the -10 road
  assert.equal(isOnRoad(0, 0), false); // middle of a block
  assert.equal(isOnRoad(200, 50), true); // on the 50 road
});

// ---------- Pedestrian operators ----------

test('pedestrian routes cover all three kinds, deterministically', () => {
  const kinds = new Set();
  for (let i = 0; i < TRUMAN_PEDESTRIAN_COUNT; i++) {
    const r = pedestrianRoute(i);
    kinds.add(r.kind);
    assert.deepEqual(pedestrianRoute(i), r, 'route is a pure function of index');
  }
  assert.deepEqual([...kinds].sort(), [...PEDESTRIAN_KIND_NAMES].sort());
  assert.equal(PEDESTRIAN_COLORS.length, TRUMAN_PEDESTRIAN_COUNT);
});

test('pedestrianAt is a pure function of (index, clock): same inputs, same person', () => {
  const t = TRUMAN_EPOCH_MS + 60000;
  for (let i = 0; i < TRUMAN_PEDESTRIAN_COUNT; i++) {
    assert.deepEqual(pedestrianAt(i, t, null), pedestrianAt(i, t, null));
    const later = pedestrianAt(i, t + 10000, null);
    assert.ok(later.x !== pedestrianAt(i, t, null).x || later.z !== pedestrianAt(i, t, null).z,
      'pedestrians must actually walk');
  }
});

test('pedestrians stay in town, on sidewalks or their ring', () => {
  const t = TRUMAN_EPOCH_MS + 123456;
  for (let i = 0; i < TRUMAN_PEDESTRIAN_COUNT; i++) {
    const p = pedestrianAt(i, t, null);
    assert.ok(Math.abs(p.x) <= 250 && Math.abs(p.z) <= 250, 'pedestrian left the town');
    assert.ok(p.bob >= 0 && p.bob <= 0.12, 'walk bob in range');
    assert.ok([0, Math.PI / 2, Math.PI, -Math.PI / 2].includes(p.heading), 'cardinal heading');
    if (p.kind === 'jogger') {
      assert.ok(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.z)) - 190) < 1e-6,
        'joggers run the outer ring');
    } else if (p.kind === 'shopper') {
      // Shoppers walk the shop row itself (z = 100, the shop
      // fronts), half a block off the nearest road — that IS
      // where the shops are.
      assert.ok(Math.abs(p.z - 100) <= 14, 'shoppers stay on the shop row');
    } else {
      // Strollers walk the sidewalk ring (~6 m off a road line).
      const d = Math.min(
        Math.abs(p.x - nearestRoadLine(p.x)),
        Math.abs(p.z - nearestRoadLine(p.z)),
      );
      assert.ok(d <= 8, `pedestrian ${p.kind} is ${d.toFixed(1)} m from any road`);
    }
  }
});

test('pedestrians sidestep the player and ignore a far-away player', () => {
  const t = TRUMAN_EPOCH_MS + 60000;
  for (let i = 0; i < TRUMAN_PEDESTRIAN_COUNT; i++) {
    const alone = pedestrianAt(i, t, null);
    const far = pedestrianAt(i, t, { x: 240, z: -240 });
    assert.deepEqual(far, alone, 'a far player must not move a pedestrian');
    const close = pedestrianAt(i, t, { x: alone.x, z: alone.z });
    const moved = Math.hypot(close.x - alone.x, close.z - alone.z);
    assert.ok(moved >= 0.5, 'pedestrian must step aside when the player is on top of them');
  }
});

test('shoppers pause at shop fronts and walk between pauses', () => {
  const shopper = [0, 1, 2].find((i) => pedestrianRoute(i).kind === 'shopper');
  assert.ok(shopper !== undefined, 'a shopper slot must exist');
  const t0 = TRUMAN_EPOCH_MS;
  let sawPaused = false, sawWalking = false;
  for (let s = 0; s < 120; s++) {
    const p = pedestrianAt(shopper, t0 + s * 1000, null);
    if (p.paused) { sawPaused = true; assert.equal(p.speed, 0); assert.equal(p.bob, 0); }
    else sawWalking = true;
  }
  assert.ok(sawPaused, 'shopper must pause within two minutes');
  assert.ok(sawWalking, 'shopper must walk between pauses');
});

// ---------- Static audits: mechanics intact, CGI wired, no new lights ----------

test('scene adds no real lights: one directional + one hemisphere, nothing else', () => {
  assert.ok(!sceneSrc.includes('PointLight'), 'no PointLight');
  assert.ok(!sceneSrc.includes('SpotLight'), 'no SpotLight');
  assert.ok(!sceneSrc.includes('RectAreaLight'), 'no RectAreaLight');
  assert.equal((sceneSrc.match(/new THREE\.DirectionalLight/g) || []).length, 1);
  assert.equal((sceneSrc.match(/new THREE\.HemisphereLight/g) || []).length, 1);
});

const MECHANIC_CALLS = [
  'createPlayer', 'updatePlayer',
  'createVehicle', 'updateVehicle', 'enterVehicle', 'exitVehicle', 'nearestVehicle',
  'createWanted', 'commitCrime', 'updateWanted', 'updateCop', 'checkBusted', 'resetWanted',
  'createMission', 'updateMission', 'startMission', 'currentObjective', 'TRUMAN_MISSIONS',
  'createInput', 'findClearSpot', 'createWalkerEmbodiment',
];
for (const call of MECHANIC_CALLS) {
  test(`mechanic still wired: ${call}`, () => {
    assert.ok(sceneSrc.includes(call), `gta-scene.js lost ${call}`);
  });
}

test('mechanics keep their exact collision + event wiring', () => {
  assert.ok(sceneSrc.includes('updateVehicle(v, inp, townData.colliders, dt)'));
  assert.ok(sceneSrc.includes('updatePlayer(player, inp, camYaw, townData.colliders, dt)'));
  assert.ok(sceneSrc.includes("commitCrime(wanted, 'stealCar'"));
  assert.ok(sceneSrc.includes("onEvent({ type: 'busted', money })"));
  assert.ok(sceneSrc.includes("onEvent({ type: 'mission_complete'"));
  assert.ok(sceneSrc.includes('type: \'hud\''));
});

test('CGI is wired in: sky, traffic, pedestrians, textures, beam', () => {
  for (const marker of [
    "from './cgi.js'", "from './traffic.js'", "from './life.js'",
    'trumanSkyAt(simTime)', 'createTownTraffic', 'stepTownTraffic',
    'pedestrianAt(i, nowMs', 'materialForTruman', 'lighthouseBeamAngle',
    'buildTownTrees', 'createShopSignTexture', 'trumanWind(nowMs)',
  ]) {
    assert.ok(sceneSrc.includes(marker), `gta-scene.js missing CGI wiring: ${marker}`);
  }
});

test('scene imports no new lib/gta modules (workarounds stay in app/truman)', () => {
  const imports = [...sceneSrc.matchAll(/from '(@\/lib\/gta\/[^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...imports].sort(), [
    '@/lib/gta/collisions.js',
    '@/lib/gta/input.js',
    '@/lib/gta/missions.js',
    '@/lib/gta/player.js',
    '@/lib/gta/vehicle.js',
    '@/lib/gta/walker-embodiment.js',
    '@/lib/gta/wanted.js',
  ]);
});

test('town.js keeps its exports and the tree fix (no origin pile-up)', () => {
  for (const exp of ['generateTown', 'createTownGroundTexture', 'createShopSignTexture',
    'buildTownTrees', 'TRUMAN_POIS', 'TOWN']) {
    assert.ok(townSrc.includes(exp), `town.js lost ${exp}`);
  }
  assert.ok(townSrc.includes('leafBase'), 'buildTownTrees must return sway bases');
  assert.ok(townSrc.includes('hidden: true'), 'beach-skipped trees must be hidden, not piled at origin');
});

test('textures.js is untouched and not duplicated by the CGI kit', () => {
  assert.ok(texturesSrc.includes('export function makeTrumanTextures'));
  assert.ok(texturesSrc.includes('export function pickFacade'));
  assert.ok(!cgiSrc.includes("from './textures.js'"), 'cgi.js must not re-import the classic textures');
  assert.ok(!sceneSrc.includes('makeTrumanTextures'), 'the 3D scene never used the 2.5D textures');
});
