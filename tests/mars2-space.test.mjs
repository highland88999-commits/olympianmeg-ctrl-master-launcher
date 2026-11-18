// tests/mars2-space.test.mjs
// MARS 2 SPACE (Merlin, Nov 17, 2026 — "make space around mars 2
// and make it a 3d space comparable to the hub", a star field, and
// a spaceship to clear the atmosphere and explore beyond Mars;
// redesigned Nov 17 ~23:37: the ship is a see-through orb that
// floats up out of Mars, and from it the planets of our solar
// system are visible and explorable).
// Run: node --test tests/mars2-space.test.mjs
//
// Covers the contract, not the pixels: the atmosphere's edge, the
// sun + red moon as bodies on the live directions with entry
// triggers, the star field's directions, the solar system (which
// planets are destinations, which are visible bodies), the orb's
// flight model (summon / throttle / climb / turn / auto-land /
// dismount), the red moon world, the registry, the orb's face,
// and — the proof that matters — three full simulated flights:
// summon, climb through the atmosphere into space, cruise to the
// moon, to the sun, and to Jupiter, and trip the entry trigger
// for each destination.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMarsProfile, getTerrainHeight } from '../lib/mars/engine.js';
import { dayNightFor, dateMsForSolarTime, getDayNightPlace } from '../lib/day-night.js';
import { jumpApex, jumpHangTime } from '../lib/planet-walker.js';
import {
  SPACE_ATMO_FLOOR_M, SPACE_ATMO_TOP_M, spaceFactorForAltitude,
  MARS_SUN_BODY_DISTANCE_M, MARS_SUN_BODY_RADIUS_M, MARS_SUN_TRIGGER_RADIUS_M,
  MARS_SUN_PULL_STOP_M,
  MARS_MOON_BODY_DISTANCE_M, MARS_MOON_BODY_RADIUS_M, MARS_MOON_TRIGGER_RADIUS_M,
  MARS_MOON_PULL_STOP_M,
  SPACE_STAR_RADIUS_M, SPACE_STAR_COUNT,
  SOLAR_PLANETS, SOLAR_PLANET_PULL_STOP_M,
  spaceBodyPositions, isTriggerPoint, isMarsSunTriggerPoint, isMarsMoonTriggerPoint,
  pullTargetFor, spaceStarDirections,
  solarPlanetPosition, solarPlanetPositions, solarPlanetTriggerRadiusM,
  isSolarPlanetTriggerPoint, planetPushOut,
} from '../lib/mars2/space.js';
import {
  SHIP_NAME, SHIP_ID, ORB_RADIUS_M,
  SHIP_TOP_SPEED_MPS, SHIP_TOP_SPEED_KMH, SHIP_ACCEL_MPS2, SHIP_BRAKE_MPS2,
  SHIP_TURN_RATE_RAD_S, SHIP_CLIMB_RATE_MPS, SHIP_REST_M,
  SHIP_SUMMON_AHEAD_M, SHIP_BODY_R_M,
  SHIP_MOUNT_CONFIG, shipRideSpeedMps, shipSpeedKmh,
  createShip, summonShip, updateShip, shipIsLanded, canDismountShip,
  requestShipLanding, dismountShip, isShipFlying, forwardOf,
} from '../lib/mars2/spaceship.js';
import {
  MARS_MOON_ROUTE_KEY, MARS_MOON_ROUTE_PATH, MARS_MOON_NAME,
  MARS_MOON_RADIUS, MARS_MOON_GRAVITY, MARS_MOON_WALK_SPEED,
  MARS_MOON_JUMP_SPEED, MARS_MOON_EYE_HEIGHT, MARS_MOON_PLANET,
  MARS_MOON_TRIGGER_RADIUS, MARS_MOON_MARS_DISTANCE, MARS_MOON_MARS_RADIUS,
  MARS_MOON_LANDING_FEET, MARS_MOON_SPAWN_FEET,
  marsMoonLandingState, marsMoonWalkerHeight,
  marsMoonRockPlacements, marsMoonPebblePlacements,
  marsMoonGlobalRockPlacements, marsMoonGlobalPebblePlacements,
  MARS_MOON_GLOBAL_ROCK_COUNT, MARS_MOON_GLOBAL_PEBBLE_COUNT,
} from '../lib/mars2/moon.js';
import { MARS2_SEED, WORLD_RADIUS, WALKER_SPAWN } from '../lib/mars2/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const profile = generateMarsProfile(MARS2_SEED);
const ground = (x, z) => getTerrainHeight(x, z, profile);
const keys = (over = {}) => ({ fwd: false, back: false, left: false, right: false, ...over });
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── the atmosphere's edge ────────────────────────────────────────
describe('mars-2 space: the atmosphere', () => {
  it('the air thins 60 → 150 m, smoothstep, clamped', () => {
    assert.equal(spaceFactorForAltitude(0), 0);
    assert.equal(spaceFactorForAltitude(59), 0);
    assert.equal(spaceFactorForAltitude(150), 1);
    assert.equal(spaceFactorForAltitude(500), 1);
    assert.equal(spaceFactorForAltitude(-50), 0);
    assert.equal(spaceFactorForAltitude(NaN), 0);
    const mid = spaceFactorForAltitude((SPACE_ATMO_FLOOR_M + SPACE_ATMO_TOP_M) / 2);
    assert.ok(approx(mid, 0.5, 1e-9));
    // Monotonic: climbing never brings the air back.
    let prev = -1;
    for (let a = 0; a <= 200; a += 5) {
      const f = spaceFactorForAltitude(a);
      assert.ok(f >= prev, `space factor fell at ${a} m`);
      prev = f;
    }
  });
});

