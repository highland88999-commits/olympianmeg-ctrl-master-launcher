// Headless tests for Middle-earth figure motion (round 2): the orc
// limb math, the hero whole-figure pose, and the mission-card tuck
// rule — all pure, no browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORC_ARM_REST, ORC_WINDUP_S, orcLimbAngles, heroMotionPose,
  heroPhaseRate, horseGallopPose, gallopPhaseRate, heroSeatPose,
  blendPoses, MOUNT_BLEND_S,
  MISSION_TUCK_AFTER_S, MISSION_RETUCK_AFTER_S, shouldTuckMissionCard,
} from '../figure-motion.js';

test('orc walk: legs swing opposite, arms counter-swing', () => {
  const a = orcLimbAngles({ moveSpeed: 3.4, phase: Math.PI / 2, idleT: 0 });
  assert.ok(a.legL > 0.3, 'lead leg forward');
  assert.ok(a.legR < -0.3, 'trail leg back');
  assert.ok(Math.abs(a.legL + a.legR) < 1e-9, 'legs mirrored');
  assert.ok(a.armBlade < ORC_ARM_REST, 'blade arm counter-swings');
  assert.ok(a.armFree > ORC_ARM_REST, 'free arm counter-swings');
});

test('orc idle: no leg swing, just a faint arm sway', () => {
  const a = orcLimbAngles({ moveSpeed: 0, phase: 0, idleT: 0 });
  assert.equal(a.legL, 0);
  assert.equal(a.legR, 0);
  assert.ok(Math.abs(a.armBlade - ORC_ARM_REST) <= 0.05, 'arm near rest');
  const b = orcLimbAngles({ moveSpeed: 0, phase: 0, idleT: 2 });
  assert.notEqual(a.armBlade, b.armBlade, 'sway moves with time');
});

test('orc wind-up: blade arm rises, legs plant', () => {
  const a = orcLimbAngles({ moveSpeed: 3.4, phase: 1, windupP: 1, idleT: 0 });
  assert.ok(a.armBlade < ORC_ARM_REST - 1.5, 'blade arm raised high');
  assert.equal(a.legL, 0, 'legs plant during wind-up');
  assert.equal(a.legR, 0, 'legs plant during wind-up');
  const half = orcLimbAngles({ moveSpeed: 0, phase: 0, windupP: 0.5, idleT: 0 });
  assert.ok(half.armBlade < ORC_ARM_REST && half.armBlade > a.armBlade, 'raise is progressive');
});

test('orc swing: blade arm sweeps forward past rest', () => {
  const a = orcLimbAngles({ moveSpeed: 0, phase: 0, swingP: 1, idleT: 0 });
  assert.ok(a.armBlade > ORC_ARM_REST + 0.5, 'blade drives forward');
});

test('orc wind-up length is a short, readable warning', () => {
  assert.ok(ORC_WINDUP_S >= 0.25 && ORC_WINDUP_S <= 0.5, `wind-up ${ORC_WINDUP_S}s`);
});

test('hero idle: no motion added (breathing owns the body)', () => {
  const p = heroMotionPose({ speed: 0, phase: 0 });
  assert.deepEqual(p, { bobY: 0, leanX: 0, twistY: 0, rollZ: 0, swayX: 0, stepZ: 0 });
});

test('hero phase rate: readable step rate, not the old 7 Hz blur', () => {
  assert.equal(heroPhaseRate(0), 0, 'standing advances nothing');
  const walk = heroPhaseRate(10);
  assert.ok(walk > 12 && walk < 16, `walk ~14.3 rad/s, got ${walk}`);
  assert.ok(heroPhaseRate(18) > walk, 'sprint steps faster than walk');
  assert.ok(heroPhaseRate(100) <= Math.PI * 5 + 1e-9, 'step rate capped');
});

test('hero walking: step rhythm in counter-phase', () => {
  // One step apart (phase + π): weight shift, roll and twist flip sides.
  const a = heroMotionPose({ speed: 10, phase: Math.PI / 2 });
  const b = heroMotionPose({ speed: 10, phase: Math.PI / 2 + Math.PI });
  assert.ok(a.swayX > 0.04, 'weight over one foot');
  assert.ok(b.swayX < -0.04, 'weight over the other foot');
  assert.ok(Math.sign(a.rollZ) !== Math.sign(b.rollZ), 'roll flips with the step');
  assert.ok(Math.sign(a.twistY) !== Math.sign(b.twistY), 'twist flips with the step');
  // Half a cycle apart (phase + π/2): the two-bobs-per-cycle bounce flips.
  const c = heroMotionPose({ speed: 10, phase: Math.PI / 4 });
  const d = heroMotionPose({ speed: 10, phase: Math.PI / 4 + Math.PI / 2 });
  assert.ok(c.bobY > 0.07, 'bob up on one footfall');
  assert.ok(d.bobY < -0.07, 'bob down on the next');
  assert.ok(c.stepZ > 0 && d.stepZ < 0, 'forward surge alternates');
});

test('hero sprint swings harder than walk', () => {
  // Phase π/4: bob at its peak, sway/roll/twist mid-swing — all read.
  const walk = heroMotionPose({ speed: 10, phase: Math.PI / 4 });
  const sprint = heroMotionPose({ speed: 18, phase: Math.PI / 4 });
  assert.ok(Math.abs(sprint.bobY) > Math.abs(walk.bobY) * 1.2, 'sprint bobs harder');
  assert.ok(Math.abs(sprint.swayX) > Math.abs(walk.swayX), 'sprint sways wider');
  assert.ok(Math.abs(sprint.rollZ) > Math.abs(walk.rollZ), 'sprint rolls harder');
  const slow = heroMotionPose({ speed: 3, phase: Math.PI / 4 });
  assert.ok(Math.abs(slow.bobY) < Math.abs(walk.bobY), 'slow walk is gentler');
});

