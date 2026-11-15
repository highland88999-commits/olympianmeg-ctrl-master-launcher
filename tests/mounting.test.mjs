// tests/mounting.test.mjs — THE SHARED MOUNTING MODULE
// (Merlin, Nov 15 ~01:30). Pure-function tests for lib/mounting.js
// and for the Middle-earth horse layer over it
// (app/middle-earth/riding.js): prompt range, mount position,
// dismount beside the mount, speed per config, and the
// mount/dismount/death state transitions. No test renders a page
// (the house's known gate gap — the on-phone feel verdict stays
// Merlin's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DEFAULT_MOUNT_CONFIG, createMountConfig, resolveMountConfig,
  nearestMountInRange, mountSpot, saddleHeightY, riderSeatOffsetY,
  mountYawForWalker, dismountSpot, mountedSpeedMps,
  isMounted, tryMount, dismountRide, clearRideOnDeath,
} from '../lib/mounting.js';
import {
  MOUNT_RANGE_M, RIDE_SPEED_MPS, RIDE_SADDLE_FRACTION, RIDER_HIP_FRACTION,
  DISMOUNT_SIDE_M, HORSE_MOUNT_CONFIG,
  nearestHorseInRange, riderSeatOffsetY as horseSeatOffsetY,
  dismountSpot as horseDismountSpot, horseYawForWalker,
} from '../app/middle-earth/riding.js';
import { MOUNT_BLEND_S } from '../app/middle-earth/figure-motion.js';
import { WALK_SPEED, WALK_SPRINT_MULT } from '../lib/world/walk-controls.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const mountingSrc = readFileSync(path.join(HERE, '../lib/mounting.js'), 'utf8');
const ridingSrc = readFileSync(path.join(HERE, '../app/middle-earth/riding.js'), 'utf8');
const pageSrc = readFileSync(path.join(HERE, '../app/middle-earth/page.jsx'), 'utf8');

const MOUNTS = [
  { id: 'mount-a', name: 'First mount', x: 52, z: -22, height: 2.2 },
  { id: 'mount-b', name: 'Second mount', x: -52, z: 22, height: 2.2 },
];

/* ---- the config: the horse numbers are the reference ---- */
test('config: the defaults are the proven horse numbers', () => {
  assert.equal(DEFAULT_MOUNT_CONFIG.promptRangeM, 4, 'prompt 4 m');
  assert.equal(DEFAULT_MOUNT_CONFIG.rideSpeedMps, 22, 'gallop 22 m/s');
  assert.equal(DEFAULT_MOUNT_CONFIG.saddleFraction, 0.68, 'saddle 0.68');
  assert.equal(DEFAULT_MOUNT_CONFIG.riderHipFraction, 0.51, 'hip 0.51');
  assert.equal(DEFAULT_MOUNT_CONFIG.dismountSideM, 1.8, 'dismount 1.8 m');
  assert.equal(DEFAULT_MOUNT_CONFIG.seatYawOffset, Math.PI, 'seat yaw +PI');
  assert.equal(DEFAULT_MOUNT_CONFIG.mountHeightM, 2.2, 'mount 2.2 m');
  assert.equal(DEFAULT_MOUNT_CONFIG.riderHeightM, 1.85, 'rider 1.85 m');
  assert.equal(DEFAULT_MOUNT_CONFIG.mountBlendS, 0.35, 'blend 0.35 s');
  assert.deepEqual(createMountConfig(), DEFAULT_MOUNT_CONFIG, 'no overrides is the reference');
  assert.equal(createMountConfig().mountBlendS, MOUNT_BLEND_S, 'the blend number agrees with the pose code');
});