// ── the sun + the red moon as bodies ─────────────────────────────
describe('mars-2 space: the sun and the red moon as bodies', () => {
  it('the bodies sit past the sky visuals, on the live directions', () => {
    const pos = spaceBodyPositions(0.5);
    assert.ok(approx(Math.hypot(pos.sunPos.x, pos.sunPos.y, pos.sunPos.z), MARS_SUN_BODY_DISTANCE_M, 1e-6));
    assert.ok(approx(Math.hypot(pos.moonPos.x, pos.moonPos.y, pos.moonPos.z), MARS_MOON_BODY_DISTANCE_M, 1e-6));
    assert.ok(MARS_SUN_BODY_DISTANCE_M > 380, 'sun body sits past the rig disc at 380');
    assert.ok(MARS_MOON_BODY_DISTANCE_M > 380, 'moon body sits past the sky moon at 380');
    // The sun moves with the TIME slider — the bodies are not painted on.
    const dawn = spaceBodyPositions(0.26);
    const noon = spaceBodyPositions(0.5);
    assert.ok(Math.abs(dawn.sunPos.x - noon.sunPos.x) > 1 || Math.abs(dawn.sunPos.y - noon.sunPos.y) > 1,
      'the sun body moves with timeOfDay');
  });

  it('visibility follows the shared law (sun gone at night, moon gone by day)', () => {
    const noon = spaceBodyPositions(0.5);
    assert.ok(noon.sunVis > 0.9, 'noon sun is fully visible');
    assert.ok(noon.sunVis >= 0 && noon.sunVis <= 1);
    assert.ok(noon.moonVis >= 0 && noon.moonVis <= 1);
    const night = spaceBodyPositions(0.95);
    assert.ok(night.sunVis < 0.05, 'night sun is gone, like the rig disc');
    assert.ok(night.moonVis >= 0 && night.moonVis <= 1);
  });

  it('the triggers are the hub laws: radius + margin, nothing else', () => {
    assert.equal(MARS_SUN_TRIGGER_RADIUS_M, MARS_SUN_BODY_RADIUS_M + 4);
    assert.equal(MARS_MOON_TRIGGER_RADIUS_M, MARS_MOON_BODY_RADIUS_M + 4.5);
    const pos = spaceBodyPositions(0.5);
    assert.ok(isMarsSunTriggerPoint(pos.sunPos, pos));
    assert.ok(isMarsMoonTriggerPoint(pos.moonPos, pos));
    assert.ok(!isMarsSunTriggerPoint({ x: 0, y: 0, z: 0 }, pos));
    assert.ok(!isMarsMoonTriggerPoint({ x: 0, y: 0, z: 0 }, pos));
    // A fly-by more than the margin off the surface does not enter.
    const skim = { x: pos.moonPos.x, y: pos.moonPos.y, z: pos.moonPos.z + MARS_MOON_TRIGGER_RADIUS_M + 5 };
    assert.ok(!isTriggerPoint(skim, pos.moonPos, MARS_MOON_TRIGGER_RADIUS_M));
  });

  it('the pull stops inside the body, on the approach line', () => {
    const pos = spaceBodyPositions(0.5);
    const from = { x: 0, y: 0, z: 0 };
    const sunTarget = pullTargetFor(pos.sunPos, from, MARS_SUN_PULL_STOP_M);
    assert.ok(approx(Math.hypot(sunTarget.x - pos.sunPos.x, sunTarget.y - pos.sunPos.y, sunTarget.z - pos.sunPos.z), MARS_SUN_PULL_STOP_M, 1e-6));
    const moonTarget = pullTargetFor(pos.moonPos, from, MARS_MOON_PULL_STOP_M);
    assert.ok(approx(Math.hypot(moonTarget.x - pos.moonPos.x, moonTarget.y - pos.moonPos.y, moonTarget.z - pos.moonPos.z), MARS_MOON_PULL_STOP_M, 1e-6));
    // Degenerate approach (from the centre itself) never divides by zero.
    const deg = pullTargetFor(pos.moonPos, pos.moonPos, MARS_MOON_PULL_STOP_M);
    assert.ok(Number.isFinite(deg.x) && Number.isFinite(deg.y) && Number.isFinite(deg.z));
  });
});

