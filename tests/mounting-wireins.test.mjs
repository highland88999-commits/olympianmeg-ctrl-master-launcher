// tests/mounting-wireins.test.mjs — THE SUMMONABLE / VEHICLE MOUNTS
// WIRED TO THE SHARED MODULE (Merlin, Nov 15 ~01:29).
//
// The shared mounting module is lib/mounting.js; the horse layer
// (app/middle-earth/riding.js) is the reference. This file pins
// the four mounts this worker owns — Earth 1 TRON bike, hub bike,
// Jupiter 2 speeder, Mars 2 rover — against the shared module:
// each mount's config in the shared shape, its mount/dismount
// math routed through the shared functions, and its own speed
// and feel untouched. No test renders a page (the house's known
// gate gap — the on-phone feel verdict stays Merlin's).
//
// Run: node --test tests/mounting-wireins.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMountConfig, resolveMountConfig,
  mountSpot, dismountSpot, mountYawForWalker, mountedSpeedMps,
} from '../lib/mounting.js';
import { tuningFor } from '../lib/nova-flight.js';
import { BIKE_TUNING } from '../lib/hub-layout.js';
import {
  EARTH_BIKE_MOUNT_CONFIG, EARTH_BIKE_GROUND_SPEED_FACTOR, bikeState,
} from '../lib/earth/parachute.js';
import {
  HUB_BIKE_MOUNT_CONFIG, dismountPosition, DISMOUNT_SIDE, DISMOUNT_EYE,
} from '../lib/rider-state.js';
import {
  WALK_SPEED, SPEEDER_SPEED,
} from '../lib/jupiter2/profile.js';
import {
  SPEEDER_MOUNT_CONFIG, SPEEDER_MOUNTED_EYE_M,
  createSpeederState, summonSpeeder, dismountSpeeder, dismissSpeeder,
  stepSpeeder, speedFor,
} from '../lib/jupiter2/speeder.js';
import {
  ROVER_MOUNT_CONFIG, ROVER_TOP_SPEED_MPS, ROVER_REVERSE_SPEED_MPS,
  ROVER_SUMMON_AHEAD_M, ROVER_DISMOUNT_SIDE_M,
  createRover, summonRover, updateRover, dismountRover,
  isRoverDriving, roverRideSpeedMps, forwardOf,
} from '../lib/mars2/rovers.js';
import {
  SPEEDER_MOUNT_CONFIG as SW_SPEEDER_MOUNT_CONFIG,
  SPEEDER_PROMPT_M, SPEEDER_RIDE_SPEED_MPS, SPEEDER_DISMOUNT_SIDE_M,
  SPEEDER_MOUNT_HEIGHT_M,
  nearestSpeederInRange, speederInPromptRange, speederDismountSpot,
  speederRideSpeedMps,
} from '../app/star-wars/riding.js';
import {
  VEHICLE_TYPES, VEHICLE_PROMPT_DIST,
  createVehicleState, dismountPoint, vehicleInPromptRange,
} from '../app/star-wars/vehicles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const keys = (over = {}) => ({ fwd: false, back: false, left: false, right: false, ...over });

