// tests/earth2-breeding.test.mjs
// EARTH 2 — DINO BREEDING (Merlin, 2026-11-03): nests, stolen
// eggs, hatching behind the land gate, growth, and ally law.
//
// Run: node --test tests/earth2-breeding.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EGG_HATCH_MS,
  JUVENILE_AGE_MS,
  ADULT_AGE_MS,
  EGG_ITEM_ID,
  NO_LAND_MESSAGE,
  ALLY_FOLLOW_RANGE_M,
  ALLY_MAX_RANGE_M,
  ALLY_IDLE_RANGE_M,
  BONE_GROUP_HEAD,
  BONE_GROUP_SPINE,
  BONE_GROUP_ARM,
  BONE_GROUP_LEG,
  BONE_GROWTH_SCALES,
  nestEggCount,
  makeNest,
  nestIsDangerous,
  eggName,
  makeEggItem,
  isEggItem,
  eggHatchInMs,
  eggReadyToHatch,
  eggIsCold,
  canRaiseDino,
  growthStage,
  growthT,
  growthScaleFor,
  allyScaleM,
  boneGroupFor,
  boneScalesAt,
  overallScaleAt,
  rigScalesFor,
  shouldSwapToAdult,
  allyMoveDecision,
  allyAttackTarget,
  isAlliedDino,
  babyModelPath,
} from '../lib/earth2/breeding.js';

describe('nest placement', () => {
  it('egg counts are 1–3 and deterministic', () => {
    for (const id of ['nest-1', 'nest-2', 'alpha', 'beta']) {
      const n = nestEggCount(id);
      assert.ok(n >= 1 && n <= 3, `count ${n} in range`);
      assert.equal(nestEggCount(id), n, 'deterministic');
    }
  });

  it('makeNest builds a nest record', () => {
    const nest = makeNest('n1', 'triceratops', 10, 20, 42);
    assert.equal(nest.id, 'n1');
    assert.equal(nest.species, 'triceratops');
    assert.equal(nest.x, 10);
    assert.equal(nest.z, 20);
    assert.equal(nest.parcelIndex, 42);
    assert.ok(nest.eggs >= 1 && nest.eggs <= 3);
    assert.equal(nest.raided, false);
  });

  it('carnivore nests are dangerous, herbivore nests are not', () => {
    assert.equal(nestIsDangerous('velociraptor'), true);
    assert.equal(nestIsDangerous('triceratops'), false);
    assert.equal(nestIsDangerous('stegosaurus'), false);
  });
});

describe('eggs', () => {
  it('egg names use the species label', () => {
    assert.equal(eggName('triceratops'), 'Triceratops Egg');
    assert.equal(eggName('tyrannosaurus-rex'), 'Tyrannosaurus rex Egg');
  });

  it('makeEggItem builds a backpack collectible', () => {
    const item = makeEggItem('triceratops', 1000);
    assert.equal(item.id, EGG_ITEM_ID);
    assert.equal(item.kind, 'collectible');
    assert.equal(item.meta.species, 'triceratops');
    assert.equal(item.meta.stolenAt, 1000);
    assert.ok(isEggItem({ ...item, uid: 'x' }));
    assert.equal(isEggItem({ id: 'rock' }), false);
  });

  it('hatch timing: ready after EGG_HATCH_MS', () => {
    const meta = { species: 'triceratops', stolenAt: 0 };
    assert.equal(eggReadyToHatch(meta, EGG_HATCH_MS - 1), false);
    assert.equal(eggReadyToHatch(meta, EGG_HATCH_MS), true);
    assert.equal(eggReadyToHatch(meta, EGG_HATCH_MS + 5000), true);
    assert.ok(eggHatchInMs(meta, 0) > 0);
    assert.ok(eggHatchInMs(meta, EGG_HATCH_MS + 1) <= 0);
  });

  it('eggs go cold after 24 hours', () => {
    const meta = { species: 'triceratops', stolenAt: 0 };
    assert.equal(eggIsCold(meta, 23 * 3600 * 1000), false);
    assert.equal(eggIsCold(meta, 25 * 3600 * 1000), true);
  });
});