// ── the star field ───────────────────────────────────────────────
describe('mars-2 space: the star field', () => {
  it('700 shared field stars, unit directions, deterministic', () => {
    const t = Date.now();
    const stars = spaceStarDirections(t);
    assert.equal(stars.length, SPACE_STAR_COUNT);
    assert.equal(SPACE_STAR_COUNT, 700);
    for (const s of stars) {
      assert.ok(approx(Math.hypot(s.x, s.y, s.z), 1, 1e-9), 'every star direction is a unit vector');
      assert.ok(s.mag >= 3.6 && s.mag <= 5.8, 'magnitude in the shared field range');
    }
    // Same minute → same field (the cache); the stars cover the
    // whole sphere, not a dome — below the horizon too.
    const again = spaceStarDirections(t);
    assert.deepEqual(again, stars);
    assert.ok(stars.some((s) => s.y < -0.5), 'stars below the horizon exist (full sphere, not a dome)');
    assert.ok(stars.some((s) => s.y > 0.5), 'stars above too');
    assert.ok(SPACE_STAR_RADIUS_M < 900, 'inside the scene far plane');
  });
});

// ── the ship ─────────────────────────────────────────────────────
describe('mars-2 space: the ship', () => {
  it('identity: the see-through orb, 2.5 m radius, 40 m/s top speed', () => {
    assert.equal(SHIP_NAME, 'Space Orb');
    assert.equal(SHIP_ID, 'space-orb');
    // No GLB: the orb is procedural (a transparent sphere + ring),
    // like the rover — nothing to download, nothing to rig.
    assert.equal(ORB_RADIUS_M, 2.5);
    assert.equal(SHIP_REST_M, ORB_RADIUS_M, 'parked, the bubble touches the dunes');
    assert.equal(SHIP_BODY_R_M, ORB_RADIUS_M);
    assert.equal(SHIP_TOP_SPEED_MPS, 40);
    assert.equal(SHIP_TOP_SPEED_KMH, 144);
    assert.equal(shipRideSpeedMps(), SHIP_TOP_SPEED_MPS);
    assert.equal(SHIP_MOUNT_CONFIG.seatYawOffset, 0, 'an orb has no nose: face the heading exactly');
  });

  it('the speedo clamps like the rover needle', () => {
    assert.equal(shipSpeedKmh(40), 144);
    assert.equal(shipSpeedKmh(100), 144);
    assert.equal(shipSpeedKmh(-100), -144);
    assert.equal(shipSpeedKmh(NaN), 0);
  });

  it('summon: ahead of the walker, facing the walker, boarded', () => {
    const walker = { x: WALKER_SPAWN.x, z: WALKER_SPAWN.z, heading: 0.6 };
    const ship = summonShip(null, walker);
    assert.ok(isShipFlying(ship));
    const f = forwardOf(walker.heading);
    assert.ok(approx(ship.x, walker.x + f.x * SHIP_SUMMON_AHEAD_M));
    assert.ok(approx(ship.z, walker.z + f.z * SHIP_SUMMON_AHEAD_M));
    // Summoning again moves the SAME ship — never a second one.
    const again = summonShip(ship, { x: 50, z: 50, heading: 2 });
    assert.equal(again, ship);
    assert.ok(Math.hypot(again.x - 50, again.z - 50) < SHIP_SUMMON_AHEAD_M + 1);
  });

  it('HORIZONTAL: push goes faster, pull slows, release holds the cruise', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = 100;
    updateShip(ship, keys({ fwd: true }), 'horizontal', 1, ground);
    assert.ok(approx(ship.speed, SHIP_ACCEL_MPS2 * 0.05, 1e-9), 'one 0.05 s step at accel 8');
    assert.equal(ship.vy, 0, 'level flight holds altitude');
    // Full throttle to the cap.
    for (let i = 0; i < 200; i++) updateShip(ship, keys({ fwd: true }), 'horizontal', 0.05, ground);
    assert.equal(ship.speed, SHIP_TOP_SPEED_MPS);
    // Release: the cruise holds (a ship does not stop when you let go).
    const cruise = ship.speed;
    for (let i = 0; i < 20; i++) updateShip(ship, keys(), 'horizontal', 0.05, ground);
    assert.equal(ship.speed, cruise);
    // Pull back: brakes to a hover, never reverses.
    for (let i = 0; i < 100; i++) updateShip(ship, keys({ back: true }), 'horizontal', 0.05, ground);
    assert.equal(ship.speed, 0);
  });

  it('VERTICAL: push climbs, pull descends, release hovers — speed holds', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = 100;
    ship.speed = 20;
    updateShip(ship, keys({ fwd: true }), 'vertical', 0.05, ground);
    assert.equal(ship.vy, SHIP_CLIMB_RATE_MPS);
    assert.equal(ship.speed, 20, 'climbing keeps the cruise');
    updateShip(ship, keys({ back: true }), 'vertical', 0.05, ground);
    assert.equal(ship.vy, -SHIP_CLIMB_RATE_MPS);
    updateShip(ship, keys(), 'vertical', 0.05, ground);
    assert.equal(ship.vy, 0, 'release hovers at this height');
  });

  it('turning: left turns left, right turns right, at any speed', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = 100;
    const h0 = ship.heading;
    updateShip(ship, keys({ left: true }), 'horizontal', 0.05, ground);
    assert.ok(ship.heading > h0, 'left key turns left (heading increases)');
    updateShip(ship, keys({ right: true }), 'horizontal', 0.05, ground);
    assert.ok(approx(ship.heading, h0, 1e-9));
    assert.ok(approx(ship.turn, -SHIP_TURN_RATE_RAD_S, 1e-9));
  });

  it('the floor: never through the dunes — the dunes are the floor at any distance', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = ground(0, 0) + SHIP_REST_M;
    updateShip(ship, keys({ back: true }), 'vertical', 0.05, ground);
    assert.ok(ship.y >= ground(0, 0) + SHIP_REST_M - 1e-9);
    // Far from home, descending stops on the dune, not the y = 0 plane.
    const far = createShip(500, 0, 0);
    far.active = true;
    far.y = ground(500, 0) + 30;
    const floorY = ground(500, 0) + SHIP_REST_M;
    let steps = 0;
    while (far.y > floorY + 0.01 && steps < 4000) {
      updateShip(far, keys({ back: true }), 'vertical', 0.05, ground);
      steps++;
    }
    assert.ok(Math.abs(far.y - floorY) < 0.01, `far ship rests on the dunes at ${far.y.toFixed(2)}`);
    assert.ok(far.y > SHIP_REST_M + 5, 'the floor is the dune, not the y = 0 plane');
  });

  it('no rim, no ceiling: the ship flies as far as it likes', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = 500;
    ship.speed = SHIP_TOP_SPEED_MPS;
    for (let i = 0; i < 300; i++) updateShip(ship, keys({ fwd: true }), 'horizontal', 0.05, ground);
    assert.ok(Math.hypot(ship.x, ship.z) > WORLD_RADIUS * 5, 'well past the rim, unclamped');
    assert.ok(ship.y >= 500, 'no ceiling either');
  });

  it('landing + dismount: OUT in the air auto-lands, then the walker steps out', () => {
    const ship = createShip(0, 0, 0);
    ship.active = true;
    ship.y = 60;
    ship.speed = 10;
    assert.equal(requestShipLanding(ship), true);
    assert.equal(ship.landing, true);
    let steps = 0;
    while (!shipIsLanded(ship) && steps < 4000) {
      updateShip(ship, keys(), 'horizontal', 0.05, ground);
      steps++;
    }
    assert.ok(shipIsLanded(ship), `auto-landing touched down in ${steps} steps`);
    assert.ok(canDismountShip(ship), 'landed, slow, over the dunes');
    const spot = dismountShip(ship);
    assert.ok(!isShipFlying(ship));
    assert.equal(ship.parked, true);
    assert.ok(Math.hypot(spot.x - ship.x, spot.z - ship.z) > 0, 'the walker steps out beside the ship');
    assert.ok(approx(spot.heading, ship.heading, 1e-9));
  });

  it('landing works anywhere: OUT far from home lands the ship on the dunes', () => {
    const ship = createShip(500, 0, 0);
    ship.active = true;
    ship.y = 60;
    assert.equal(requestShipLanding(ship), true);
    assert.equal(ship.landing, true);
    assert.ok(!('landBlocked' in ship), 'no blocked-landing flag any more');
    let steps = 0;
    while (!shipIsLanded(ship) && steps < 4000) {
      updateShip(ship, keys(), 'horizontal', 0.05, ground);
      steps++;
    }
    assert.ok(shipIsLanded(ship), `auto-landing touched down far out in ${steps} steps`);
    assert.ok(canDismountShip(ship), 'landed far out, the walker can step out');
    assert.ok(Math.hypot(ship.x, ship.z) > WORLD_RADIUS, 'still far from home');
  });
});