/* ---- the registry: every mount carries the shared shape ---- */
describe('registry: one shared shape, four mounts, each its own numbers', () => {
  it('every mount config resolves to a full shared config', () => {
    for (const [name, config] of [
      ['Earth 1 bike', EARTH_BIKE_MOUNT_CONFIG],
      ['hub bike', HUB_BIKE_MOUNT_CONFIG],
      ['Jupiter 2 speeder', SPEEDER_MOUNT_CONFIG],
      ['Mars 2 rover', ROVER_MOUNT_CONFIG],
    ]) {
      const resolved = resolveMountConfig(config);
      for (const field of [
        'promptRangeM', 'rideSpeedMps', 'saddleFraction', 'riderHipFraction',
        'dismountSideM', 'seatYawOffset', 'mountHeightM', 'riderHeightM', 'mountBlendS',
      ]) {
        assert.ok(field in resolved, `${name} config carries ${field}`);
      }
      assert.equal(resolved.promptRangeM, 4, `${name}: the prompt range is the reference 4 (unused — all four are summon/button mounts, never walked up to)`);
    }
  });

  it('each mount keeps its own ride speed, read through the shared module', () => {
    assert.equal(mountedSpeedMps(EARTH_BIKE_MOUNT_CONFIG), 180, 'Earth 1 bike: 180 m/s over the ground');
    assert.equal(mountedSpeedMps(HUB_BIKE_MOUNT_CONFIG), 150, 'hub bike: 150 hub units/s');
    assert.equal(mountedSpeedMps(SPEEDER_MOUNT_CONFIG), 28, 'Jupiter 2 speeder: 28 m/s');
    assert.equal(mountedSpeedMps(ROVER_MOUNT_CONFIG), 12, 'Mars 2 rover: 12 m/s');
    assert.equal(mountedSpeedMps(EARTH_BIKE_MOUNT_CONFIG), tuningFor('wisp').maxSpeed * EARTH_BIKE_GROUND_SPEED_FACTOR, 'Earth 1: the 180 is the Wisp tuning (60) × the globe step (×3), not a second number');
    assert.equal(mountedSpeedMps(HUB_BIKE_MOUNT_CONFIG), BIKE_TUNING.maxSpeed, 'hub: the 150 is the flight tuning cruise, read straight from it');
  });

  it('two dismount laws, recorded honestly per mount', () => {
    // Exact place + vanish (Earth 1's law): the walker takes the
    // mount's own spot — mountSpot, never a flank dismount.
    assert.equal(SPEEDER_MOUNT_CONFIG.dismountSideM, 0, 'speeder: exact place, side 0');
    assert.equal(EARTH_BIKE_MOUNT_CONFIG.dismountSideM, 0, 'Earth 1 bike: exact place, side 0');
    // Flank dismount (the shared law): beside the mount, still rideable.
    assert.equal(ROVER_MOUNT_CONFIG.dismountSideM, ROVER_DISMOUNT_SIDE_M, 'rover: flank 1.8 m');
    assert.equal(HUB_BIKE_MOUNT_CONFIG.dismountSideM, DISMOUNT_SIDE, 'hub bike: flank 3.4 m');
  });

  it('no mount needs the horse +PI turn — every model already faces forward', () => {
    for (const [name, config] of [
      ['Earth 1 bike', EARTH_BIKE_MOUNT_CONFIG],
      ['hub bike', HUB_BIKE_MOUNT_CONFIG],
      ['Jupiter 2 speeder', SPEEDER_MOUNT_CONFIG],
      ['Mars 2 rover', ROVER_MOUNT_CONFIG],
      ['Star Wars speeder', SW_SPEEDER_MOUNT_CONFIG],
    ]) {
      assert.equal(config.seatYawOffset, 0, `${name}: seat yaw offset 0`);
      assert.equal(mountYawForWalker(config, 1.2), 1.2, `${name}: the mount yaw is the walker yaw`);
    }
  });
});

