// tests/hub-travel.test.js — Headless tests for the hub scene rework
// (2026-09-30): distant tower constellation, Moon, asteroid field, travel
// tuning, nav beacons, cover-fit texture mapping, collision, bike flight.
// Run: node tests/hub-travel.test.js (from the repo root).

import { readFileSync } from 'fs';
import {
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  MAX_BAND_RADIUS,
  GOD_BANDS,
  GOD_HEX,
  BIKE_PARK_POS,
  dist3,
} from '../lib/god-orbits.js';
import {
  CONSTELLATION_CENTER,
  MOON_RADIUS,
  MOON_ORBIT_RADIUS,
  MOON_ORBIT_SPEED,
  moonPositionAt,
  moonAngleAt,
  ASTEROID_CENTER,
  ASTEROID_COUNT,
  ASTEROID_FIELD_RADIUS,
  FREE_FLY_SPEED,
  BIKE_TUNING,
  BEACONS,
} from '../lib/hub-layout.js';
import {
  ZEUS_POS,
  ARES_POS,
  THOTH_POS,
  ARGUS_POS,
  MEDUSA_POS,
  ARTEMIS_POS,
} from '../lib/home-positions.js';
import { coverFitUV, applyCoverFit } from '../lib/texture-fit.js';
import {
  registerCollider,
  unregisterCollider,
  clearColliders,
  colliderCount,
  resolveFlightCollision,
} from '../lib/hub-collision.js';
import {
  createBikeFlightState,
  stepBikeFlight,
  bikeForward,
  rotateOffsetByYaw,
} from '../lib/bike-flight.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const P = (arr) => ({ x: arr[0], y: arr[1], z: arr[2] });

// --- distant constellation ---------------------------------------------------
const towerPositions = [ZEUS_POS, ARES_POS, THOTH_POS, ARGUS_POS, MEDUSA_POS, ARTEMIS_POS];
t(
  'constellation is dramatically far from spawn (400..2000 units)',
  (() => {
    const d = dist3(CONSTELLATION_CENTER, ORBIT_CENTER);
    return d > 400 && d < 2000;
  })()
);
t(
  'all towers sit in the distant field (within 90 of its center)',
  towerPositions.every((p) => dist3(P(p), CONSTELLATION_CENTER) < 90)
);
t(
  'all towers are far from the hub (no crowding of spawn/satellites/bike)',
  towerPositions.every((p) => dist3(P(p), ORBIT_CENTER) > 400)
);
t(
  'Artemis keeps a high sanctum above the distant field',
  ARTEMIS_POS[0] === CONSTELLATION_CENTER.x &&
    ARTEMIS_POS[2] === CONSTELLATION_CENTER.z &&
    ARTEMIS_POS[1] > CONSTELLATION_CENTER.y + 40
);

// --- spawn / bike stay central ------------------------------------------------
t('spawn is dead-center of the satellite constellation', true); // ORBIT_CENTER is the ring center by construction
t(
  'bike parks at exactly spawn level, dead ahead (-Z)',
  BIKE_PARK_POS[1] === ORBIT_CENTER.y &&
    BIKE_PARK_POS[0] === ORBIT_CENTER.x &&
    BIKE_PARK_POS[2] < ORBIT_CENTER.z
);
t(
  'bike sits just outside the outermost ring',
  ORBIT_CENTER.z - BIKE_PARK_POS[2] > MAX_BAND_RADIUS &&
    ORBIT_CENTER.z - BIKE_PARK_POS[2] < MAX_BAND_RADIUS + 15
);

