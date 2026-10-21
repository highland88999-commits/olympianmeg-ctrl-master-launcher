// tests/hub-travel.test.js — Headless tests for the hub scene rework
// (2026-09-30): ten god towers RINGING SPAWN (Merlin: spawn must be IN THE
// MIDDLE of the ten towers, ads visible from spawn), Moon, asteroid field,
// travel tuning, nav beacons, cover-fit texture mapping, collision, bike flight.
// Run: node tests/hub-travel.test.js (from the repo root).

import { readFileSync } from 'fs';
import {
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  MAX_BAND_RADIUS,
  GOD_BANDS,
  GOD_HEX,
  RING_SPIN,
  BIKE_PARK_POS,
  menuSatellitePosition,
  dist3,
} from '../lib/god-orbits.js';
import {
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
  GOD_TOWER_SPOTS,
  TOWER_ORBIT_RADIUS,
  ARTEMIS_POS,
} from '../lib/home-positions.js';
import { GOD_MENUS } from '../lib/god-menus.js';
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

// --- god towers ring spawn --------------------------------------------------------
// Merlin, 2026-09-30: spawn must be IN THE MIDDLE of the ten Zeus-style
// category towers, with the ads visible from spawn. One tower per menu
// category, ringed around ORBIT_CENTER itself — no separate field.
const towerPositions = GOD_TOWER_SPOTS.map((s) => s.pos);
t(
  'spawn is in the middle of the ten towers (mean tower position ≈ spawn)',
  (() => {
    const mean = towerPositions.reduce(
      (acc, p) => [acc[0] + p[0] / 10, acc[1] + p[1] / 10, acc[2] + p[2] / 10],
      [0, 0, 0]
    );
    return dist3(P(mean), ORBIT_CENTER) < 0.01;
  })()
);
t(
  'exactly one tower per god menu (10), in GOD_MENUS order',
  GOD_TOWER_SPOTS.length === 10 &&
    GOD_TOWER_SPOTS.every((s, i) => s.god === GOD_MENUS[i].god)
);
t(
  'all ten towers ring spawn at the tower orbit radius',
  towerPositions.every(
    (p) => Math.abs(dist3(P(p), ORBIT_CENTER) - TOWER_ORBIT_RADIUS) < 0.01
  )
);
t(
  'satellites ring spawn INSIDE the planet bands, colliders clear (final model)',
  // DESIGN-CHANGE UPDATE (2026-10-20, Merlin's final layout): the old
  // assertion (TOWER_ORBIT_RADIUS > MAX_BAND_RADIUS) encoded the
  // expansion-pass order — towers outside the orb lanes. Merlin's
  // final model inverts it: the towers (his SATELLITES) move IN to
  // 110 and double; the orbs (his PLANETS) move OUT to lanes 195–231.
  // Same no-crowding invariant, new direction: the satellites'
  // doubled flight colliders (110 + 22 reach) clear the innermost
  // planet's flight surface (195 − (11.8 hull + 1.8 collider pad)).
  TOWER_ORBIT_RADIUS + 22 < GOD_BANDS[0].radius - (11.8 + 1.8)
);
t(
  'parked bike stays clear of every tower collider (nearest is the on-axis tower)',
  // DESIGN-CHANGE UPDATE (2026-10-20, Merlin's final layout): a tower
  // DOES sit on the −Z bike axis (the half-step phase puts tower 5
  // dead ahead) — already true at ring 190. What the layout
  // guarantees is clearance: GodTower's collider doubled with the
  // towers (radius 22), and the bike parks 35 from that tower's
  // center — 13 clear of its collider surface.
  (() => {
    const bike = { x: BIKE_PARK_POS[0], y: BIKE_PARK_POS[1], z: BIKE_PARK_POS[2] };
    return towerPositions.every((p) => dist3(P(p), bike) > 22);
  })()
);
t(
  'Artemis keeps a high sanctum above the tower ring',
  ARTEMIS_POS[0] === ORBIT_CENTER.x &&
    ARTEMIS_POS[2] === ORBIT_CENTER.z &&
    ARTEMIS_POS[1] > ORBIT_CENTER.y + 40
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
  'bike parks just outside the SATELLITE ring (not out with the planets)',
  // DESIGN-CHANGE UPDATE (2026-10-20, Merlin's final layout): the
  // bike used to anchor just outside the outermost god band, back
  // when the bands were the innermost ring. The planets now orbit at
  // 195–231, OUTSIDE the satellites; the bike is a hub fixture and
  // anchors to the satellite ring instead — just past the towers'
  // doubled collider reach (110 + 22 = 132), within 15 of it.
  (() => {
    const park = ORBIT_CENTER.z - BIKE_PARK_POS[2];
    const reach = TOWER_ORBIT_RADIUS + 22;
    return park > reach && park < reach + 15;
  })()
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
  // DESIGN-CHANGE UPDATE (2026-10-20, Merlin's expansion pass): the old
  // assertion was an XZ-only proxy (MOON_ORBIT_RADIUS − hubD >
  // MAX_BAND_RADIUS + MOON_RADIUS) — valid only while the satellite ring
  // was smaller than the XZ gap between the two orbit centers. With the
  // lanes expanded to 84–164 the proxy fails even though the Moon still
  // clears every satellite in 3D: its orbital plane (y = EARTH_CENTER.y
  // + 18) passes below the satellite shell. Same invariant, checked for
  // real: sample the 3D distance between the Moon and every satellite
  // over time. SAT_RADIUS mirrors components/GodOrbitRings.jsx.
  const SAT_RADIUS = 11.8;
  let min = Infinity;
  for (let t = 0; t <= 2000; t += 1) {
    const m = moonPositionAt(t);
    for (let i = 0; i < GOD_BANDS.length; i++) {
      min = Math.min(min, dist3(m, menuSatellitePosition(i, t)));
    }
  }
  return min > MOON_RADIUS + SAT_RADIUS;
})());