test('config: overrides replace one field, never the rest', () => {
  const fast = createMountConfig({ rideSpeedMps: 28 });
  assert.equal(fast.rideSpeedMps, 28, 'the override lands');
  assert.equal(fast.promptRangeM, DEFAULT_MOUNT_CONFIG.promptRangeM, 'the rest stay reference');
  const wide = createMountConfig({ promptRangeM: 6, dismountSideM: 3 });
  assert.equal(wide.promptRangeM, 6, 'prompt widened');
  assert.equal(wide.dismountSideM, 3, 'dismount widened');
  assert.equal(wide.rideSpeedMps, 22, 'speed untouched');
  assert.notEqual(createMountConfig(), createMountConfig(), 'each call returns a fresh object');
  const one = createMountConfig();
  one.rideSpeedMps = 99;
  assert.equal(createMountConfig().rideSpeedMps, 22, 'mutating one config never moves the defaults');
  assert.equal(DEFAULT_MOUNT_CONFIG.rideSpeedMps, 22, 'the frozen default itself never moves');
});

test('config: bad overrides fall back to the default, unknown keys are ignored', () => {
  const bad = createMountConfig({ rideSpeedMps: NaN, promptRangeM: -2, saddleFraction: 0, dismountSideM: 'far' });
  assert.equal(bad.rideSpeedMps, 22, 'NaN speed falls back');
  assert.equal(bad.promptRangeM, 4, 'negative prompt falls back');
  assert.equal(bad.saddleFraction, 0.68, 'zero saddle falls back');
  assert.equal(bad.dismountSideM, 1.8, 'a string side falls back');
  const typo = createMountConfig({ rideSpeed: 99, seatYawOffset: 0 });
  assert.equal(typo.seatYawOffset, 0, 'a zero yaw offset is a real value, not a fallback');
  assert.equal('rideSpeed' in typo, false, 'a typo\'d key never becomes a live field');
  assert.equal(typo.rideSpeedMps, 22, '...and the real field keeps its default');
  assert.deepEqual(resolveMountConfig(undefined), DEFAULT_MOUNT_CONFIG, 'undefined resolves to the reference');
  assert.deepEqual(resolveMountConfig({ rideSpeedMps: 12 }), createMountConfig({ rideSpeedMps: 12 }), 'a partial config resolves the same way');
});

/* ---- the prompt: in range / out of range / nearest ---- */
test('prompt: appears within range, never past it', () => {
  const config = createMountConfig();
  assert.ok(nearestMountInRange(MOUNTS, 52, -19, config), '3 m away — prompt');
  assert.ok(nearestMountInRange(MOUNTS, 52, -18, config), '4 m away, on the line — prompt');
  assert.equal(nearestMountInRange(MOUNTS, 52, -17, config), null, '5 m away — no prompt');
  assert.equal(nearestMountInRange(MOUNTS, 0, 95, config), null, 'far away — no prompt');
  assert.equal(nearestMountInRange([], 52, -22, config), null, 'no mounts — no prompt');
  assert.equal(nearestMountInRange(null, 52, -22, config), null, 'a null list — no prompt');
  assert.equal(nearestMountInRange([null, undefined], 52, -22, config), null, 'null entries never prompt');
});

test('prompt: the nearest mount wins, and a wider prompt reaches further', () => {
  const config = createMountConfig();
  assert.equal(nearestMountInRange(MOUNTS, -50, 20, config).id, 'mount-b', 'the second mount prompts on its own side');
  assert.equal(nearestMountInRange(MOUNTS, 50, -20, config).id, 'mount-a', 'the first mount prompts on its side');
  const wide = createMountConfig({ promptRangeM: 6 });
  assert.ok(nearestMountInRange(MOUNTS, 52, -17, wide), '5 m away prompts on a 6 m prompt');
  assert.equal(nearestMountInRange(MOUNTS, 52, -17, config), null, '...but not on the 4 m reference prompt');
});

test('prompt: an exact tie goes to the later mount in the list', () => {
  // Documented reference behaviour, kept so the horse layer
  // stays bit-identical — a tie is a tie, the list order decides.
  const tied = [
    { id: 'first', x: 4, z: 0 },
    { id: 'second', x: -4, z: 0 },
  ];
  assert.equal(nearestMountInRange(tied, 0, 0, createMountConfig()).id, 'second', 'equal distance — the later mount wins');
});