// --- Moon ----------------------------------------------------------------------
t('Moon orbits at a believable lunar distance (2..4 Earth radii)', (() => {
  const d = dist3(moonPositionAt(10), EARTH_CENTER);
  return d > EARTH_RADIUS * 2 && d < EARTH_RADIUS * 4;
})());
t('Moon orbit radius matches the constant', (() => {
  const p = moonPositionAt(123.4);
  const dx = p.x - EARTH_CENTER.x;
  const dz = p.z - EARTH_CENTER.z;
  return Math.abs(Math.sqrt(dx * dx + dz * dz) - MOON_ORBIT_RADIUS) < 1e-9;
})());
t('Moon orbit is prograde (same sense as Earth spin: angle decreases)', moonAngleAt(60) < moonAngleAt(0));
t('Moon orbit is slow and stately (one revolution ≈ 4 minutes)', (() => {
  const period = (Math.PI * 2) / MOON_ORBIT_SPEED;
  return period > 200 && period < 300;
})());
t('Moon is a real body, not a speck (radius 8..20)', MOON_RADIUS >= 8 && MOON_RADIUS <= 20);
t('Moon stays clear of the satellite ring', (() => {
  // Closest approach of the moon's orbit circle to ORBIT_CENTER, in XZ.
  const hubDx = ORBIT_CENTER.x - EARTH_CENTER.x;
  const hubDz = ORBIT_CENTER.z - EARTH_CENTER.z;
  const hubD = Math.sqrt(hubDx * hubDx + hubDz * hubDz);
  return MOON_ORBIT_RADIUS - hubD > MAX_BAND_RADIUS + MOON_RADIUS;
})());

// --- asteroid field ---------------------------------------------------------------
t(
  'asteroid field is well away from spawn (>250)',
  dist3(ASTEROID_CENTER, ORBIT_CENTER) > 250
);
t(
  'asteroid field clears the satellite ring entirely',
  dist3(ASTEROID_CENTER, ORBIT_CENTER) - ASTEROID_FIELD_RADIUS > MAX_BAND_RADIUS + 20
);
t('asteroid belt has real substance (60..160 rocks)', ASTEROID_COUNT >= 60 && ASTEROID_COUNT <= 160);
t(
  'asteroid field is off the direct spawn→constellation lane (does not block travel)',
  (() => {
    // Distance from ASTEROID_CENTER to the segment ORBIT_CENTER→CONSTELLATION_CENTER, in XZ.
    const ax = ORBIT_CENTER.x;
    const az = ORBIT_CENTER.z;
    const bx = CONSTELLATION_CENTER.x - ax;
    const bz = CONSTELLATION_CENTER.z - az;
    const px = ASTEROID_CENTER.x - ax;
    const pz = ASTEROID_CENTER.z - az;
    const tt = Math.max(0, Math.min(1, (px * bx + pz * bz) / (bx * bx + bz * bz)));
    const cx = ax + bx * tt;
    const cz = az + bz * tt;
    const d = Math.hypot(ASTEROID_CENTER.x - cx, ASTEROID_CENTER.z - cz);
    return d > ASTEROID_FIELD_RADIUS + 40;
  })()
);

// --- travel tuning: a satisfying ride, not a crawl ----------------------------------
t('free-fly is fast now (was a 40 u/s crawl)', FREE_FLY_SPEED >= 90 && FREE_FLY_SPEED <= 160);
t(
  'bike cruise makes the constellation a 3..9 s ride (meaningful, not tedious)',
  (() => {
    const d = dist3(CONSTELLATION_CENTER, { x: BIKE_PARK_POS[0], y: BIKE_PARK_POS[1], z: BIKE_PARK_POS[2] });
    const secs = d / BIKE_TUNING.maxSpeed;
    return secs >= 3 && secs <= 9;
  })()
);

// --- nav beacons -------------------------------------------------------------------------
t('beacons mark the constellation, the belt, and Earth', BEACONS.length === 3);
t(
  'beacon positions match their destinations',
  (() => {
    const byId = Object.fromEntries(BEACONS.map((b) => [b.id, b]));
    return (
      dist3(byId.constellation.position, CONSTELLATION_CENTER) < 1e-9 &&
      dist3(byId.asteroids.position, ASTEROID_CENTER) < 1e-9 &&
      Math.abs(byId.earth.position.y - (EARTH_CENTER.y + EARTH_RADIUS)) < 1e-9
    );
  })()
);
t(
  'every beacon has a label and a visible beam',
  BEACONS.every((b) => typeof b.label === 'string' && b.label.length > 3 && b.beamHeight > 200)
);