/* ---- Jupiter 2 speeder: summon = mount, dismount = exact place + vanish ---- */
describe('jupiter-2 speeder (Earth 1 summon contract, through the shared module)', () => {
  it('config: 28 m/s, exact-place dismount, no +PI turn, craft 1.15 m tall', () => {
    assert.equal(SPEEDER_MOUNT_CONFIG.rideSpeedMps, SPEEDER_SPEED, 'ride speed is the profile 28');
    assert.equal(SPEEDER_MOUNT_CONFIG.dismountSideM, 0, 'dismount side 0 — exact place, not a flank');
    assert.equal(SPEEDER_MOUNT_CONFIG.seatYawOffset, 0, 'no +PI turn');
    assert.equal(SPEEDER_MOUNT_CONFIG.mountHeightM, 1.15, 'craft height is the fin tips');
  });

  it('summon auto-mounts at the walker, facing the walker\'s way', () => {
    const sp = createSpeederState();
    assert.equal(summonSpeeder(sp, { x: 10, z: 26, yaw: 0.6 }), true);
    assert.equal(sp.summoned, true, 'summoned');
    assert.equal(sp.mounted, true, 'auto-mounted — summon IS the mount');
    assert.equal(sp.x, 10, 'at the walker\'s x');
    assert.equal(sp.z, 26, 'at the walker\'s z');
    assert.ok(approx(sp.yaw, 0.6), 'facing the walker\'s way (shared mount yaw, offset 0)');
  });

  it('dismount: the walker takes the craft\'s exact place and the craft vanishes', () => {
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 10, z: 26, yaw: 0.6 });
    for (let i = 0; i < 10; i++) {
      stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 0.05);
    }
    const before = { x: sp.x, z: sp.z, yaw: sp.yaw };
    const pose = dismountSpeeder(sp);
    assert.ok(approx(pose.x, before.x), 'walker takes the craft\'s x');
    assert.ok(approx(pose.z, before.z), 'walker takes the craft\'s z');
    assert.ok(approx(pose.yaw, before.yaw), 'walker keeps the craft\'s yaw');
    assert.deepEqual(
      { x: pose.x, z: pose.z },
      mountSpot(before),
      'the dismount spot IS the shared mountSpot — the craft\'s own position',
    );
    assert.equal(sp.summoned, false, 'the craft vanishes');
    assert.equal(sp.mounted, false, 'off the craft');
    assert.equal(sp.speed, 0, 'stopped');
  });

  it('speed: 28 m/s cruise, 42 on BOOST, 11.2 in reverse — the profile numbers, untouched', () => {
    assert.equal(speedFor('speeder'), 28, 'mode speed is the shared read-out: 28');
    assert.equal(speedFor('walk'), WALK_SPEED, 'walk is still the 6 m/s walk');
    const cruise = createSpeederState();
    summonSpeeder(cruise, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 60; i++) {
      stepSpeeder(cruise, { fwd: 1, back: 0, left: 0, right: 0, boost: false }, 0.05);
    }
    assert.ok(approx(cruise.speed, 28), `cruise tops out at 28, got ${cruise.speed}`);
    const boosted = createSpeederState();
    summonSpeeder(boosted, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 60; i++) {
      stepSpeeder(boosted, { fwd: 1, back: 0, left: 0, right: 0, boost: true }, 0.05);
    }
    assert.ok(approx(boosted.speed, 42), `BOOST tops out at 28 × 1.5 = 42, got ${boosted.speed}`);
    const reversing = createSpeederState();
    summonSpeeder(reversing, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 60; i++) {
      stepSpeeder(reversing, { fwd: 0, back: 1, left: 0, right: 0, boost: false }, 0.05);
    }
    assert.ok(approx(reversing.speed, -11.2), `reverse tops out at 28 × 0.4 = 11.2, got ${reversing.speed}`);
  });

  it('mounted eye: 2.2 m, the scene\'s own number, now named', () => {
    assert.equal(SPEEDER_MOUNTED_EYE_M, 2.2, 'mounted eye 2.2 m — a half-metre above the 1.7 m on-foot eye');
    assert.ok(read('components/jupiter2/Jupiter2Scene.jsx').includes('SPEEDER_MOUNTED_EYE_M'), 'the scene rides the named constant, not a bare literal');
  });

  it('pin: speeder.js routes mount/dismount through the shared module', () => {
    const src = read('lib/jupiter2/speeder.js');
    assert.ok(src.includes("from '../mounting.js'"), 'imports lib/mounting.js');
    assert.ok(src.includes('SPEEDER_MOUNT_CONFIG'), 'carries its mount config');
    assert.ok(src.includes('sharedMountYaw('), 'the summon yaw goes through the shared mount yaw');
    assert.ok(src.includes('mountSpot('), 'the dismount goes through the shared mountSpot (exact place)');
    assert.ok(src.includes('mountedSpeedMps('), 'the mode speed goes through the shared speed read-out');
  });
});