describe('the land gate', () => {
  const rows = [
    { parcel_id: 'E2-0001', owner_email: 'owner@example.com' },
    { parcel_id: 'E2-0002', owner_email: 'someone@else.com' },
  ];

  it('owners can raise dinos', () => {
    assert.equal(canRaiseDino(rows, 'owner@example.com'), true);
    assert.equal(canRaiseDino(rows, 'OWNER@EXAMPLE.COM'), true); // case-insensitive
  });

  it('non-owners cannot', () => {
    assert.equal(canRaiseDino(rows, 'nobody@example.com'), false);
    assert.equal(canRaiseDino([], 'owner@example.com'), false);
    assert.equal(canRaiseDino(rows, ''), false);
    assert.equal(canRaiseDino(null, 'owner@example.com'), false);
  });

  it('the refusal is plain English', () => {
    assert.ok(NO_LAND_MESSAGE.includes('own land'));
  });
});

describe('growth', () => {
  it('baby → juvenile at 1 day → adult at 7 days', () => {
    assert.equal(growthStage(0, 1000), 'baby');
    assert.equal(growthStage(0, JUVENILE_AGE_MS - 1), 'baby');
    assert.equal(growthStage(0, JUVENILE_AGE_MS), 'juvenile');
    assert.equal(growthStage(0, ADULT_AGE_MS - 1), 'juvenile');
    assert.equal(growthStage(0, ADULT_AGE_MS), 'adult');
  });

  it('growthT runs 0 → 1 continuously', () => {
    assert.equal(growthT(0, 0), 0);
    assert.equal(growthT(0, -100), 0);
    assert.ok(growthT(0, ADULT_AGE_MS / 2) > 0.49 && growthT(0, ADULT_AGE_MS / 2) < 0.51);
    assert.equal(growthT(0, ADULT_AGE_MS), 1);
    assert.equal(growthT(0, ADULT_AGE_MS * 3), 1);
  });

  it('scales grow with stage', () => {
    const baby = growthScaleFor('baby');
    const juv = growthScaleFor('juvenile');
    const adult = growthScaleFor('adult');
    assert.ok(baby < juv && juv < adult);
    assert.equal(adult, 1.0);
  });

  it('ally scale derives from the adult scaleM', () => {
    // triceratops adult is 8.5 m
    assert.ok(Math.abs(allyScaleM('triceratops', 'adult') - 8.5) < 0.01);
    assert.ok(allyScaleM('triceratops', 'baby') < allyScaleM('triceratops', 'juvenile'));
  });

  it('baby model paths follow the convention', () => {
    assert.equal(babyModelPath('triceratops'), '/models/earth2/baby-triceratops.glb');
  });

  it('swaps to the adult model only at full maturity', () => {
    assert.equal(shouldSwapToAdult(0, ADULT_AGE_MS - 1), false);
    assert.equal(shouldSwapToAdult(0, ADULT_AGE_MS), true);
    assert.equal(shouldSwapToAdult(0, ADULT_AGE_MS * 2), true);
  });
});