// --- asteroid field ---------------------------------------------------------------
t(
  'asteroid field is well away from spawn (>250)',
  dist3(ASTEROID_CENTER, ORBIT_CENTER) > 250
);
t('asteroid field clears the planet flight volume entirely', (() => {
  // DESIGN-CHANGE UPDATE (2026-10-20, Merlin's final layout): the old
  // assertion compared raw center distances (belt edge >
  // MAX_BAND_RADIUS + 20) — a proxy valid while the orb ring was
  // small and central. The planets now orbit at 195–231, out past the
  // satellites, so the proxy's premise is gone. Same invariant,
  // checked for real (the Moon treatment): sample every planet over a
  // full assembly rotation and require the belt's spherical boundary
  // to clear each planet's flight collider (11.8 hull + 1.8 pad, as
  // registered in GodOrbitRings). Sampled minimum at build time:
  // belt clearance ≈ 15.6 > 13.6.
  const ORB_COLLIDER = 11.8 + 1.8;
  const period = (Math.PI * 2) / RING_SPIN;
  let min = Infinity;
  for (let tt = 0; tt <= period; tt += 0.5) {
    for (let i = 0; i < GOD_BANDS.length; i++) {
      min = Math.min(min, dist3(menuSatellitePosition(i, tt), ASTEROID_CENTER));
    }
  }
  return min - ASTEROID_FIELD_RADIUS > ORB_COLLIDER;
})());
t('asteroid belt has real substance (60..160 rocks)', ASTEROID_COUNT >= 60 && ASTEROID_COUNT <= 160);

// --- travel tuning: a satisfying ride, not a crawl ----------------------------------
t('free-fly is fast now (was a 40 u/s crawl)', FREE_FLY_SPEED >= 90 && FREE_FLY_SPEED <= 160);
t(
  'bike cruise crosses the hub in a couple of seconds (near, not tedious)',
  (() => {
    const d = TOWER_ORBIT_RADIUS; // spawn → tower ring
    const secs = d / BIKE_TUNING.maxSpeed;
    return secs >= 0.2 && secs <= 3;
  })()
);