/* ---- Mars 2 rover: summon ahead, drive 12 / reverse 4, dismount to the flank, stays parked ---- */
describe('mars-2 rover (summon ahead, flank dismount, stays parked)', () => {
  const flat = () => 0;

  it('config: 12 m/s, flank 1.8 m, no +PI turn, deck 1.19 m', () => {
    assert.equal(ROVER_MOUNT_CONFIG.rideSpeedMps, ROVER_TOP_SPEED_MPS, 'ride speed is the 12 m/s top speed');
    assert.equal(ROVER_MOUNT_CONFIG.dismountSideM, ROVER_DISMOUNT_SIDE_M, 'dismount side is the rover\'s 1.8 m');
    assert.equal(ROVER_MOUNT_CONFIG.seatYawOffset, 0, 'no +PI turn');
    assert.equal(ROVER_MOUNT_CONFIG.mountHeightM, 1.19, 'mount height is the deck top');
    assert.equal(roverRideSpeedMps(), 12, 'the shared read-out is 12 m/s');
  });

  it('summon: 2.5 m ahead of the walker, facing the walker\'s way, one rover per user', () => {
    const walker = { x: 0, z: 0, heading: 0 };
    const rover = summonRover(null, walker);
    assert.ok(approx(rover.x, 0), 'ahead is -z at heading 0: x stays 0');
    assert.ok(approx(rover.z, -ROVER_SUMMON_AHEAD_M), `2.5 m ahead, got z=${rover.z}`);
    assert.ok(approx(rover.heading, 0), 'facing the walker\'s way (shared mount yaw, offset 0)');
    assert.equal(rover.active, true, 'boarding on summon');
    assert.equal(rover.parked, false, 'not parked while driven');
    // Summon again: the SAME rover moves to the walker — never a second one.
    const again = summonRover(rover, { x: 10, z: 10, heading: Math.PI / 2 });
    assert.equal(again, rover, 'summon-again returns the same rover object');
    const f = forwardOf(Math.PI / 2);
    assert.ok(approx(rover.x, 10 + f.x * ROVER_SUMMON_AHEAD_M), 'moved ahead of the new walker spot');
    assert.ok(approx(rover.z, 10 + f.z * ROVER_SUMMON_AHEAD_M), 'moved ahead of the new walker spot');
    assert.ok(approx(rover.heading, Math.PI / 2), 'turned with the walker');
    assert.equal(rover.speed, 0, 're-summon stops it');
  });

  it('dismount: 1.8 m out to the rover\'s right flank, facing its way — the shared dismount', () => {
    const rover = createRover(10, 20, 0.5);
    rover.active = true;
    const spot = dismountRover(rover);
    const expected = dismountSpot({ x: 10, z: 20, yaw: 0.5 }, ROVER_MOUNT_CONFIG);
    assert.ok(approx(spot.x, expected.x), 'the dismount spot IS the shared dismountSpot');
    assert.ok(approx(spot.z, expected.z), 'the dismount spot IS the shared dismountSpot');
    const d = Math.hypot(spot.x - 10, spot.z - 20);
    assert.ok(approx(d, ROVER_DISMOUNT_SIDE_M), `dismount is 1.8 m out, got ${d}`);
    assert.ok(d > 0, 'beside the rover, never at its centre');
    assert.ok(approx(spot.heading, 0.5), 'facing the way the rover faces');
    assert.equal(rover.active, false, 'no longer driving');
    assert.equal(rover.parked, true, 'stays parked where it was left');
    assert.equal(rover.speed, 0, 'stopped');
    assert.equal(isRoverDriving(rover), false, 'not driving after the dismount');
    // And the parked rover is still summonable: summon-again re-boards the same one.
    const again = summonRover(rover, { x: 10, z: 20, heading: 0.5 });
    assert.equal(again, rover, 'the parked rover is the one that comes back');
    assert.equal(rover.active, true, 'driving again');
    assert.equal(rover.parked, false, 'no longer parked');
  });

  it('drive: tops out at 12 m/s forward, 4 m/s in reverse — the caps, untouched', () => {
    const fwd = createRover(0, 0, 0);
    fwd.active = true;
    for (let i = 0; i < 100; i++) updateRover(fwd, keys({ fwd: true }), 0.05, flat, 88);
    assert.ok(approx(fwd.speed, ROVER_TOP_SPEED_MPS), `forward tops out at 12, got ${fwd.speed}`);
    assert.ok(approx(roverRideSpeedMps(), fwd.speed), 'the shared read-out agrees with the driven cap');
    const rev = createRover(0, 0, 0);
    rev.active = true;
    for (let i = 0; i < 100; i++) updateRover(rev, keys({ back: true }), 0.05, flat, 88);
    assert.ok(approx(rev.speed, -ROVER_REVERSE_SPEED_MPS), `reverse tops out at -4, got ${rev.speed}`);
  });

  it('pin: rovers.js routes mount/dismount through the shared module', () => {
    const src = read('lib/mars2/rovers.js');
    assert.ok(src.includes("from '../mounting.js'"), 'imports lib/mounting.js');
    assert.ok(src.includes('ROVER_MOUNT_CONFIG'), 'carries its mount config');
    assert.ok(src.includes('sharedMountYaw('), 'the summon heading goes through the shared mount yaw');
    assert.ok(src.includes('sharedDismountSpot('), 'the dismount goes through the shared dismountSpot');
  });
});