/* ---- mount position: step on, hips on the seat ---- */
test('mount position: the walker steps onto the mount, never far away', () => {
  const mount = MOUNTS[0];
  const spot = mountSpot(mount);
  assert.deepEqual(spot, { x: 52, z: -22 }, 'mounting steps onto the mount itself');
  assert.equal(mountSpot(null), null, 'no mount — no spot');
  const gap = Math.hypot(spot.x - 52, spot.z - -19);
  assert.ok(gap <= 4, `the step from a 3 m prompt is ${gap} m — inside the prompt range, never a teleport`);
});

test('mount position: saddle height and rider origin per config', () => {
  const config = createMountConfig();
  assert.ok(Math.abs(saddleHeightY(config, 2.2) - 0.68 * 2.2) < 1e-9, 'saddle is 0.68 of the mount height');
  assert.ok(Math.abs(saddleHeightY(config) - 0.68 * 2.2) < 1e-9, 'no height given — the config default stands in');
  const seatY = riderSeatOffsetY(config, 2.2, 1.85);
  const saddleY = saddleHeightY(config, 2.2);
  const hipY = seatY + 0.51 * 1.85;
  assert.ok(Math.abs(hipY - saddleY) < 0.05, `hips ${hipY.toFixed(2)} m sit on the saddle ${saddleY.toFixed(2)} m`);
  assert.ok(seatY > 0, 'the origin rides above the ground, not under it');
  assert.ok(seatY < saddleY, 'the origin rides below the saddle, not above it');
  assert.ok(seatY + 1.85 > 2.2, 'a full-size rider\'s head clears the mount');
  const low = riderSeatOffsetY(createMountConfig({ saddleFraction: 0.5, riderHipFraction: 0.4 }), 2.2, 1.85);
  assert.ok(Math.abs(low - (0.5 * 2.2 - 0.4 * 1.85)) < 1e-9, 'a different seat changes the origin by the numbers, not by feel');
});

/* ---- dismount: beside the mount, flank side ---- */
test('dismount: lands beside the mount, a short step away', () => {
  const config = createMountConfig();
  const mount = { x: 52, z: -22, yaw: 1.1 };
  const spot = dismountSpot(mount, config);
  const d = Math.hypot(spot.x - mount.x, spot.z - mount.z);
  assert.ok(Math.abs(d - 1.8) < 1e-9, `dismount is 1.8 m out, got ${d}`);
  assert.ok(d > 0.8, 'outside the mount\'s own 0.8 m solid circle');
  const flank = dismountSpot({ x: 0, z: 0, yaw: 0 }, config);
  assert.ok(Math.abs(flank.x - 1.8) < 1e-9 && Math.abs(flank.z) < 1e-9, 'yaw 0 dismounts to the +X flank');
  const turned = dismountSpot({ x: 0, z: 0, yaw: Math.PI / 2 }, config);
  assert.ok(Math.abs(turned.x) < 1e-9 && Math.abs(turned.z + 1.8) < 1e-9, 'the flank turns with the mount');
  const noYaw = dismountSpot({ x: 10, z: 10 }, config);
  assert.ok(Math.abs(noYaw.x - 11.8) < 1e-9 && Math.abs(noYaw.z - 10) < 1e-9, 'a mount with no yaw dismounts as yaw 0');
  const wide = dismountSpot({ x: 0, z: 0, yaw: 0 }, createMountConfig({ dismountSideM: 3 }));
  assert.ok(Math.abs(Math.hypot(wide.x, wide.z) - 3) < 1e-9, 'a wider config dismounts wider');
});

/* ---- facing: the mount faces the rider's way ---- */
test('facing: the mount turns with the rider, per the seat yaw offset', () => {
  const config = createMountConfig();
  assert.ok(Math.abs(mountYawForWalker(config, 0) - Math.PI) < 1e-9, 'facing north, the mount turns PI');
  assert.ok(Math.abs(mountYawForWalker(config, Math.PI) - 2 * Math.PI) < 1e-9, 'facing south, the mount turns with it');
  const facing = createMountConfig({ seatYawOffset: 0 });
  assert.equal(mountYawForWalker(facing, 1.2), 1.2, 'a mount that already faces forward needs no offset');
});