// ── the red moon world ───────────────────────────────────────────
describe('mars-2 space: the red moon world', () => {
  it('identity + physics mirror the hub Moon', () => {
    assert.equal(MARS_MOON_ROUTE_KEY, 'mars-moon');
    assert.equal(MARS_MOON_ROUTE_PATH, '/mars-moon');
    assert.equal(MARS_MOON_NAME, 'Red Moon');
    assert.equal(MARS_MOON_RADIUS, 14);
    assert.equal(MARS_MOON_GRAVITY, 1.62);
    assert.equal(MARS_MOON_WALK_SPEED, 2.5);
    assert.equal(MARS_MOON_JUMP_SPEED, 3.0);
    assert.equal(MARS_MOON_EYE_HEIGHT, 1.7);
    assert.equal(MARS_MOON_TRIGGER_RADIUS, 18.5);
    assert.deepEqual(MARS_MOON_PLANET, {
      key: 'mars-moon', radius: 14, gravity: 1.62, walkSpeed: 2.5, jumpSpeed: 3.0, eyeHeight: 1.7,
    });
    // The same jump as the hub Moon: 2.78 m apex, 3.70 s hang.
    assert.ok(approx(jumpApex(MARS_MOON_JUMP_SPEED, MARS_MOON_GRAVITY), 2.7778, 0.001));
    assert.ok(approx(jumpHangTime(MARS_MOON_JUMP_SPEED, MARS_MOON_GRAVITY), 3.7037, 0.001));
  });

  it('spawn + landing state stand on the sphere exactly', () => {
    assert.ok(approx(Math.hypot(MARS_MOON_LANDING_FEET.x, MARS_MOON_LANDING_FEET.y, MARS_MOON_LANDING_FEET.z), 14, 1e-9));
    assert.ok(approx(Math.hypot(MARS_MOON_SPAWN_FEET.x, MARS_MOON_SPAWN_FEET.y, MARS_MOON_SPAWN_FEET.z), 14, 1e-9));
    const s = marsMoonLandingState();
    assert.ok(s.grounded);
    assert.ok(approx(marsMoonWalkerHeight(s.feet), 0, 1e-9));
    assert.equal(MARS_MOON_MARS_DISTANCE, 180);
    assert.equal(MARS_MOON_MARS_RADIUS, 45);
  });

  it('seeded scatter: rocks + pebbles on the surface, same every load', () => {
    for (const [fn, count] of [
      [marsMoonRockPlacements, 16], [marsMoonPebblePlacements, 8],
      [marsMoonGlobalRockPlacements, MARS_MOON_GLOBAL_ROCK_COUNT],
      [marsMoonGlobalPebblePlacements, MARS_MOON_GLOBAL_PEBBLE_COUNT],
    ]) {
      const a = fn();
      const b = fn();
      assert.equal(a.length, count);
      assert.deepEqual(a, b, 'seeded — identical every load');
      for (const p of a) {
        const r = Math.hypot(p.pos.x, p.pos.y, p.pos.z);
        assert.ok(approx(r, MARS_MOON_RADIUS - p.size * 0.3, 1e-9), 'sunk slightly, resting on the ground');
      }
    }
  });
});