/* ---- Star Wars landspeeder: walk-up prompt, flank dismount, stays parked ---- */
describe('star-wars landspeeder (walk-up prompt mount — the horse act, not a summon)', () => {
  it('config: 18 m/s, prompt 3.5 m, flank 3.8 m, no +PI turn, craft 1.83 m', () => {
    const resolved = resolveMountConfig(SW_SPEEDER_MOUNT_CONFIG);
    for (const field of [
      'promptRangeM', 'rideSpeedMps', 'saddleFraction', 'riderHipFraction',
      'dismountSideM', 'seatYawOffset', 'mountHeightM', 'riderHeightM', 'mountBlendS',
    ]) {
      assert.ok(field in resolved, `Star Wars speeder config carries ${field}`);
    }
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.rideSpeedMps, VEHICLE_TYPES.landspeeder.cruise, 'ride speed is the landspeeder cruise 18');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.rideSpeedMps, 18, '18 m/s');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.rideSpeedMps, SPEEDER_RIDE_SPEED_MPS, 'the named speed is the config speed');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.promptRangeM, VEHICLE_PROMPT_DIST, 'prompt is the 3.5 m vehicle prompt');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.promptRangeM, 3.5, '3.5 m — walked up to, not summoned (unlike the four summon mounts, whose prompt is the unused reference 4)');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.dismountSideM, VEHICLE_TYPES.landspeeder.radius + 1.2, 'dismount side is radius + 1.2');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.dismountSideM, 3.8, '3.8 m out to the right flank');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.dismountSideM, SPEEDER_DISMOUNT_SIDE_M, 'the named side is the config side');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.seatYawOffset, 0, 'no +PI turn — the speeder keeps its heading on mount');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.mountHeightM, 1.83, 'craft height is the windshield top');
    assert.equal(SW_SPEEDER_MOUNT_CONFIG.mountHeightM, SPEEDER_MOUNT_HEIGHT_M, 'the named height is the config height');
    assert.equal(speederRideSpeedMps(), 18, 'the shared read-out is 18 m/s');
    assert.equal(speederRideSpeedMps(), VEHICLE_TYPES.landspeeder.cruise, 'the shared read-out agrees with the drive cruise');
  });

  it('prompt: 3.5 m through the shared module, bit-identical to the old check', () => {
    const st = createVehicleState('landspeeder', { x: 10, z: 20, yaw: 0 });
    for (const [x, z, want] of [[10, 20, true], [13.5, 20, true], [13.6, 20, false], [10, 16.5, true], [10, 16.4, false], [12, 22, true]]) {
      assert.equal(speederInPromptRange(st, x, z), want, `(${x}, ${z}) prompts: ${want}`);
      assert.equal(vehicleInPromptRange(st, x, z), want, `old check agrees at (${x}, ${z})`);
    }
    assert.equal(SPEEDER_PROMPT_M, VEHICLE_PROMPT_DIST, 'the named prompt is the vehicle prompt distance');
  });

  it('nearest: picks the closest parked speeder, skips a mounted one', () => {
    const parked = (id, x, z) => ({ id, state: createVehicleState('landspeeder', { x, z, yaw: 0 }) });
    const far = parked('far', 3, 0);
    const near = parked('near', 1, 0);
    const mounted = parked('mounted', 0.5, 0);
    mounted.state.mode = 'mounted';
    assert.equal(nearestSpeederInRange([far, near, mounted], 0, 0), near.state, 'nearest parked speeder wins');
    assert.equal(nearestSpeederInRange([mounted], 0, 0), null, 'a mounted speeder never prompts');
    assert.equal(nearestSpeederInRange([far], 0, 0), far.state, 'inside 3.5 m prompts');
    assert.equal(nearestSpeederInRange([parked('out', 10, 0)], 0, 0), null, 'past 3.5 m never prompts');
    assert.equal(nearestSpeederInRange([], 0, 0), null, 'no vehicles, no prompt');
  });

  it('dismount: 3.8 m out to the right flank — bit-identical to dismountPoint, every yaw', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, 1.3, -0.7]) {
      const st = createVehicleState('landspeeder', { x: 10, z: 20, yaw });
      const spot = speederDismountSpot(st);
      const expected = dismountPoint(st);
      assert.ok(approx(spot.x, expected.x), `yaw ${yaw}: x is dismountPoint`);
      assert.ok(approx(spot.z, expected.z), `yaw ${yaw}: z is dismountPoint`);
      const d = Math.hypot(spot.x - 10, spot.z - 20);
      assert.ok(approx(d, SPEEDER_DISMOUNT_SIDE_M), `yaw ${yaw}: 3.8 m out, got ${d}`);
      assert.ok(d > 0, 'beside the speeder, never at its centre');
      const shared = dismountSpot({ x: 10, z: 20, yaw }, SW_SPEEDER_MOUNT_CONFIG);
      assert.ok(approx(spot.x, shared.x) && approx(spot.z, shared.z), `yaw ${yaw}: the spot IS the shared dismountSpot`);
    }
    const s0 = speederDismountSpot(createVehicleState('landspeeder', { x: 10, z: 20, yaw: 0 }));
    assert.ok(approx(s0.x, 13.8), 'yaw 0 dismounts to the +X flank');
    assert.ok(approx(s0.z, 20), 'yaw 0 dismounts to the +X flank');
  });

  it('the rover is gone: no rover config, no rover wire-in', () => {
    const src = read('app/star-wars/riding.js');
    assert.ok(!src.includes('ROVER_MOUNT_CONFIG'), 'no rover mount config in the Star Wars layer');
    assert.ok(!src.includes("VEHICLE_TYPES.rover"), 'the rover drive profile is never read');
    assert.ok(!src.includes('PODRACER_MOUNT_CONFIG'), 'no podracer mount config — speeder only');
    assert.ok(!src.includes("VEHICLE_TYPES.podracer"), 'the podracer drive profile is never read');
  });

  it('pin: riding.js routes prompt + dismount through the shared module, page uses it for the speeder', () => {
    const src = read('app/star-wars/riding.js');
    assert.ok(src.includes("from '../../lib/mounting.js'"), 'imports lib/mounting.js');
    assert.ok(src.includes('SPEEDER_MOUNT_CONFIG'), 'carries its mount config');
    assert.ok(src.includes('nearestMountInRange('), 'the prompt goes through the shared nearest check');
    assert.ok(src.includes('sharedDismountSpot('), 'the dismount goes through the shared dismountSpot');
    assert.ok(src.includes('sharedMountedSpeedMps('), 'the ride speed goes through the shared speed read-out');
    const page = read('app/star-wars/page.jsx');
    assert.ok(page.includes("from './riding'"), 'the page imports the riding layer');
    assert.ok(page.includes('speederInPromptRange('), 'the page prompts the speeder through the layer');
    assert.ok(page.includes('speederDismountSpot('), 'the page dismounts the speeder through the layer');
  });
});

