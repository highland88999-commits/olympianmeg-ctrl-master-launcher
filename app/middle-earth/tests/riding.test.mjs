// app/middle-earth/tests/riding.test.mjs — HORSES RIDEABLE
// (Merlin, Nov 15 ~00:57). Pure-function tests for the riding math
// (riding.js + Worker C's gallop/seat poses in figure-motion.js)
// and source pins for the page/zone wiring, because no test
// renders page.jsx (the house's known gate gap — the on-phone
// feel verdict stays Merlin's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  MOUNT_RANGE_M, RIDE_SPEED_MPS, RIDE_SADDLE_FRACTION,
  nearestHorseInRange, riderSeatOffsetY, dismountSpot, horseYawForWalker,
} from '../riding.js';
import {
  horseGallopPose, heroSeatPose, gallopPhaseRate, blendPoses,
  MOUNT_BLEND_S,
} from '../figure-motion.js';
import { WALK_SPEED, WALK_SPRINT_MULT } from '../../../lib/world/walk-controls.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(path.join(HERE, '../page.jsx'), 'utf8');
const zoneSrc = readFileSync(path.join(HERE, '../zone.js'), 'utf8');
const charactersSrc = readFileSync(path.join(HERE, '../characters.js'), 'utf8');
const ridingSrc = readFileSync(path.join(HERE, '../riding.js'), 'utf8');

const HORSES = [
  { id: 'horse', name: 'A Horse of the Mark', x: 52, z: -22, height: 2.2 },
  { id: 'horse-second', name: 'A Horse of the Mark', x: -52, z: 22, height: 2.2 },
];

/* ---- the prompt: in range / out of range ---- */
test('mount prompt: appears within 4 m, never past it', () => {
  assert.equal(MOUNT_RANGE_M, 4, 'prompt range is 4 m');
  assert.ok(nearestHorseInRange(HORSES, 52, -19), '3 m away — prompt');
  assert.ok(nearestHorseInRange(HORSES, 52, -18), '4 m away, on the line — prompt');
  assert.equal(nearestHorseInRange(HORSES, 52, -17), null, '5 m away — no prompt');
  assert.equal(nearestHorseInRange(HORSES, 0, 95), null, 'at the spawn — no prompt');
  assert.equal(nearestHorseInRange([], 52, -22), null, 'no horses — no prompt');
});

test('mount prompt: the nearest horse wins, and the second horse counts too', () => {
  const near = nearestHorseInRange(HORSES, -50, 20);
  assert.equal(near.id, 'horse-second', 'the mirrored horse prompts on its own side');
  const first = nearestHorseInRange(HORSES, 50, -20);
  assert.equal(first.id, 'horse', 'the first horse prompts on its side');
});

/* ---- speed: riding is CLEARLY faster than walking ---- */
test('riding speed beats the walk and the foot sprint', () => {
  assert.ok(RIDE_SPEED_MPS > WALK_SPEED, `gallop ${RIDE_SPEED_MPS} m/s beats the ${WALK_SPEED} m/s walk`);
  assert.ok(
    RIDE_SPEED_MPS > WALK_SPEED * WALK_SPRINT_MULT,
    `gallop ${RIDE_SPEED_MPS} m/s beats even the ${WALK_SPEED * WALK_SPRINT_MULT} m/s foot sprint`,
  );
});

/* ---- the seat: hips on the saddle, head above the ears ---- */
test('seat: the rider sits on the saddle, not floating above it', () => {
  const seatY = riderSeatOffsetY(2.2, 1.85);
  const saddleY = RIDE_SADDLE_FRACTION * 2.2;
  const hipY = seatY + 0.51 * 1.85; // hips ride a hip-height above the origin
  assert.ok(Math.abs(hipY - saddleY) < 0.05, `hips ${hipY.toFixed(2)} m sit on the saddle ${saddleY.toFixed(2)} m`);
  assert.ok(seatY > 0, 'the origin rides above the ground, not under it');
  assert.ok(seatY < saddleY, 'the origin rides below the saddle, not above it');
  const headY = seatY + 1.85;
  assert.ok(headY > 2.2, `a full-size hero's head ${headY.toFixed(2)} m clears the horse's 2.2 m ears`);
});

/* ---- dismount: beside the horse, never far away ---- */
test('dismount: lands beside the horse, a short step away', () => {
  const horse = { x: 52, z: -22, yaw: 1.1 };
  const spot = dismountSpot(horse);
  const d = Math.hypot(spot.x - horse.x, spot.z - horse.z);
  assert.ok(Math.abs(d - 1.8) < 1e-9, `dismount is 1.8 m out, got ${d}`);
  assert.ok(d > 0.8, 'outside the horse\'s own 0.8 m solid circle');
  const spot2 = dismountSpot({ x: 0, z: 0, yaw: 0 });
  assert.ok(Math.abs(spot2.x - 1.8) < 1e-9 && Math.abs(spot2.z) < 1e-9, 'yaw 0 dismounts to the +X flank');
});

/* ---- facing: the horse faces the way the rider faces ---- */
test('horse yaw: the horse faces the rider\'s travel direction', () => {
  // walker yaw 0 faces -Z; the horse group must face -Z too, which
  // for a +Z-facing figure group is rotation.y = yaw + PI
  assert.ok(Math.abs(horseYawForWalker(0) - Math.PI) < 1e-9, 'facing north, the horse turns PI');
  assert.ok(Math.abs(horseYawForWalker(Math.PI) - 2 * Math.PI) < 1e-9, 'facing south, the horse turns with it');
});