// ── the solar system (from the orb) ──────────────────────────
describe('mars-2 space: the solar system', () => {
  it('eight planets, every one of our solar system but Mars itself', () => {
    assert.deepEqual(
      SOLAR_PLANETS.map((p) => p.key),
      ['earth', 'moon', 'jupiter', 'venus', 'mercury', 'saturn', 'uranus', 'neptune'],
    );
    // Mars is the ground below — no separate body for it.
    assert.ok(!SOLAR_PLANETS.some((p) => p.key === 'mars'));
  });

  it('destinations vs visible bodies, stated plainly', () => {
    // Full destinations: a world already exists, so flying into
    // the body carries you there.
    const destinations = Object.fromEntries(
      SOLAR_PLANETS.filter((p) => p.route).map((p) => [p.key, p.route]),
    );
    assert.deepEqual(destinations, {
      earth: '/earth-2',
      moon: '/moon',
      jupiter: '/jupiter-2',
    });
    // Visible bodies: no world exists for them, so there is
    // nowhere to land — approach and look, that is the visit.
    const visible = SOLAR_PLANETS.filter((p) => !p.route).map((p) => p.key);
    assert.deepEqual(visible, ['venus', 'mercury', 'saturn', 'uranus', 'neptune']);
    for (const p of SOLAR_PLANETS) {
      assert.equal(isSolarPlanetTriggerPoint({ x: 0, y: 0, z: 0 }, p), false, 'no trigger from the ground');
    }
  });

  it('positions: fixed in the space layer, inside the far plane, triggers at radius + 4', () => {
    for (const p of solarPlanetPositions()) {
      const d = Math.hypot(p.pos.x, p.pos.y, p.pos.z);
      assert.ok(approx(d, p.distanceM, 1e-6), `${p.key} sits at its distance`);
      assert.ok(d + p.radiusM < 3000, `${p.key} stays inside the scene's 3000 far plane`);
      assert.ok(d - p.radiusM > 600, `${p.key} sits past the star field`);
      assert.equal(solarPlanetTriggerRadiusM(p), p.radiusM + 4);
      // The trigger fires at the surface, not from across space.
      const at = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      assert.ok(isSolarPlanetTriggerPoint(at, p), 'at the centre, triggered');
      const far = { x: p.pos.x + p.radiusM + 100, y: p.pos.y, z: p.pos.z };
      assert.ok(!isSolarPlanetTriggerPoint(far, p), '100 m past the surface, not triggered');
      const pull = pullTargetFor(p.pos, at, SOLAR_PLANET_PULL_STOP_M);
      assert.ok(approx(Math.hypot(pull.x - p.pos.x, pull.y - p.pos.y, pull.z - p.pos.z), SOLAR_PLANET_PULL_STOP_M, 1e-6));
    }
  });

  it('Saturn wears rings; the Moon wears the photo; the rest wear procedural tints', () => {
    const saturn = SOLAR_PLANETS.find((p) => p.key === 'saturn');
    assert.equal(saturn.rings, true);
    assert.ok(SOLAR_PLANETS.filter((p) => p.key !== 'saturn').every((p) => !p.rings));
    const moon = SOLAR_PLANETS.find((p) => p.key === 'moon');
    assert.equal(moon.photo, true);
    assert.ok(SOLAR_PLANETS.filter((p) => p.key !== 'moon').every((p) => !p.photo));
    const jupiter = SOLAR_PLANETS.find((p) => p.key === 'jupiter');
    assert.equal(jupiter.family, 'gasGiant');
    const mercury = SOLAR_PLANETS.find((p) => p.key === 'mercury');
    assert.equal(mercury.family, 'lunarRegolith');
    const earth = SOLAR_PLANETS.find((p) => p.key === 'earth');
    assert.equal(earth.family, 'earthLike');
  });

  it('planetPushOut: a visible planet is solid — the orb slides around it, never through it', () => {
    const saturn = SOLAR_PLANETS.find((p) => p.key === 'saturn');
    const centre = solarPlanetPosition(saturn);
    // Dead centre: pushed out to radius + margin along the radial.
    const out = planetPushOut(centre, saturn, SHIP_BODY_R_M);
    assert.ok(approx(Math.hypot(out.x - centre.x, out.y - centre.y, out.z - centre.z), saturn.radiusM + SHIP_BODY_R_M, 1e-6));
    // Outside the surface: untouched.
    const far = { x: centre.x + saturn.radiusM + 100, y: centre.y, z: centre.z };
    assert.deepEqual(planetPushOut(far, saturn, SHIP_BODY_R_M), far);
  });

  it('the space layer renders the planets: bodies, labels, inside-orb camera', () => {
    const space = read('components/mars2/Mars2Space.jsx');
    assert.match(space, /solarPlanetPositions/);
    assert.match(space, /isSolarPlanetTriggerPoint/);
    assert.match(space, /planetPushOut/);
    assert.match(space, /SOLAR_PLANET_PULL_STOP_M/);
    assert.match(space, /materialForPlanet/);
    assert.match(space, /ringGeometry/, 'Saturn wears its rings');
    assert.match(space, /VanGoghText/, 'each planet wears its name');
    assert.match(space, /camera\.position\.set\(ship\.x, ship\.y, ship\.z\)/, 'the camera sits inside the orb');
    assert.match(space, /recenterLookOffset/, 'the gaze recenters on release');
    assert.match(space, /DoubleSide/, 'the glass shell reads from inside and out');
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.match(scene, /far: 3000/, 'the far plane holds the planets');
    assert.match(scene, /SPACE ORB/);
  });

  it('the labels wear a BUNDLED font — never the troika CDN default', () => {
    // The drei/troika default resolves its font through the
    // jsdelivr CDN; if that fetch never returns, the font load
    // suspends the R3F first render forever and Mars 2 stays on
    // SYNTHESIZING (found headlessly Nov 18, 2026). The space
    // labels carry an explicit local font instead.
    const fontPath = path.join(repo, 'public/fonts/DejaVuSans.ttf');
    assert.ok(fs.existsSync(fontPath), 'the bundled font exists');
    const header = fs.readFileSync(fontPath).subarray(0, 4);
    assert.equal(header.toString('ascii'), '\u0000\u0001\u0000\u0000', 'a real TrueType font');
    for (const p of ['components/mars2/Mars2Space.jsx', 'components/mars2/MarsMoonScene.jsx']) {
      const src = read(p);
      const uses = src.match(/<VanGoghText[^>]*>/g) || [];
      assert.ok(uses.length > 0, `${p} uses VanGoghText`);
      for (const u of uses) {
        assert.match(u, /font="\/fonts\/DejaVuSans\.ttf"/, `${p}: every label carries the bundled font`);
      }
      assert.doesNotMatch(src, /<VanGoghText(?![^>]*font=)/, `${p}: no label without a font`);
    }
  });
});