/* ---- Hub bike: the single RIDE button mounts; dismount is the shared flank spot ---- */
describe('hub bike (button mount, shared flank dismount)', () => {
  it('config: 150 hub units/s, flank 3.4 m, no +PI turn', () => {
    assert.equal(HUB_BIKE_MOUNT_CONFIG.rideSpeedMps, BIKE_TUNING.maxSpeed, 'ride speed is the flight tuning cruise (150)');
    assert.equal(HUB_BIKE_MOUNT_CONFIG.dismountSideM, DISMOUNT_SIDE, 'dismount side is the 3.4 m flank');
    assert.equal(HUB_BIKE_MOUNT_CONFIG.seatYawOffset, 0, 'no +PI turn');
  });

  it('dismount: beside the bike at 3.4 m, eye 1.7 m — the shared flank spot, unchanged', () => {
    const bike = { x: 10, y: 20, z: 30 };
    for (const yaw of [0, Math.PI / 2, Math.PI, 1.3]) {
      const spot = dismountPosition(bike, yaw);
      const shared = dismountSpot(
        { x: bike.x, z: bike.z, yaw },
        { ...HUB_BIKE_MOUNT_CONFIG, dismountSideM: DISMOUNT_SIDE },
      );
      assert.ok(approx(spot.x, shared.x), `yaw ${yaw}: x is the shared dismountSpot`);
      assert.ok(approx(spot.z, shared.z), `yaw ${yaw}: z is the shared dismountSpot`);
      assert.ok(approx(spot.y, bike.y + DISMOUNT_EYE), `yaw ${yaw}: eye is bike + 1.7 m`);
      const d = Math.hypot(spot.x - bike.x, spot.z - bike.z);
      assert.ok(approx(d, DISMOUNT_SIDE), `yaw ${yaw}: 3.4 m out, got ${d}`);
    }
    const s0 = dismountPosition(bike, 0);
    assert.ok(approx(s0.x, bike.x + DISMOUNT_SIDE), 'yaw 0 dismounts to the +X flank');
    assert.ok(approx(s0.z, bike.z), 'yaw 0 dismounts to the +X flank');
    // A custom side still routes through the shared module.
    const wide = dismountPosition(bike, 0, 5);
    assert.ok(approx(wide.x, bike.x + 5), 'a wider side dismounts wider');
  });

  it('pin: rider-state.js routes the dismount through the shared module', () => {
    const src = read('lib/rider-state.js');
    assert.ok(src.includes("from './mounting.js'"), 'imports lib/mounting.js');
    assert.ok(src.includes('HUB_BIKE_MOUNT_CONFIG'), 'carries its mount config');
    assert.ok(src.includes('sharedDismountSpot('), 'the dismount delegates to the shared dismountSpot');
    assert.ok(!src.includes("from './bike-flight.js'"), 'the old local flank math import is gone — the shared module owns it now');
  });
});

