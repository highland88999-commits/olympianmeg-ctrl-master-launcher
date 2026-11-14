// tests/earth2-breeding.test.mjs
// EARTH 2 — DINO BREEDING (Merlin, 2026-11-03): nests, stolen
// eggs, hatching behind the land gate, growth, and ally law.
//
// Run: node --test tests/earth2-breeding.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  NEST_SPECIES,
  NEST_LABEL_MAX_DIST_M,
  NEST_LABEL_HEIGHT_M,
  nestEggCount,
  makeNest,
  nestIsDangerous,
  nestSpeciesName,
  nestLabelText,
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
  uniformScaleAt,
  UNIFORM_HATCH_SIZE_M,
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

describe('uniform hatch size', () => {
  it('all species hatch at the same size', () => {
    // A baby T-Rex (adult ~12m) and baby raptor (adult ~2m)
    // start at the same size — Merlin's rule.
    const trex = uniformScaleAt(0, 12);
    const raptor = uniformScaleAt(0, 2);
    assert.equal(trex, UNIFORM_HATCH_SIZE_M);
    assert.equal(raptor, UNIFORM_HATCH_SIZE_M);
    assert.equal(trex, raptor);
  });

  it('growth converges on the adult size', () => {
    assert.equal(uniformScaleAt(1, 12), 12);
    assert.equal(uniformScaleAt(1, 2), 2);
    // Mid-growth: between hatch size and adult.
    const mid = uniformScaleAt(0.5, 12);
    assert.ok(mid > UNIFORM_HATCH_SIZE_M && mid < 12);
  });

  it('defaults sanely for bad input', () => {
    assert.equal(uniformScaleAt(0, 0), UNIFORM_HATCH_SIZE_M);
    assert.equal(uniformScaleAt(-1, 12), UNIFORM_HATCH_SIZE_M);
    assert.equal(uniformScaleAt(2, 12), 12);
  });
});

describe('nest nameplates (Merlin, 2026-11-14)', () => {
  it('label text uses the display name and the live count', () => {
    assert.equal(nestLabelText('triceratops', 3), '🥚 Triceratops Nest · 3 eggs');
    assert.equal(nestLabelText('triceratops', 2), '🥚 Triceratops Nest · 2 eggs');
    assert.equal(nestLabelText('triceratops', 1), '🥚 Triceratops Nest · 1 egg');
    assert.equal(nestLabelText('triceratops', 0), '🥚 Triceratops Nest · 0 eggs');
    assert.equal(nestLabelText('tyrannosaurus-rex', 1), '🥚 Tyrannosaurus rex Nest · 1 egg');
  });

  it('every nesting species resolves a display name — no raw slugs on plates', () => {
    assert.ok(NEST_SPECIES.length >= 10, 'nesting species listed');
    for (const slug of NEST_SPECIES) {
      const name = nestSpeciesName(slug);
      assert.ok(name && name !== slug, `${slug} has a display name`);
      assert.ok(!nestLabelText(slug, 2).includes(slug), `${slug} plate shows the name, not the slug`);
    }
  });

  it('counts clamp to whole eggs, never negative', () => {
    assert.ok(nestLabelText('triceratops', -1).endsWith('0 eggs'));
    assert.ok(nestLabelText('triceratops', 2.7).endsWith('2 eggs'));
    assert.ok(nestLabelText('triceratops', null).endsWith('0 eggs'));
  });

  it('the plate reads from 200 m and floats above the nest', () => {
    assert.equal(NEST_LABEL_MAX_DIST_M, 200);
    assert.ok(NEST_LABEL_HEIGHT_M > 0, 'label floats above the ring');
  });

  it('a stolen egg drops the plate count — the raid ends it', () => {
    // The steal loop, in law terms: eggs 3 → 2 → 1 → 0 (raided).
    const nest = makeNest('nest-triceratops', 'triceratops', 0, 0, -1);
    assert.ok(nest.eggs >= 1 && nest.eggs <= 3);
    let shown = nestLabelText(nest.species, nest.eggs);
    assert.ok(shown.includes(`${nest.eggs} egg`), 'plate opens on the live count');
    nest.eggs -= 1;
    shown = nestLabelText(nest.species, nest.eggs);
    assert.ok(shown.includes(`${nest.eggs} egg`), 'plate follows the steal');
    nest.eggs = 0;
    nest.raided = true;
    assert.equal(nestLabelText(nest.species, nest.eggs), '🥚 Triceratops Nest · 0 eggs');
  });
});

describe('nest nameplates are wired into the scene', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '..', 'components', 'earth2', 'Earth2World.jsx'), 'utf8');

  it('placeNests gives every nest a nameplate', () => {
    assert.ok(scene.includes('nestLabelText(species, nest.eggs)'), 'plate carries species + live count');
    assert.ok(scene.includes('NEST_LABEL_MAX_DIST_M'), 'plate range comes from the law');
    assert.ok(scene.includes("makeLabel("), 'plate uses the house label helper');
  });

  it('the steal handler updates the plate and drops it when raided', () => {
    assert.ok(scene.includes('nestLabelRef.current(nest)'), 'steal refreshes the plate');
    assert.ok(scene.includes('nest.label.el.textContent = nestLabelText(nest.species, nest.eggs)'), 'count updates on steal');
    assert.ok(scene.includes('nest.label = null'), 'raided plate is dropped');
    assert.ok(scene.includes('l.el.remove()'), 'dropped plate leaves the DOM');
  });
});