/* ---- gallop: Worker C's pose, called from the frame loop ---- */
test('gallop pose: still standing, no bob; galloping, a real rock', () => {
  const still = horseGallopPose({ speed: 0, phase: 1 });
  assert.deepEqual(still, { bobY: 0, pitchX: 0, rollZ: 0, legFront: 0, legRear: 0, maneSway: 0 });
  const gallop = horseGallopPose({ speed: RIDE_SPEED_MPS, phase: Math.PI / 2 });
  assert.ok(gallop.bobY > 0.05, 'suspension bob at full stride');
  assert.ok(Math.abs(gallop.pitchX) > 0, 'the nose rocks with the stride');
  assert.ok(gallopPhaseRate(RIDE_SPEED_MPS) > 0, 'the phase advances at a gallop');
  assert.equal(gallopPhaseRate(0), 0, 'a standing horse never gallops');
});

test('seat pose: the rider borrows the horse\'s bob, never detaches', () => {
  const gallop = horseGallopPose({ speed: RIDE_SPEED_MPS, phase: Math.PI / 2 });
  const seat = heroSeatPose({ speed: RIDE_SPEED_MPS, phase: Math.PI / 2, horseBobY: gallop.bobY });
  assert.ok(Math.abs(seat.bobY - gallop.bobY) <= 0.03, 'rider bob tracks horse bob');
  assert.ok(seat.leanX < 0, 'seated, leaning into the gallop');
  const still = heroSeatPose({ speed: 0, phase: 0, horseBobY: 0 });
  assert.equal(still.bobY, 0, 'standing mounted, no bounce');
  assert.ok(still.leanX < 0, 'standing mounted, still seated');
});

test('mount blend: walk pose at 0, seat pose at 1, eased between', () => {
  assert.ok(MOUNT_BLEND_S > 0 && MOUNT_BLEND_S <= 0.5, `blend ${MOUNT_BLEND_S}s is a quick ease, not a wait`);
  const a = { leanX: 0, bobY: 0 };
  const b = { leanX: -0.12, bobY: 0.1 };
  assert.deepEqual(blendPoses(a, b, 0), a, 't=0 is exactly the walk pose');
  assert.deepEqual(blendPoses(a, b, 1), b, 't=1 is exactly the seat pose');
  const mid = blendPoses(a, b, 0.5);
  assert.ok(mid.leanX < 0 && mid.leanX > -0.12, 'mid-blend leans between');
});

/* ---- source pins for the wiring (no test renders the page) ---- */
test('pin: the zone exposes horse handles with figure + collider', () => {
  assert.ok(zoneSrc.includes('const horses = [];'), 'the zone keeps a horses list');
  assert.ok(zoneSrc.includes('group: fig.group, figure: fig, collider: col'), 'a handle carries the figure group and its collider');
  assert.ok(zoneSrc.includes('horses,'), 'the zone returns horses');
  assert.ok(zoneSrc.includes("if (cd.model === 'horse')"), 'the placed horse gets a handle');
  assert.ok(zoneSrc.includes("if (ex.model === 'horse')"), 'the mirrored second horse gets a handle too');
  assert.ok(!zoneSrc.includes('colliders.push({ x: cd.at[0]'), 'no anonymous collider left on the placed-figure path');
});

test('pin: the horse model faces its declared facing', () => {
  assert.ok(charactersSrc.includes('yawFix: Math.PI / 2'), 'the horse yawFix turns -X (the head end) to +Z');
});

test('pin: the page mounts, rides, and dismounts through the new wiring', () => {
  assert.ok(pageSrc.includes("from './riding'"), 'the page imports the riding module');
  assert.ok(pageSrc.includes('horseGallopPose({'), 'the frame loop calls the gallop pose');
  assert.ok(pageSrc.includes('heroSeatPose({'), 'the frame loop calls the seat pose');
  assert.ok(pageSrc.includes('zone.colliders.filter((c) => c !== ride.horse.collider)'), 'the ridden horse never collides with its own rider');
  assert.ok(pageSrc.includes('ride.horse.collider.x = walker.pos.x'), 'the horse collider travels with the horse');
  assert.ok(pageSrc.includes('speed: rideSpeed'), 'the gallop has its own speed, not the walk speed');
  assert.ok(pageSrc.includes('sprint: false, jump: false'), 'sprint and jump are ignored from the saddle');
  assert.ok(pageSrc.includes('nearestHorseInRange(zone.horses, walker.pos.x, walker.pos.z)'), 'the prompt reads the live horse positions');
  assert.ok(pageSrc.includes('<OrbLabel>MOUNT</OrbLabel>'), 'the Mount control is its own labelled orb');
  assert.ok(pageSrc.includes('ariaLabel={`Mount ${mountPrompt.name}`}'), 'the mount prompt names the horse');
  assert.ok(pageSrc.includes('ariaLabel="Dismount"'), 'there is a clear Dismount control');
  assert.ok(pageSrc.includes("rideApiRef.current = {"), 'the buttons drive the scene through the ride API');
  assert.ok(pageSrc.includes("if (e.key === 'e' || e.key === 'E')"), 'E mounts / dismounts on desktop');
});

test('pin: strike still reads the walker, so it works from horseback', () => {
  // onTap() was not forked for riding: it strikes from walker.pos,
  // and while mounted the walker IS the horse — no separate
  // mounted-strike path to drift out of sync.
  assert.ok(pageSrc.includes('strike(hunter, targets, walker.pos.x, walker.pos.z, aim, spec'), 'the strike reads walker position');
  assert.ok(!pageSrc.includes('mountedStrike'), 'no forked mounted-strike path');
});

test('pin: the riding module states its own law', () => {
  assert.ok(ridingSrc.includes('MOUNT_RANGE_M = 4'), 'the prompt range is written down');
  assert.ok(ridingSrc.includes('RIDE_SPEED_MPS = 22'), 'the gallop speed is written down');
});