/* ---- speed: per config, always faster than feet ---- */
test('speed: the reference ride beats the walk and the foot sprint', () => {
  const config = createMountConfig();
  assert.ok(mountedSpeedMps(config) > WALK_SPEED, `ride ${mountedSpeedMps(config)} m/s beats the ${WALK_SPEED} m/s walk`);
  assert.ok(
    mountedSpeedMps(config) > WALK_SPEED * WALK_SPRINT_MULT,
    `ride ${mountedSpeedMps(config)} m/s beats even the ${WALK_SPEED * WALK_SPRINT_MULT} m/s foot sprint`,
  );
  assert.ok(Math.abs(mountedSpeedMps(config, 0.5) - 11) < 1e-9, 'a half slow factor halves the ride speed');
});

test('speed: each mount keeps its own speed', () => {
  assert.equal(mountedSpeedMps(createMountConfig({ rideSpeedMps: 28 })), 28, 'a faster mount rides faster');
  assert.equal(mountedSpeedMps(createMountConfig({ rideSpeedMps: 12 })), 12, 'a slower mount rides slower');
});

/* ---- state: mount, dismount, death clears the ride ---- */
test('state: mounting takes the ride, and never double-books', () => {
  const mount = MOUNTS[0];
  assert.equal(isMounted(null), false, 'on foot — not mounted');
  const ride = tryMount(null, mount);
  assert.ok(isMounted(ride), 'mounted after the mount');
  assert.equal(ride.mount, mount, 'the ride holds the mount itself');
  const again = tryMount(ride, MOUNTS[1]);
  assert.equal(again, ride, 'mounting again returns the same ride, untouched');
  assert.equal(again.mount, mount, 'the first mount is not swapped out from under the rider');
  assert.equal(tryMount(null, null), null, 'no mount — still on foot');
  assert.equal(tryMount(null, undefined), null, 'an undefined mount — still on foot');
});

test('state: dismount after mount returns the walker to foot, mount untouched', () => {
  const mount = { ...MOUNTS[0], yaw: 0.4 };
  const before = { x: mount.x, z: mount.z, yaw: mount.yaw };
  const ride = tryMount(null, mount);
  assert.ok(isMounted(ride), 'mounted');
  const spot = dismountSpot(mount, createMountConfig());
  assert.ok(Math.hypot(spot.x - mount.x, spot.z - mount.z) > 0.8, 'the dismount spot is beside the mount, not inside it');
  const after = dismountRide(ride);
  assert.equal(after, null, 'dismounted — back on foot');
  assert.equal(isMounted(after), false, 'not mounted after the dismount');
  assert.deepEqual(
    { x: mount.x, z: mount.z, yaw: mount.yaw }, before,
    'the mount never moved: it waits exactly where it was left, still rideable',
  );
  assert.equal(nearestMountInRange([mount], spot.x, spot.z, createMountConfig()).id, mount.id, '...and the prompt still finds it from the dismount spot');
  assert.equal(dismountRide(null), null, 'dismounting from foot is a no-op');
});

test('state: death / respawn clears the ride where the module owns it', () => {
  const mount = MOUNTS[0];
  const ride = tryMount(null, mount);
  assert.ok(isMounted(ride), 'mounted before the fall');
  const after = clearRideOnDeath(ride);
  assert.equal(after, null, 'the ride clears on death');
  assert.equal(isMounted(after), false, 'the rider wakes on foot');
  assert.deepEqual(mount, MOUNTS[0], 'the mount itself is untouched by the death — it waits, still rideable');
  assert.equal(clearRideOnDeath(null), null, 'clearing an already-clear ride stays clear');
});