// ── the flights (the headless proof) ─────────────────────────────
// A pilot policy, the way a thumb flies it: build speed level,
// flip to VERTICAL to climb while cruising, flip back to
// HORIZONTAL to cruise — and near the target, slow down (a
// 40 m/s turn circles at 28 m, outside the 18.5 m trigger; at
// 6 m/s the turn tightens to 4 m and the ship spirals in).
// dt 0.05 s, the scene's clamp.
function flyToTarget(targetPos, { timeOfDay, nowMs, maxSteps = 3000, triggerRadiusM = null } = {}) {
  const positions = spaceBodyPositions(timeOfDay, nowMs);
  const walker = { x: WALKER_SPAWN.x, z: WALKER_SPAWN.z, heading: 0.6 };
  const ship = summonShip(null, walker);
  ship.y = ground(ship.x, ship.z) + SHIP_REST_M;
  const wrapAngle = (a) => {
    let r = (a + Math.PI) % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    return r - Math.PI;
  };
  let triggered = false;
  let steps = 0;
  let maxAlt = 0;
  for (; steps < maxSteps; steps++) {
    maxAlt = Math.max(maxAlt, ship.y);
    const tp = targetPos(positions);
    const triggerR = triggerRadiusM !== null
      ? triggerRadiusM
      : (tp === positions.moonPos ? MARS_MOON_TRIGGER_RADIUS_M : MARS_SUN_TRIGGER_RADIUS_M);
    if (isTriggerPoint(ship, tp, triggerR)) {
      triggered = true;
      break;
    }
    const dx = tp.x - ship.x;
    const dz = tp.z - ship.z;
    const dy = tp.y - ship.y;
    const dist3 = Math.hypot(dx, dy, dz);
    const desired = Math.atan2(-dx, -dz);
    const diff = wrapAngle(desired - ship.heading);
    const k = keys();
    if (diff > 0.05) k.left = true;
    else if (diff < -0.05) k.right = true;
    // Slow near the target so the turn can tighten into it.
    const targetSpeed = Math.max(6, Math.min(40, dist3 / 4));
    let axis = 'horizontal';
    if (ship.speed < 15) {
      // Build speed level first — climbing at a standstill goes
      // straight up and nowhere.
      k.fwd = true;
    } else if (Math.abs(dy) > 5) {
      // Climb (or descend) while the cruise carries on.
      axis = 'vertical';
      if (dy > 0) k.fwd = true;
      else k.back = true;
    } else if (ship.speed < targetSpeed - 0.5) {
      k.fwd = true;
    } else if (ship.speed > targetSpeed + 0.5) {
      k.back = true;
    }
    updateShip(ship, k, axis, 0.05, ground);
  }
  return { ship, triggered, steps, maxAlt, positions };
}

