// Procedural locomotion: bone classification + gait pose math.
// (Video QA, 2026-10-26 — batch-4 files carry skeletons but ZERO
// baked animations, so walk cycles and arm swings are computed.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocomotionBones, locomotionPose } from '../behavior.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('Mixamo-style chains classify to both legs and both arms, feet excluded', () => {
  const map = classifyLocomotionBones([
    'Hips', 'Spine', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightArm', 'RightForeArm', 'RightHand',
  ]);
  assert.equal(map.thighL, 'LeftUpLeg');
  assert.equal(map.shinL, 'LeftLeg');
  assert.equal(map.armL, 'LeftArm');
  assert.equal(map.foreL, 'LeftForeArm');
  assert.equal(map.thighR, 'RightUpLeg');
  assert.equal(map.shinR, 'RightLeg');
  assert.equal(map.armR, 'RightArm');
  assert.equal(map.foreR, 'RightForeArm');
});

test('underscore _L/_R names classify, unilateral names are skipped', () => {
  const map = classifyLocomotionBones(['thigh_L', 'shin_L', 'upperarm_L', 'forearm_L', 'thigh_R', 'shin_R', 'upperarm_R', 'forearm_R']);
  assert.equal(map.thighL, 'thigh_L');
  assert.equal(map.shinR, 'shin_R');
  assert.equal(map.armL, 'upperarm_L');
  assert.equal(map.foreR, 'forearm_R');
  const bare = classifyLocomotionBones(['Thigh', 'Shin', 'Arm']);
  assert.ok(Object.values(bare).every((v) => v === null), 'a bone with no side cannot drive either limb');
});

test('shoulder bones stand in for upper arms when no arm bone matched', () => {
  const map = classifyLocomotionBones(['LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg']);
  assert.equal(map.armL, 'LeftShoulder');
  assert.equal(map.armR, 'RightShoulder');
});

test('generic Tripo names with no matchable bones classify to all null', () => {
  const map = classifyLocomotionBones(['Bone001', 'Bone002', 'Root']);
  assert.ok(Object.values(map).every((v) => v === null));
});

test('gait pose: legs oppose, arms oppose their same-side leg, rest is zero', () => {
  const p = locomotionPose(Math.PI / 2, 1);
  assert.ok(approx(p.thighL, 0.55));
  assert.ok(approx(p.thighR, -0.55));
  assert.ok(p.armL < 0 && p.armR > 0, 'arms oppose their same-side leg');
  assert.ok(p.bob >= 0);
  const rest = locomotionPose(1.3, 0);
  assert.ok(Object.values(rest).every((v) => v === 0), 'speedNorm 0 is a full standstill');
});