test('horse gallop: standing still, moving only when the horse moves', () => {
  const still = horseGallopPose({ speed: 0, phase: 1 });
  assert.deepEqual(still, { bobY: 0, pitchX: 0, rollZ: 0, legFront: 0, legRear: 0, maneSway: 0 });
  const g = horseGallopPose({ speed: 12, phase: Math.PI / 2 });
  assert.ok(Math.abs(g.bobY) > 0.08, 'suspension bob reads');
  assert.ok(Math.abs(g.pitchX) > 0.05, 'pitch rock reads');
  // Front and rear leg readouts run in counter-phase (diagonal pairs).
  assert.ok(Math.sign(g.legFront) !== Math.sign(g.legRear), 'legs counter-phase');
  const h = horseGallopPose({ speed: 12, phase: Math.PI / 2 + Math.PI });
  assert.ok(Math.sign(g.bobY) !== Math.sign(h.bobY), 'bob flips across the stride');
});

test('horse gallop phase rate: one cycle per stride, capped', () => {
  assert.equal(gallopPhaseRate(0), 0);
  const r = gallopPhaseRate(10.5);
  assert.ok(r > 18 && r < 20, `~3 strides/s, got ${r}`);
  assert.ok(gallopPhaseRate(100) <= 2 * Math.PI * 4.5 + 1e-9, 'stride rate capped');
});

test('seat pose: rider follows the horse bob, stays seated at rest', () => {
  const seat = heroSeatPose({ speed: 12, phase: 1, horseBobY: 0.1 });
  assert.ok(Math.abs(seat.bobY - 0.1) <= 0.021, 'rider rides the saddle bob');
  assert.ok(seat.leanX < -0.1, 'seated forward lean');
  const rest = heroSeatPose({ speed: 0, phase: 0, horseBobY: 0 });
  assert.equal(rest.bobY, 0, 'no bounce at rest');
  assert.equal(rest.leanX, -0.12, 'still seated at rest');
  assert.equal(rest.swayX, 0, 'no weight shift seated');
});

test('mount blend: exact ends, eased middle, no snap', () => {
  assert.ok(MOUNT_BLEND_S >= 0.2 && MOUNT_BLEND_S <= 0.5, `blend ${MOUNT_BLEND_S}s`);
  const walk = heroMotionPose({ speed: 10, phase: Math.PI / 2 });
  const seat = heroSeatPose({ speed: 12, phase: 1, horseBobY: 0.1 });
  assert.deepEqual(blendPoses(walk, seat, 0), walk, 't=0 is the walk pose');
  assert.deepEqual(blendPoses(walk, seat, 1), seat, 't=1 is the seat pose');
  const mid = blendPoses(walk, seat, 0.5);
  assert.ok(Math.abs(mid.leanX - (walk.leanX + seat.leanX) / 2) < 1e-9, 'midpoint is the mean');
  const q = blendPoses(walk, seat, 0.25);
  // Smoothstep eases: at t=0.25 the blend has moved less than a quarter.
  const moved = Math.abs(q.leanX - walk.leanX) / Math.abs(seat.leanX - walk.leanX);
  assert.ok(moved < 0.25 && moved > 0, 'eased, not linear');
});

test('hero walking: bob, forward lean, and roll', () => {
  const p = heroMotionPose({ speed: 10, phase: Math.PI / 4 });
  assert.ok(Math.abs(p.bobY) > 0, 'bobbing');
  assert.ok(p.leanX < 0, 'leaning into the stride');
  assert.ok(Math.abs(p.rollZ) > 0, 'rolling with the steps');
});

test('hero melee swing: twist through, lean in', () => {
  const p = heroMotionPose({ speed: 0, phase: 0, swingP: 1, kind: 'melee' });
  assert.ok(p.twistY > 0.4, 'twisting through the blow');
  assert.ok(p.leanX < -0.2, 'leaning into the blow');
});

test('hero ranged swing: raise back, not a melee twist', () => {
  const p = heroMotionPose({ speed: 0, phase: 0, swingP: 1, kind: 'ranged' });
  assert.ok(p.leanX > 0.1, 'leaning back for the shot');
  assert.ok(p.twistY < 0.3, 'no melee twist');
});

test('mission card: full for the tuck window, tucked after', () => {
  assert.equal(shouldTuckMissionCard(0, -MISSION_RETUCK_AFTER_S), false);
  assert.equal(shouldTuckMissionCard(5.9, -MISSION_RETUCK_AFTER_S), false);
  assert.equal(shouldTuckMissionCard(MISSION_TUCK_AFTER_S, -MISSION_RETUCK_AFTER_S), true);
  assert.equal(shouldTuckMissionCard(120, -MISSION_RETUCK_AFTER_S), true);
});

test('mission card: expanding buys the re-tuck window, then it tucks', () => {
  assert.equal(shouldTuckMissionCard(100, 100), false, 'just expanded — stays open');
  assert.equal(shouldTuckMissionCard(107, 100), false, 'inside the window');
  assert.equal(shouldTuckMissionCard(108, 100), true, 'window over — tucks again');
});