describe('rig-driven growth', () => {
  it('classifies Mixamo bones into groups', () => {
    assert.equal(boneGroupFor('Head'), BONE_GROUP_HEAD);
    assert.equal(boneGroupFor('mixamorigNeck'), BONE_GROUP_HEAD);
    assert.equal(boneGroupFor('mixamorigHips'), BONE_GROUP_SPINE);
    assert.equal(boneGroupFor('mixamorigSpine2'), BONE_GROUP_SPINE);
    assert.equal(boneGroupFor('mixamorigLeftForeArm'), BONE_GROUP_ARM);
    assert.equal(boneGroupFor('mixamorigRightHand'), BONE_GROUP_ARM);
    assert.equal(boneGroupFor('mixamorigLeftUpLeg'), BONE_GROUP_LEG);
    assert.equal(boneGroupFor('mixamorigRightFoot'), BONE_GROUP_LEG);
    assert.equal(boneGroupFor('SomeUnknownBone'), BONE_GROUP_SPINE); // torso default
  });

  it('babies have big heads and short limbs; adults lengthen', () => {
    const baby = BONE_GROWTH_SCALES.baby;
    const adult = BONE_GROWTH_SCALES.adult;
    assert.ok(baby[BONE_GROUP_HEAD] > 1, 'baby head enlarged');
    assert.ok(baby[BONE_GROUP_LEG] < 1, 'baby legs shortened');
    assert.ok(adult[BONE_GROUP_HEAD] < baby[BONE_GROUP_HEAD], 'head settles');
    assert.ok(adult[BONE_GROUP_LEG] > baby[BONE_GROUP_LEG], 'legs lengthen');
    assert.ok(adult[BONE_GROUP_SPINE] > baby[BONE_GROUP_SPINE], 'torso lengthens');
  });

  it('boneScalesAt interpolates smoothly from baby to adult', () => {
    const atBirth = boneScalesAt(0);
    const atFull = boneScalesAt(1);
    assert.equal(atBirth[BONE_GROUP_HEAD], BONE_GROWTH_SCALES.baby[BONE_GROUP_HEAD]);
    assert.equal(atFull[BONE_GROUP_HEAD], BONE_GROWTH_SCALES.adult[BONE_GROUP_HEAD]);
    // midpoint: head scale between baby and adult values
    const mid = boneScalesAt(0.5);
    assert.ok(mid[BONE_GROUP_HEAD] < atBirth[BONE_GROUP_HEAD]);
    assert.ok(mid[BONE_GROUP_HEAD] > atFull[BONE_GROUP_HEAD]);
    assert.ok(mid[BONE_GROUP_LEG] > atBirth[BONE_GROUP_LEG]);
    assert.ok(mid[BONE_GROUP_LEG] < atFull[BONE_GROUP_LEG]);
    // clamps out-of-range input
    assert.deepEqual(boneScalesAt(-5), atBirth);
    assert.deepEqual(boneScalesAt(99), atFull);
  });

  it('overallScaleAt grows from baby size to adult scaleM', () => {
    const adultM = 8.5;
    assert.ok(Math.abs(overallScaleAt(0, adultM) - adultM * 0.22) < 0.001);
    assert.ok(Math.abs(overallScaleAt(1, adultM) - adultM) < 0.001);
    const mid = overallScaleAt(0.5, adultM);
    assert.ok(mid > adultM * 0.22 && mid < adultM);
  });

  it('rigScalesFor maps every bone to its group scale', () => {
    const bones = ['mixamorigHead', 'mixamorigHips', 'mixamorigLeftArm', 'mixamorigRightUpLeg'];
    const scales = rigScalesFor(bones, 0);
    const groups = boneScalesAt(0);
    assert.equal(scales['mixamorigHead'], groups[BONE_GROUP_HEAD]);
    assert.equal(scales['mixamorigHips'], groups[BONE_GROUP_SPINE]);
    assert.equal(scales['mixamorigLeftArm'], groups[BONE_GROUP_ARM]);
    assert.equal(scales['mixamorigRightUpLeg'], groups[BONE_GROUP_LEG]);
    assert.deepEqual(rigScalesFor([], 0.5), {});
    assert.deepEqual(rigScalesFor(null, 0.5), {});
  });
});

describe('ally behaviour', () => {
  it('follows at range, idles up close, hurries back when lost', () => {
    assert.equal(allyMoveDecision(0, 0, 100, 0), 'return'); // past max
    assert.equal(allyMoveDecision(0, 0, ALLY_FOLLOW_RANGE_M + 1, 0), 'follow');
    assert.equal(allyMoveDecision(0, 0, ALLY_IDLE_RANGE_M - 0.5, 0), 'idle');
    assert.equal(allyMoveDecision(0, 0, (ALLY_IDLE_RANGE_M + ALLY_FOLLOW_RANGE_M) / 2, 0), 'follow');
    // boundary: exactly at max range follows (not return)
    assert.equal(allyMoveDecision(0, 0, ALLY_MAX_RANGE_M, 0), 'follow');
  });

  it('attacks the owner target first, then the attacker', () => {
    const ally = { id: 'ally-1', isAlly: true };
    const ownerId = 'walker';
    const target = { id: 'rex-1', alive: true };
    const attacker = { id: 'raptor-2', alive: true };
    assert.equal(allyAttackTarget(ally, target, attacker, ownerId), target);
    assert.equal(allyAttackTarget(ally, null, attacker, ownerId), attacker);
    assert.equal(allyAttackTarget(ally, null, null, ownerId), null);
  });

  it('never attacks the owner, itself, or fellow allies', () => {
    const ally = { id: 'ally-1', isAlly: true };
    const ownerId = 'walker';
    const owner = { id: 'walker', alive: true };
    const fellow = { id: 'ally-2', alive: true, isAlly: true };
    assert.equal(allyAttackTarget(ally, owner, null, ownerId), null);
    assert.equal(allyAttackTarget(ally, ally, null, ownerId), null);
    assert.equal(allyAttackTarget(ally, fellow, null, ownerId), null);
    assert.equal(allyAttackTarget(ally, { id: 'dead', alive: false }, null, ownerId), null);
  });

  it('wild predators refuse allied dinos as prey', () => {
    assert.equal(isAlliedDino({ isAlly: true }), true);
    assert.equal(isAlliedDino({ isAlly: false }), false);
    assert.equal(isAlliedDino({}), false);
    assert.equal(isAlliedDino(null), false);
  });
});