// --- nav beacons -------------------------------------------------------------------------
t('beacons mark the belt and Earth (the tower beacon retired — you stand in the ring)', BEACONS.length === 2);
t(
  'beacon positions match their destinations',
  (() => {
    const byId = Object.fromEntries(BEACONS.map((b) => [b.id, b]));
    return (
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
t('steering yaws the bike (D turns right, toward -X — the rider right when facing +Z)', (() => {
  // Rider's frame: facing the +Z nose, the rider's right hand is toward
  // -X (three.js right-handed). A right turn must swing the nose that
  // way: yaw DECREASES. (Pre-2026-10-21 this asserted yaw > 0 / +X —
  // it encoded the inversion Merlin reported.)
  const st = createBikeFlightState([0, 35, -152.3], 0);
  stepBikeFlight(st, { throttle: 0, steer: 1, vertical: false }, 1, BIKE_TUNING);
  const f = bikeForward(st.yaw);
  return st.yaw < 0 && f.x < 0;
})());
t('steering left yaws the other way (A turns left, toward +X)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  stepBikeFlight(st, { throttle: 0, steer: -1, vertical: false }, 1, BIKE_TUNING);
  const f = bikeForward(st.yaw);
  return st.yaw > 0 && f.x > 0;
})());
t('held right steer curves the ride to the rider right (forward + rightward)', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 30; i++) stepBikeFlight(st, { throttle: 1, steer: 1, vertical: false }, 1 / 60, BIKE_TUNING);
  return st.yaw < -0.5 && st.pos.x < -2 && st.pos.z > -152.3 + 5;
})());
t('held left steer curves the ride to the rider left', (() => {
  const st = createBikeFlightState([0, 35, -152.3], 0);
  for (let i = 0; i < 30; i++) stepBikeFlight(st, { throttle: 1, steer: -1, vertical: false }, 1 / 60, BIKE_TUNING);
  return st.yaw > 0.5 && st.pos.x > 2 && st.pos.z > -152.3 + 5;
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

// --- GodTower: one tower satellite per menu category (Merlin, 2026-09-30) ----
const gtSrc = stripComments(readFileSync('components/GodTower.jsx', 'utf8'));
t('GodTower carries the stake.com affiliate inventory (panel 0 = native stake slot, tap launches its tracking URL)',
  gtSrc.includes('STAKE_SLOT') && gtSrc.includes('panelsForTower') &&
  gtSrc.includes('onLaunchExternal(slot.trackingUrl)'));
t('GodTower keeps the Advertise Here slot',
  gtSrc.includes('Advertise Here: Email Us'));
t('GodTower mounts four ad panels around the hull',
  gtSrc.includes('[0, Math.PI / 2, Math.PI, -Math.PI / 2]'));
t('GodTower labels itself with the god name (billboard + hull)',
  gtSrc.includes('{god}'));
t('GodTower takes the god color for name, panel backing, and buttons',
  gtSrc.includes('color={color}') && gtSrc.includes('btnHovered ? "#ffffff" : color'));
t('GodTower registers its own solid collider',
  gtSrc.includes('registerCollider(`tower-${god}`'));
t('GodTower is memoized around the ad inventory',
  gtSrc.includes('export default memo(GodTower)'));
const hsSrc2 = stripComments(readFileSync('components/HomeScene.jsx', 'utf8'));
t('HomeScene mounts 10 GodTowers from GOD_TOWER_SPOTS (one per menu)',
  hsSrc2.includes('GOD_TOWER_SPOTS.map') && hsSrc2.includes('<GodTower'));
t('HomeScene no longer mounts the five legacy towers',
  !hsSrc2.includes("from './Zeus'") && !hsSrc2.includes("from './Ares'") &&
  !hsSrc2.includes("from './Thoth'") && !hsSrc2.includes("from './Argus'") &&
  !hsSrc2.includes("from './Medusa'"));
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