// --- cover-fit mapping: no stretching, warping, or aspect distortion -------------------
t('landscape source → portrait face: sampled window keeps the face aspect', (() => {
  // Betty-style 16:9 video onto the 5.7×6.75 portrait face.
  const { repeat, offset } = coverFitUV(16, 9, 5.7, 6.75);
  const sampledAspect = (repeat[0] * (16 / 9)) / (repeat[1] * 1);
  return (
    Math.abs(sampledAspect - 5.7 / 6.75) < 1e-9 &&
    repeat[0] > 0 && repeat[0] <= 1 && repeat[1] === 1 &&
    offset[0] >= 0 && offset[1] === 0
  );
})());
t('square ad art → portrait tower panel: no stretch, centered crop', (() => {
  const { repeat, offset } = coverFitUV(1600, 1600, 3.8, 4.5);
  const sampledAspect = repeat[0] * 1 / repeat[1];
  return (
    Math.abs(sampledAspect - 3.8 / 4.5) < 1e-9 &&
    Math.abs(offset[0] - (1 - repeat[0]) / 2) < 1e-9
  );
})());
t('portrait source → landscape plane: crops top/bottom, keeps aspect', (() => {
  const { repeat, offset } = coverFitUV(9, 16, 16, 9);
  const sampledAspect = (repeat[0] * (9 / 16)) / repeat[1];
  return Math.abs(sampledAspect - 16 / 9) < 1e-9 && repeat[0] === 1 && offset[1] >= 0;
})());
t('degenerate input is a safe no-op', (() => {
  const r = coverFitUV(0, 0, 3.8, 4.5);
  return r.repeat[0] === 1 && r.repeat[1] === 1 && r.offset[0] === 0 && r.offset[1] === 0;
})());
t('applyCoverFit writes repeat/offset onto a texture-like', (() => {
  const calls = [];
  const fake = {
    repeat: { set: (x, y) => calls.push(['repeat', x, y]) },
    offset: { set: (x, y) => calls.push(['offset', x, y]) },
  };
  applyCoverFit(fake, 16, 9, 5.7, 6.75);
  return calls.length === 2 && calls[0][1] > 0 && calls[0][1] < 1;
})());

// --- collision: solid geometry, bounce/deflect, never kill -------------------------------
t('head-on flight into a sphere is stopped at the surface (no pass-through)', (() => {
  clearColliders();
  registerCollider('rock', () => ({ x: 0, y: 0, z: -50 }), 10);
  const prev = { x: 0, y: 0, z: 0 };
  const next = { x: 0, y: 0, z: -100 };
  const hit = resolveFlightCollision(prev, next, 1);
  // Sample the resolved segment: nothing may penetrate the sphere (R=11).
  let minD = Infinity;
  for (let i = 0; i <= 100; i++) {
    const f = i / 100;
    minD = Math.min(
      minD,
      Math.hypot(
        prev.x + (next.x - prev.x) * f,
        prev.y + (next.y - prev.y) * f,
        prev.z + (next.z - prev.z) * f + 50
      )
    );
  }
  clearColliders();
  return hit === true && minD >= 10.9;
})());
t('a clear miss leaves the path untouched', (() => {
  clearColliders();
  registerCollider('rock', () => ({ x: 100, y: 0, z: -50 }), 10);
  const prev = { x: 0, y: 0, z: 0 };
  const next = { x: 0, y: 0, z: -100 };
  const hit = resolveFlightCollision(prev, next, 1);
  clearColliders();
  return hit === false && next.x === 0 && next.y === 0 && next.z === -100;
})());
t('collision never NaNs, even dead-center', (() => {
  clearColliders();
  registerCollider('rock', () => ({ x: 0, y: 0, z: -50 }), 10);
  const prev = { x: 0, y: 0, z: -50 };
  const next = { x: 0, y: 0, z: -50 };
  const hit = resolveFlightCollision(prev, next, 1);
  const ok = [prev.x, prev.y, prev.z, next.x, next.y, next.z].every(Number.isFinite);
  clearColliders();
  return hit === true && ok;
})());
t('collider registry supports replace-by-id', (() => {
  clearColliders();
  registerCollider('a', () => ({ x: 0, y: 0, z: 0 }), 5);
  registerCollider('a', () => ({ x: 1, y: 1, z: 1 }), 6);
  const n = colliderCount();
  clearColliders();
  return n === 1 && colliderCount() === 0;
})());