// The next slot (within 48 h) when the moon is well up — the moon
// is above the horizon about half the day, so the search always
// lands one. The flight itself runs on a frozen clock (the target
// does not drift mid-flight), which is the honest headless stand-in
// for a pilot steering at a slowly moving moon.
function nextMoonUpSlot(nowMs) {
  for (let m = 0; m < 96; m++) {
    const t = nowMs + m * 30 * 60000;
    const pos = spaceBodyPositions(0.95, t);
    if (pos.moonPos.y > 150) return t;
  }
  return null;
}

describe('mars-2 space: the flights', () => {
  it('FLIGHT 1 — summon, climb through the atmosphere, cruise to the red moon, trip the trigger', () => {
    const nowMs = nextMoonUpSlot(Date.now());
    assert.ok(nowMs !== null, 'a moon-up slot exists within 48 h');
    const { ship, triggered, steps, maxAlt, positions } = flyToTarget(
      (p) => p.moonPos, { timeOfDay: 0.95, nowMs },
    );
    assert.ok(maxAlt >= SPACE_ATMO_TOP_M, `climbed through the atmosphere (max ${maxAlt.toFixed(1)} m)`);
    assert.equal(spaceFactorForAltitude(maxAlt), 1, 'in space at the top of the climb');
    assert.ok(triggered, `reached the red moon within the step budget (used ${steps})`);
    assert.ok(steps < 3000);
    const pull = pullTargetFor(positions.moonPos, ship, MARS_MOON_PULL_STOP_M);
    assert.ok(approx(Math.hypot(pull.x - positions.moonPos.x, pull.y - positions.moonPos.y, pull.z - positions.moonPos.z), MARS_MOON_PULL_STOP_M, 1e-6));
    // The destination the pull opens is the moon world.
    assert.equal(MARS_MOON_ROUTE_PATH, '/mars-moon');
  });

  it('FLIGHT 2 — summon, climb, cruise to the sun at noon, trip the trigger', () => {
    const { ship, triggered, steps, maxAlt, positions } = flyToTarget(
      (p) => p.sunPos, { timeOfDay: 0.5, nowMs: Date.now() },
    );
    assert.ok(maxAlt >= SPACE_ATMO_TOP_M, `climbed through the atmosphere (max ${maxAlt.toFixed(1)} m)`);
    assert.ok(triggered, `reached the sun within the step budget (used ${steps})`);
    assert.ok(steps < 3000);
    const pull = pullTargetFor(positions.sunPos, ship, MARS_SUN_PULL_STOP_M);
    assert.ok(approx(Math.hypot(pull.x - positions.sunPos.x, pull.y - positions.sunPos.y, pull.z - positions.sunPos.z), MARS_SUN_PULL_STOP_M, 1e-6));
    // The destination the pull opens is the EXISTING Sun Base —
    // Mars's sun IS the Sun; there is no second interior.
    assert.ok(positions.sunVis > 0.9, 'noon sun fully visible');
  });

  it('FLIGHT 3 — summon, climb, cruise to Jupiter, trip the trigger', () => {
    const jupiter = SOLAR_PLANETS.find((p) => p.key === 'jupiter');
    const target = solarPlanetPosition(jupiter);
    const { ship, triggered, steps, maxAlt } = flyToTarget(
      () => target,
      { timeOfDay: 0.5, nowMs: Date.now(), triggerRadiusM: solarPlanetTriggerRadiusM(jupiter) },
    );
    assert.ok(maxAlt >= SPACE_ATMO_TOP_M, `climbed through the atmosphere (max ${maxAlt.toFixed(1)} m)`);
    assert.ok(triggered, `reached Jupiter within the step budget (used ${steps})`);
    assert.ok(steps < 3000);
    const pull = pullTargetFor(target, ship, SOLAR_PLANET_PULL_STOP_M);
    assert.ok(approx(Math.hypot(pull.x - target.x, pull.y - target.y, pull.z - target.z), SOLAR_PLANET_PULL_STOP_M, 1e-6));
    // The destination the pull opens is the Jupiter 2 world.
    assert.equal(jupiter.route, '/jupiter-2');
  });

  it('the moon body and the sky moon agree on the direction', () => {
    // The body the ship flies to hangs where the sky moon already
    // does — the pilot aims at the moon they can see. The check
    // runs on the slider-shifted date (dateMsForSolarTime moves
    // the clock up to ±12 h to hit the solar time, and the moon
    // moves with it), frozen so both sides read the same instant.
    const t = Date.now();
    const place = getDayNightPlace();
    const dateMs = dateMsForSolarTime(0.95, place.lat, place.lon, t);
    const dn = dayNightFor(dateMs, place.lat, place.lon);
    const pos = spaceBodyPositions(0.95, t);
    const dot = pos.moonPos.x * dn.moonVec.x + pos.moonPos.y * dn.moonVec.y + pos.moonPos.z * dn.moonVec.z;
    const mag = Math.hypot(pos.moonPos.x, pos.moonPos.y, pos.moonPos.z);
    assert.ok(approx(dot / mag, 1, 1e-6), 'moon body direction == moonVec');
  });
});