/* ---- Earth 1 TRON bike: summon auto-mounts, dismount is exact place + vanish (globe) ---- */
describe('earth-1 tron bike (globe mount — config registered, no flat-plane call fits)', () => {
  it('config: 180 m/s ground speed, exact-place dismount, no +PI turn', () => {
    assert.equal(EARTH_BIKE_GROUND_SPEED_FACTOR, 3, 'the globe step multiplies flight speed by 3');
    assert.equal(
      EARTH_BIKE_MOUNT_CONFIG.rideSpeedMps,
      tuningFor('wisp').maxSpeed * EARTH_BIKE_GROUND_SPEED_FACTOR,
      'ride speed is the Wisp tuning (60) × the globe step (×3) = 180 m/s',
    );
    assert.equal(EARTH_BIKE_MOUNT_CONFIG.rideSpeedMps, 180, '180 m/s over the ground');
    assert.equal(EARTH_BIKE_MOUNT_CONFIG.dismountSideM, 0, 'dismount side 0 — exact place, not a flank');
    assert.equal(EARTH_BIKE_MOUNT_CONFIG.seatYawOffset, 0, 'no +PI turn');
    assert.equal(mountedSpeedMps(EARTH_BIKE_MOUNT_CONFIG), 180, 'the shared read-out is 180');
  });

  it('bike state is untouched: summonable, mountable, vanishable', () => {
    assert.deepEqual(
      Object.keys(bikeState).sort(),
      ['altM', 'lat', 'lon', 'mounted', 'speed', 'summoned', 'yawDeg'],
      'the bike state shape is unchanged',
    );
    assert.equal(bikeState.summoned, false, 'starts unsummoned');
    assert.equal(bikeState.mounted, false, 'starts unmounted');
  });

  it('pin: EarthBike.jsx keeps the summon = mount / dismount = vanish law', () => {
    const src = read('components/EarthBike.jsx');
    assert.ok(src.includes('EARTH_BIKE_MOUNT_CONFIG'), 'the component points at its mount config');
    assert.ok(src.includes('auto-mount: spawn riding'), 'summon auto-mounts');
    assert.ok(src.includes('bikeState.summoned = false;'), 'dismount vanishes the bike');
    assert.ok(src.includes('next.speed * dt * 3'), 'the ×3 globe ground-speed factor is still the step');
    assert.ok(src.includes("tuningFor('wisp')"), 'the ride still runs the Wisp tuning');
  });

  it('pin: the Earth 1 config lives in the node-safe bike-state home', () => {
    const src = read('lib/earth/parachute.js');
    assert.ok(src.includes('EARTH_BIKE_MOUNT_CONFIG'), 'parachute.js carries the Earth 1 mount config');
    assert.ok(src.includes("from '../mounting.js'"), 'parachute.js imports the shared module');
  });
});