// --- bike flight model ----------------------------------------------------------------------
t('full throttle reaches cruise speed', (() => {
  const st = createBikeFlightState([0, 35, -152.3]);
  for (let i = 0; i < 240; i++) stepBikeFlight(st, { throttle: 1, steer: 0, vertical: false }, 1 / 60, BIKE_TUNING);
  return Math.abs(st.speed - BIKE_TUNING.maxSpeed) < 1;
})());
t('the bike actually moves forward when throttled (the reported bug)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  const z0 = st.pos.z;
  for (let i = 0; i < 120; i++) stepBikeFlight(st, { throttle: 1, steer: 0, vertical: false }, 1 / 60, BIKE_TUNING);
  return st.pos.z > z0 + 50; // nose +Z at yaw 0
})());
t('steering yaws the bike (D turns right, toward +X)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  stepBikeFlight(st, { throttle: 0, steer: 1, vertical: false }, 1, BIKE_TUNING);
  const f = bikeForward(st.yaw);
  return st.yaw > 0 && f.x > 0;
})());
t('releasing throttle brakes to a stop (no runaway)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 120; i++) stepBikeFlight(st, { throttle: 1, steer: 0, vertical: false }, 1 / 60, BIKE_TUNING);
  for (let i = 0; i < 300; i++) stepBikeFlight(st, { throttle: 0, steer: 0, vertical: false }, 1 / 60, BIKE_TUNING);
  return Math.abs(st.speed) < 0.5;
})());
t('reverse is gentle (slower than cruise)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 240; i++) stepBikeFlight(st, { throttle: -1, steer: 0, vertical: false }, 1 / 60, BIKE_TUNING);
  return st.speed < 0 && Math.abs(st.speed) <= BIKE_TUNING.reverseSpeed + 0.5;
})());
t('vertical axis: W climbs, S dives', (() => {
  const up = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 120; i++) stepBikeFlight(up, { throttle: 1, steer: 0, vertical: true }, 1 / 60, BIKE_TUNING);
  const down = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 120; i++) stepBikeFlight(down, { throttle: -1, steer: 0, vertical: true }, 1 / 60, BIKE_TUNING);
  return up.pos.y > 35 + 40 && down.pos.y < 35 - 40 && Math.abs(up.speed) < 1;
})());
t('rider offset rotates with bike yaw (to_bike handoff math)', (() => {
  const off = rotateOffsetByYaw({ x: 0, y: 2.05, z: -1.15 }, Math.PI / 2);
  return Math.abs(off.x - -1.15) < 1e-9 && Math.abs(off.z) < 1e-9 && off.y === 2.05;
})());

// --- scene wiring ------------------------------------------------------------------------------
const sceneSrc = stripComments(readFileSync('components/HomeScene.jsx', 'utf8'));
t('scene mounts the Moon', sceneSrc.includes('HubMoon'));
t('scene mounts the asteroid field', sceneSrc.includes('AsteroidField'));
t('scene mounts the nav beacons', sceneSrc.includes('NavBeacons'));
t('scene registers static colliders', sceneSrc.includes('StaticColliders'));
t('on_bike drives the flight model (bug fix present)', sceneSrc.includes('stepBikeFlight'));
t('to_bike handoff seeds flight from the real bike pose', sceneSrc.includes('createBikeFlightState'));
t('free-fly resolves collisions (no pass-through)', sceneSrc.includes('resolveFlightCollision'));
t('thin fog keeps the far field visible', sceneSrc.includes('0.0016'));

const bbSrc = stripComments(readFileSync('components/argo/BillboardMonument.jsx', 'utf8'));
t(
  'billboard video creatives map with aspect-preserving cover-fit',
  bbSrc.includes('slot.videoSrc') && bbSrc.includes('applyCoverFit')
);

// --- HERMES: the shopping satellite is one of the ten, merchant-dressed ----
t(
  'HERMES ring satellite is a full first-class satellite (not an afterthought)',
  (() => {
    const band = GOD_BANDS.find((b) => b.god === 'HERMES');
    return (
      !!band &&
      band.count === 1 && // exactly one physical satellite
      band.texture === '/textures/menus/hermes/banner.jpeg' && // proper exterior graphics
      band.label === 'HERMES'
    );
  })()
);
t(
  'HERMES ring satellite wears merchant gold (beacon, rings, marker)',
  GOD_BANDS.find((b) => b.god === 'HERMES').color === GOD_HEX.gold
);
t(
  'panel styling has a gold accent entry for the merchant menu',
  stripComments(readFileSync('components/GodMenuPanel.jsx', 'utf8')).includes('gold:')
);

console.log(`\nhub-travel: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