/* ---- the Middle-earth layer: thin, and bit-identical ---- */
test('horse layer: its config is the five horse numbers', () => {
  assert.equal(HORSE_MOUNT_CONFIG.promptRangeM, MOUNT_RANGE_M, 'prompt 4 m');
  assert.equal(HORSE_MOUNT_CONFIG.rideSpeedMps, RIDE_SPEED_MPS, 'gallop 22 m/s');
  assert.equal(HORSE_MOUNT_CONFIG.saddleFraction, RIDE_SADDLE_FRACTION, 'saddle 0.68');
  assert.equal(HORSE_MOUNT_CONFIG.riderHipFraction, RIDER_HIP_FRACTION, 'hip 0.51');
  assert.equal(HORSE_MOUNT_CONFIG.dismountSideM, DISMOUNT_SIDE_M, 'dismount 1.8 m');
  assert.equal(MOUNT_RANGE_M, 4, 'the prompt range is written down as 4');
  assert.equal(RIDE_SPEED_MPS, 22, 'the gallop speed is written down as 22');
});

test('horse layer: every wrapper matches the shared module with the horse config', () => {
  const config = HORSE_MOUNT_CONFIG;
  for (const [x, z] of [[52, -19], [52, -18], [52, -17], [-50, 20], [0, 95]]) {
    assert.equal(
      nearestHorseInRange(MOUNTS, x, z), nearestMountInRange(MOUNTS, x, z, config),
      `prompt at (${x}, ${z}) matches the shared module`,
    );
  }
  assert.equal(
    nearestHorseInRange(MOUNTS, 52, -17, 6), nearestMountInRange(MOUNTS, 52, -17, { ...config, promptRangeM: 6 }),
    'the range override reaches the shared module',
  );
  for (const h of [2.2, 1.8, 0]) {
    assert.equal(horseSeatOffsetY(h, 1.85), riderSeatOffsetY(config, h, 1.85), `seat offset for a ${h} m horse matches`);
  }
  assert.equal(horseSeatOffsetY(2.2), riderSeatOffsetY(config, 2.2, 1.85), 'the default hero height matches');
  for (const yaw of [0, 1.1, Math.PI]) {
    assert.equal(horseYawForWalker(yaw), mountYawForWalker(config, yaw), `yaw ${yaw} matches`);
    assert.deepEqual(horseDismountSpot({ x: 52, z: -22, yaw }, 1.8), dismountSpot({ x: 52, z: -22, yaw }, config), `dismount at yaw ${yaw} matches`);
  }
  assert.deepEqual(
    horseDismountSpot({ x: 0, z: 0, yaw: 0 }, 3),
    dismountSpot({ x: 0, z: 0, yaw: 0 }, { ...config, dismountSideM: 3 }),
    'the dismount-side override reaches the shared module',
  );
});

/* ---- source pins for the wiring ---- */
test('pin: the horse layer is a thin layer over the shared module', () => {
  assert.ok(ridingSrc.includes("from '../../lib/mounting.js'"), 'riding.js imports lib/mounting.js');
  assert.ok(ridingSrc.includes('HORSE_MOUNT_CONFIG'), 'riding.js carries the horse config');
  assert.ok(ridingSrc.includes('nearestMountInRange('), 'the prompt delegates to the shared module');
  assert.ok(ridingSrc.includes('sharedDismountSpot('), 'the dismount delegates to the shared module');
  assert.ok(mountingSrc.includes('promptRangeM'), 'the shared module owns the prompt range');
  assert.ok(mountingSrc.includes('tryMount'), 'the shared module owns the mount transition');
  assert.ok(mountingSrc.includes('clearRideOnDeath'), 'the shared module owns the death law');
  assert.ok(!mountingSrc.includes('document.'), 'pure math — no DOM in the shared module');
  assert.ok(!mountingSrc.includes("from 'three'"), 'pure math — no three.js import in the shared module');
  assert.ok(!mountingSrc.includes('require('), 'pure math — no requires in the shared module');
});

test('pin: the page still mounts through the horse layer, unchanged', () => {
  assert.ok(pageSrc.includes("from './riding'"), 'the page imports the riding module');
  assert.ok(pageSrc.includes('nearestHorseInRange(zone.horses, walker.pos.x, walker.pos.z)'), 'the prompt reads the live horse positions through the layer');
});