// ── wiring: routes, scenes, registry, faces ─────────────────────
describe('mars-2 space: wiring', () => {
  it('the moon route + scene exist and the scene walks the sphere', () => {
    assert.ok(fs.existsSync(path.join(repo, 'app/mars-moon/page.jsx')));
    assert.ok(fs.existsSync(path.join(repo, 'components/mars2/MarsMoonScene.jsx')));
    const page = read('app/mars-moon/page.jsx');
    assert.match(page, /MarsMoonScene/);
    assert.match(page, /travel\('\/mars-2', 'Mars 2'\)/);
    const scene = read('components/mars2/MarsMoonScene.jsx');
    assert.match(scene, /stepSphereWalker/);
    assert.match(scene, /MARS_MOON_PLANET/);
    assert.match(scene, /#ff6a4a/, 'the moon wrap tinted red');
    assert.match(scene, /planetMaps\('marsRegolith'/, 'Mars wears its own regolith');
  });

  it('Mars 2 wires the space layer: sky, stars, bodies, ship, SUMMON menu, FLIGHT AXIS', () => {
    const scene = read('components/mars2/Mars2Scene.jsx');
    assert.match(scene, /Mars2SpaceSky/);
    assert.match(scene, /Mars2SpaceStars/);
    assert.match(scene, /Mars2SpaceBodies/);
    assert.match(scene, /ShipModel/);
    assert.match(scene, /ShipRig/);
    assert.match(scene, /shipCmd/);
    assert.match(scene, /onSpaceEnter/);
    assert.match(scene, /spaceFRef/);
    const space = read('components/mars2/Mars2Space.jsx');
    assert.match(space, /pullEasedProgress/, 'the hub pull, reused');
    assert.match(space, /MARS_SUN_ENTRY_ROUTE/);
    assert.match(space, /\/sun-base\?from=mars-2/);
    const page = read('app/mars-2/page.jsx');
    assert.match(page, /VehicleSelectMenu/);
    assert.match(page, /normalizeVehicleOptions/);
    assert.match(page, /flightAxis/);
    assert.match(page, /fn="flight-axis"/);
    assert.match(page, /mode === "fly"/);
    assert.match(page, /onSpaceEnter={handleSpaceEnter}/);
    assert.match(page, /SHIP_TOP_SPEED_MPS/);
  });

  it('the sun entry reuses the existing Sun Base — and the base returns to Mars 2', () => {
    const sunBase = read('app/sun-base/page.jsx');
    assert.match(sunBase, /from=mars-2/);
    assert.match(sunBase, /backRoute/);
    assert.match(sunBase, /'\/mars-2'/);
    // The Sun Base is already registered — no second registration.
    const sats = read('lib/i18n/satellites.ts');
    assert.match(sats, /\{ key: "sun-base", route: "\/sun-base"/);
  });

  it('the red moon is registered under the dual-registry rule', () => {
    const menus = read('lib/god-menus.js');
    assert.match(menus, /'mars-moon',/);
    const sats = read('lib/i18n/satellites.ts');
    assert.match(sats, /\{ key: "mars-moon", route: "\/mars-moon", pos: "ARES", section: "OBSERVATORY", constellation: "ARGUS" \}/);
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    assert.equal(en['sat.mars-moon.title'], 'Red Moon');
    assert.equal(en['sat.mars-moon.subtitle'], "Walk Mars's red moon above Mars 2");
    // Every locale carries the keys (the house pattern: English text).
    for (const name of fs.readdirSync(path.join(repo, 'lib/i18n/locales'))) {
      if (!name.endsWith('.json')) continue;
      const loc = JSON.parse(read(`lib/i18n/locales/${name}`));
      assert.equal(loc['sat.mars-moon.title'], 'Red Moon', name);
      assert.equal(loc['sat.mars-moon.subtitle'], "Walk Mars's red moon above Mars 2", name);
    }
  });

  it('the orb wears its own TRON face in the SUMMON menu', () => {
    const face = path.join(repo, 'public/images/shadow-realm/ui/tron-vehicle-space-orb.webp');
    assert.ok(fs.existsSync(face), 'the space-orb face exists');
    const header = fs.readFileSync(face).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP');
    const gen = read('scripts/gen-tron-space-orb-art.py');
    assert.match(gen, /def space_orb/);
    assert.match(gen, /tron-vehicle-space-orb\.webp/);
  });

  it('no nova-flight anywhere in the new work', () => {
    for (const p of [
      'lib/mars2/space.js', 'lib/mars2/spaceship.js', 'lib/mars2/moon.js',
      'components/mars2/Mars2Space.jsx', 'components/mars2/MarsMoonScene.jsx',
      'app/mars-moon/page.jsx',
    ]) {
      assert.doesNotMatch(read(p), /nova-flight/);
    }
  });
});
