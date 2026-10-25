// Headless tests for Middle-earth figure motion (round 2): the orc
// limb math, the hero whole-figure pose, and the mission-card tuck
// rule — all pure, no browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORC_ARM_REST, ORC_WINDUP_S, orcLimbAngles, heroMotionPose,
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
  assert.deepEqual(p, { bobY: 0, leanX: 0, twistY: 0, rollZ: 0 });
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
