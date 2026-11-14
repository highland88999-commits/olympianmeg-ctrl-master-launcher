// tests/earth2-breeding.test.mjs
// EARTH 2 — DINO BREEDING (Merlin, 2026-11-03): nests, stolen
// eggs, tap-to-hatch into the backpack (the pack IS home),
// home copies on the land, growth, and ally law.
//
// Run: node --test tests/earth2-breeding.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JUVENILE_AGE_MS,
  ADULT_AGE_MS,
  EGG_ITEM_ID,
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
  STEAL_REACH_M,
  isNestInStealReach,
  RAISE_CAP_FREE,
  RAISE_CAP_LANDOWNER,
  DINO_ITEM_ID,
  DINO_ITEM_KIND,
  DINO_STATE_OUT,
  DINO_STATE_PACK,
  LEGACY_DINO_STATE_HOME,
  nestEggCount,
  makeNest,
  nestIsDangerous,
  nestSpeciesName,
  nestLabelText,
  eggName,
  makeEggItem,
  isEggItem,
  eggIsCold,
  canRaiseDino,
  ownedRowsOf,
  isOwnParcel,
  dinoIdFor,
  dinoIdOf,
  dinoDisplayName,
  makeDinoItem,
  isDinoItem,
  dinoStateOf,
  raisedDinoItems,
  raiseCapFor,
  countRaisedDinos,
  canHatchMore,
  raiseCapRefusal,
  homeParcelFor,
  homeSpotFor,
  homeCopiesFor,
  setDinoItemState,
  recallTravellersToPack,
  dinosToSpawnOnLeaving,
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

  it('eggs hatch on tap — there is no hatch timer any more', () => {
    // The 10-minute auto-hatch timer is GONE (Merlin, 2026-11-14):
    // hatching is user-caused — the user taps the egg in the
    // backpack and it hatches right away. The timer exports are
    // gone from the law, and the scene holds no hatch check.
    const here = dirname(fileURLToPath(import.meta.url));
    const law = readFileSync(join(here, '..', 'lib', 'earth2', 'breeding.js'), 'utf8');
    assert.ok(!law.includes('export const EGG_HATCH_MS'), 'the timer constant is gone');
    assert.ok(!law.includes('export function eggHatchInMs'), 'the countdown helper is gone');
    assert.ok(!law.includes('export function eggReadyToHatch'), 'the ready helper is gone');
    const scene = readFileSync(join(here, '..', 'components', 'earth2', 'Earth2World.jsx'), 'utf8');
    assert.ok(!scene.includes('eggReadyToHatch'), 'no hatch check in the frame loop');
    assert.ok(!scene.includes('EGG_HATCH_MS'), 'no hatch timer in the scene');
    assert.ok(scene.includes('hatchEggRef.current'), 'the backpack egg row hatches through a ref');
    assert.ok(scene.includes('onEggHatch='), 'the HUD wires the egg tap');
    assert.ok(scene.includes('eggIsCold('), 'a cold egg still refuses to hatch');
  });

  it('eggs go cold after 24 hours', () => {
    const meta = { species: 'triceratops', stolenAt: 0 };
    assert.equal(eggIsCold(meta, 23 * 3600 * 1000), false);
    assert.equal(eggIsCold(meta, 25 * 3600 * 1000), true);
  });
});

describe('the land gate (who is a land owner)', () => {
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

  it('the owners list is a Map in the scene — it reads as one', () => {
    // Found Nov 14, 2026 while remodelling home: the scene's
    // ownersByParcel is a Map, and Object.values(aMap) is [] —
    // every landowner silently read as landless. The law reads
    // the Map itself now.
    const map = new Map([
      ['E2-0001', { parcel_id: 'E2-0001', owner_email: 'owner@example.com' }],
      ['E2-0002', { parcel_id: 'E2-0002', owner_email: 'someone@else.com' }],
    ]);
    assert.equal(canRaiseDino(map, 'owner@example.com'), true);
    assert.equal(canRaiseDino(map, 'nobody@example.com'), false);
    assert.deepEqual(ownedRowsOf(map), rows);
    assert.deepEqual(ownedRowsOf(rows), rows);
    assert.deepEqual(ownedRowsOf({ 'E2-0001': rows[0] }), [rows[0]]);
    assert.deepEqual(ownedRowsOf(null), []);
  });

  it('isOwnParcel names the parcel the user owns', () => {
    const map = new Map([
      ['E2-0619', { parcel_id: 'E2-0619', owner_email: 'owner@example.com' }],
    ]);
    assert.equal(isOwnParcel(map, 'E2-0619', 'owner@example.com'), true);
    assert.equal(isOwnParcel(map, 'E2-0619', 'someone@else.com'), false);
    assert.equal(isOwnParcel(map, 'E2-0002', 'owner@example.com'), false);
    assert.equal(isOwnParcel(rows, 'E2-0001', 'owner@example.com'), true);
    assert.equal(isOwnParcel(null, 'E2-0619', 'owner@example.com'), false);
  });
});

describe('raise caps (Merlin, 2026-11-14)', () => {
  it('anyone may raise one dino; a land owner may raise four', () => {
    assert.equal(RAISE_CAP_FREE, 1);
    assert.equal(RAISE_CAP_LANDOWNER, 4);
    assert.equal(raiseCapFor(false), 1);
    assert.equal(raiseCapFor(true), 4);
  });

  it('the cap counts backpack dinos plus live allies, distinctly', () => {
    const a = makeDinoItem('triceratops', 1000);
    const b = makeDinoItem('velociraptor', 2000);
    assert.equal(countRaisedDinos([], []), 0);
    assert.equal(countRaisedDinos([a], []), 1);
    assert.equal(countRaisedDinos([a, b], []), 2);
    // A live ally with its item counts once, not twice.
    assert.equal(countRaisedDinos([a], [dinoIdOf(a)]), 1);
    // A live ally without an item still counts (record gap).
    assert.equal(countRaisedDinos([a], ['dino-ghost-9']), 2);
    // Eggs are not raised dinos.
    assert.equal(countRaisedDinos([makeEggItem('triceratops', 1000)], []), 0);
  });

  it('canHatchMore opens and shuts at the cap', () => {
    const one = [makeDinoItem('triceratops', 1000)];
    assert.deepEqual(canHatchMore([], false, []), { ok: true, cap: 1, raised: 0 });
    assert.deepEqual(canHatchMore(one, false, []), { ok: false, cap: 1, raised: 1 });
    const four = [1, 2, 3, 4].map((i) => makeDinoItem('triceratops', i * 1000));
    assert.deepEqual(canHatchMore(four.slice(0, 3), true, []), { ok: true, cap: 4, raised: 3 });
    assert.deepEqual(canHatchMore(four, true, []), { ok: false, cap: 4, raised: 4 });
  });

  it('the refusal is plain English and names the way up', () => {
    assert.equal(raiseCapRefusal(0, 1, false), null);
    const free = raiseCapRefusal(1, 1, false);
    assert.ok(free.includes('1 dino') && free.includes('Buy a parcel'), free);
    const owner = raiseCapRefusal(4, 4, true);
    assert.ok(owner.includes('4 dinos') && owner.includes('land owner'), owner);
  });
});

describe('raised dinos are backpack items', () => {
  it('makeDinoItem builds a dino-kind item with a stable id', () => {
    const item = makeDinoItem('triceratops', 1000, { state: DINO_STATE_OUT, homeParcelId: 'E2-0619' });
    assert.equal(item.id, DINO_ITEM_ID);
    assert.equal(item.kind, DINO_ITEM_KIND);
    assert.equal(item.qty, 1);
    assert.equal(item.name, 'Triceratops (companion)');
    assert.equal(item.meta.species, 'triceratops');
    assert.equal(item.meta.bornAt, 1000);
    assert.equal(item.meta.dinoId, 'dino-triceratops-1000');
    assert.equal(item.meta.state, DINO_STATE_OUT);
    assert.equal(item.meta.homeParcelId, 'E2-0619');
    assert.equal(item.meta.travel, false, 'a fresh hatch never travels');
    assert.ok(isDinoItem(item));
    assert.equal(dinoIdOf(item), 'dino-triceratops-1000');
    assert.equal(dinoStateOf(item), DINO_STATE_OUT);
    assert.equal(isDinoItem(makeEggItem('triceratops', 1000)), false);
  });

  it('display names use the registry, never the slug', () => {
    assert.equal(dinoDisplayName('triceratops'), 'Triceratops (companion)');
    assert.equal(dinoDisplayName('tyrannosaurus-rex'), 'Tyrannosaurus rex (companion)');
  });

  it('legacy items without a state read as pack; ids derive', () => {
    const legacy = { kind: 'dino', meta: { species: 'velociraptor', bornAt: 500 } };
    assert.equal(dinoStateOf(legacy), DINO_STATE_PACK);
    assert.equal(dinoIdOf(legacy), 'dino-velociraptor-500');
    assert.ok(isDinoItem(legacy));
  });

  it('raisedDinoItems picks only dinos out of a mixed pack', () => {
    const items = [makeEggItem('triceratops', 1), makeDinoItem('triceratops', 2), { id: 'x', kind: 'material', name: 'Rock', qty: 1, meta: {} }];
    assert.equal(raisedDinoItems(items).length, 1);
    assert.equal(raisedDinoItems(null).length, 0);
  });

  it('a stored legacy home state reads as pack — the backpack is home now', () => {
    // The 2026-11-14 build stored unsummoned dinos as 'home'
    // (living on the land). That state is gone: the backpack is
    // home, the land holds only copies.
    const legacy = { kind: 'dino', meta: { species: 'velociraptor', bornAt: 500, state: LEGACY_DINO_STATE_HOME, dinoId: 'dino-velociraptor-500' } };
    assert.equal(LEGACY_DINO_STATE_HOME, 'home');
    assert.equal(dinoStateOf(legacy), DINO_STATE_PACK);
    const next = setDinoItemState([legacy], 'dino-velociraptor-500', LEGACY_DINO_STATE_HOME);
    assert.equal(dinoStateOf(next[0]), DINO_STATE_PACK);
  });

  it('setDinoItemState flips one dino and leaves the rest alone', () => {
    const a = makeDinoItem('triceratops', 1000);
    const b = makeDinoItem('velociraptor', 2000);
    // A summon marks travel; a send-back clears it.
    const next = setDinoItemState([a, b], dinoIdOf(a), DINO_STATE_OUT, 'E2-0619', true);
    assert.equal(dinoStateOf(next[0]), DINO_STATE_OUT);
    assert.equal(next[0].meta.homeParcelId, 'E2-0619');
    assert.equal(next[0].meta.travel, true);
    assert.equal(dinoStateOf(next[1]), DINO_STATE_PACK);
    assert.equal(next[1].meta.homeParcelId, null);
    assert.equal(next[1].meta.travel, false);
    // travel undefined leaves the flag as it was.
    const kept = setDinoItemState(next, dinoIdOf(a), DINO_STATE_PACK);
    assert.equal(dinoStateOf(kept[0]), DINO_STATE_PACK);
    assert.equal(kept[0].meta.travel, true);
    // The item is never remade: same uid when one exists.
    const withUid = [{ ...a, uid: 'u-1' }, b];
    const nextUid = setDinoItemState(withUid, dinoIdOf(a), DINO_STATE_OUT);
    assert.equal(nextUid[0].uid, 'u-1');
    assert.equal(dinoStateOf(nextUid[0]), DINO_STATE_OUT);
  });
});

describe('the backpack is home (Merlin, 2026-11-14)', () => {
  const owned = [
    { parcel_id: 'E2-0669', owner_email: 'owner@example.com' },
    { parcel_id: 'E2-0619', owner_email: 'owner@example.com' },
    { parcel_id: 'E2-0002', owner_email: 'someone@else.com' },
  ];
  const center = { x: 100, z: -50 };

  it('homeParcelFor picks the first owned parcel, or null', () => {
    assert.equal(homeParcelFor(owned, [], 'owner@example.com'), 'E2-0619');
    assert.equal(homeParcelFor([], [], 'owner@example.com'), null);
    assert.equal(homeParcelFor(owned, [], 'nobody@example.com'), null);
    assert.equal(homeParcelFor(owned, [], ''), null);
    // Claims count as ownership too.
    assert.equal(homeParcelFor([], [{ parcel_id: 'E2-0719', owner_email: 'owner@example.com' }], 'owner@example.com'), 'E2-0719');
    // And it reads the scene's Map, not just arrays.
    const map = new Map(owned.map((r) => [r.parcel_id, r]));
    assert.equal(homeParcelFor(map, [], 'owner@example.com'), 'E2-0619');
  });

  it('entering home recalls the travellers to the pack — travel untouched', () => {
    // The travel flag is the memory of who was out: entering
    // flips state only, so leaving knows who to respawn.
    const a = makeDinoItem('triceratops', 1000, { state: DINO_STATE_OUT, travel: true });
    const b = makeDinoItem('velociraptor', 2000, { state: DINO_STATE_PACK, travel: false });
    const next = recallTravellersToPack([a, b]);
    assert.equal(dinoStateOf(next[0]), DINO_STATE_PACK);
    assert.equal(next[0].meta.travel, true, 'the flag remembers it was out');
    assert.equal(dinoStateOf(next[1]), DINO_STATE_PACK);
    assert.equal(next[1].meta.travel, false);
    assert.deepEqual(recallTravellersToPack([]), []);
  });

  it('leaving respawns only the travel-marked dinos in the pack', () => {
    const out = makeDinoItem('triceratops', 1000, { state: DINO_STATE_OUT, travel: true });
    const marked = makeDinoItem('velociraptor', 2000, { state: DINO_STATE_PACK, travel: true });
    const unmarked = makeDinoItem('ankylosaurus', 3000, { state: DINO_STATE_PACK, travel: false });
    const leaving = dinosToSpawnOnLeaving([out, marked, unmarked]);
    assert.equal(leaving.length, 1, 'only the marked pack dino');
    assert.equal(dinoIdOf(leaving[0]), dinoIdOf(marked));
    // A summon marks, a send-back clears — so changing the
    // selection through the backpack changes what leaves.
    const reselected = setDinoItemState([marked, unmarked], dinoIdOf(unmarked), DINO_STATE_PACK, undefined, true);
    assert.equal(dinosToSpawnOnLeaving(reselected).length, 2);
    const cleared = setDinoItemState(reselected, dinoIdOf(marked), DINO_STATE_PACK, undefined, false);
    assert.equal(dinosToSpawnOnLeaving(cleared).length, 1);
    assert.equal(dinoIdOf(dinosToSpawnOnLeaving(cleared)[0]), dinoIdOf(unmarked));
  });

  it('home copies mirror the record — same species, same birth, a graze spot each', () => {
    const items = [
      makeDinoItem('triceratops', 1000, { state: DINO_STATE_OUT, travel: true }),
      makeDinoItem('velociraptor', 2000, { state: DINO_STATE_PACK, travel: false }),
    ];
    const copies = homeCopiesFor(items, owned, [], 'owner@example.com', center);
    assert.equal(copies.length, 2, 'one copy per raised dino');
    assert.equal(copies[0].dinoId, dinoIdOf(items[0]));
    assert.equal(copies[0].species, 'triceratops');
    assert.equal(copies[0].bornAt, 1000, 'same growth stage as the raised dino');
    assert.equal(copies[0].homeParcelId, 'E2-0619');
    for (const c of copies) {
      const d = Math.hypot(c.spot.x - center.x, c.spot.z - center.z);
      assert.ok(d >= 3 && d <= 7, `copy spot ${d} m out`);
    }
    // Deterministic: the same record always draws the same copies.
    assert.deepEqual(homeCopiesFor(items, owned, [], 'owner@example.com', center), copies);
    // Landless: no home parcel, no copies.
    assert.deepEqual(homeCopiesFor(items, [], [], 'owner@example.com', center), []);
    assert.deepEqual(homeCopiesFor(items, owned, [], 'nobody@example.com', center), []);
    assert.deepEqual(homeCopiesFor(items, owned, [], 'owner@example.com', null), []);
  });

  it('homeSpotFor is deterministic and near the parcel center', () => {
    const center = { x: 100, z: -50 };
    const a = homeSpotFor(center, 'dino-triceratops-1000');
    const b = homeSpotFor(center, 'dino-triceratops-1000');
    assert.deepEqual(a, b);
    const d = Math.hypot(a.x - center.x, a.z - center.z);
    assert.ok(d >= 3 && d <= 7, `spot ${d} m out`);
    const c = homeSpotFor(center, 'dino-velociraptor-2000');
    assert.ok(Math.hypot(a.x - c.x, a.z - c.z) > 0.01, 'two dinos do not stack');
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

describe('raising rules are wired into the scene (Merlin, 2026-11-14)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '..', 'components', 'earth2', 'Earth2World.jsx'), 'utf8');

  it('the hatch is a tap, not a timer — the cap still applies', () => {
    assert.ok(scene.includes('hatchEggRef.current'), 'the egg tap hatches through a ref');
    assert.ok(scene.includes('canHatchMore('), 'hatch checks the cap');
    assert.ok(scene.includes('raiseCapRefusal('), 'cap refusal is plain English');
    assert.ok(!scene.includes('eggReadyToHatch'), 'no timer-gated hatch anywhere');
    assert.ok(!scene.includes('EGG_HATCH_MS'), 'the 10-minute timer is gone');
    assert.ok(!scene.includes('NO_LAND_MESSAGE'), 'the old no-land message is gone');
    assert.ok(!scene.includes('no land, no dino'), 'the old gate comment is gone');
  });

  it('hatching mints the backpack record in pack state — no spawn', () => {
    assert.ok(scene.includes('makeDinoItem(dino.id, bornAt'), 'hatch mints the dino item');
    assert.ok(scene.includes("state: DINO_STATE_PACK, homeParcelId, travel: false"), 'a hatch lands in the backpack, travelling nowhere');
    assert.ok(!scene.includes('spawnAllyRef.current(dino.id, bornAt'), 'the hatch spawns nothing — summoning is the user\'s tap');
    assert.ok(scene.includes('lives in your backpack now'), 'the hatch notice says where the baby lives');
    assert.ok(!scene.includes('spawnAlly(dino.id, Date.now())'), 'the bare spawnAlly call that threw is gone');
  });

  it('summon keeps the item in the pack and flips its state', () => {
    assert.ok(scene.includes('summonDinoRef.current'), 'summon runs scene-side');
    assert.ok(scene.includes('setDinoItemState(r.items || [], dinoId, DINO_STATE_OUT, undefined, true)'), 'summon flips state to out and marks travel');
    assert.ok(scene.includes("despawnAllyByDinoId(dinoId, 'follow')"), 'summon lifts only the traveller — never a home copy');
    assert.ok(!scene.includes('items: (r.items || []).filter((it) => it !== dinoItem)'), 'summon no longer removes the item');
  });

  it('sending back returns the dino to the backpack — the pack is home', () => {
    assert.ok(scene.includes('recallDinoRef.current'), 'recall runs scene-side');
    assert.ok(scene.includes('returns to your backpack'), 'the send-back notice names the pack');
    assert.ok(!scene.includes('heads home to'), 'no dino is sent to live on the land any more');
    assert.ok(!scene.includes("mode: 'home', homeX: spot.x"), 'recall spawns no home dino');
  });

  it('home copies are reconciled from the record, miniature and grazing', () => {
    assert.ok(scene.includes('ensureHomeCopies()'), 'copies reconcile on mount and every second');
    assert.ok(scene.includes("mode: 'home'"), 'copies spawn in home mode');
    assert.ok(scene.includes('PARCEL_SHRINK_SCALE'), 'copies render miniature, like builds');
    assert.ok(scene.includes('driveHomeAllies(dt)'), 'copies graze on their own tick');
    assert.ok(scene.includes("ally.mode === 'home'"), 'follow logic skips copies');
    assert.ok(scene.includes('🏠 ${nestSpeciesName(species)}'), 'copies wear a name plate');
    assert.ok(scene.includes('homeCopiesFor('), 'the copy list comes from the law, not the scene');
  });

  it('tapping a home copy summons that dino out; tapping a traveller sends it back', () => {
    assert.ok(scene.includes("tappedAlly.mode === 'home'"), 'a copy tap is a summon');
    assert.ok(scene.includes('A home copy: summon the dino out to your side.'), 'the copy tap is explicit');
  });

  it('entering your parcel recalls travellers; leaving respawns only the marked ones', () => {
    assert.ok(scene.includes('enterHomeParcel()'), 'entering home recalls the travellers');
    assert.ok(scene.includes('leaveHomeParcel()'), 'leaving respawns the marked ones');
    assert.ok(scene.includes('recallTravellersToPack('), 'entering flips out dinos to pack');
    assert.ok(scene.includes('dinosToSpawnOnLeaving('), 'leaving reads the travel flags');
    assert.ok(scene.includes('isOwnParcel('), 'home-ness reads the owners map, not a guess');
    assert.ok(scene.includes('wasAtHome'), 'the crossing is tracked, so border wobble never churns it');
  });

  it('raised dinos restore on mount from the backpack record', () => {
    assert.ok(scene.includes('Raised dinos restore on mount'), 'restore is explicit');
    assert.ok(scene.includes('DINO_STATE_OUT'), 'out dinos rejoin the walker');
    assert.ok(scene.includes('LEGACY_DINO_STATE_HOME'), 'a stored home state migrates to pack');
    assert.ok(scene.includes('ensureHomeCopies()'), 'copies restore from the record');
    assert.ok(!scene.includes("mode: 'home', homeX: spot.x, homeZ: spot.z"), 'restore no longer spawns land dinos from the item');
  });

  it('the HUD lists only the hunting party', () => {
    assert.ok(scene.includes("allies.filter((a) => a.mode !== 'home')"), 'home dinos stay out of the Allies line');
    assert.ok(scene.includes('syncAllyHud()'), 'the HUD refreshes on every ally change');
  });
});

describe('egg stealing is reachable (Merlin, 2026-11-14)', () => {
  it('the steal reach is 6 m — forgiving when a parent mills near the ring', () => {
    assert.equal(STEAL_REACH_M, 6);
  });

  it('a walker at the ring is in reach; a walker 7 m off is not', () => {
    const nest = makeNest('nest-stegosaurus', 'stegosaurus', 100, 100, -1);
    assert.equal(isNestInStealReach(101, 100, nest), true, 'a metre from the egg');
    assert.equal(isNestInStealReach(105, 100, nest), true, '5 m — inside the reach');
    assert.equal(isNestInStealReach(107, 100, nest), false, '7 m — too far');
  });

  it('a raided or empty nest is never in reach', () => {
    const nest = makeNest('nest-stegosaurus', 'stegosaurus', 100, 100, -1);
    assert.equal(isNestInStealReach(100, 100, { ...nest, raided: true }), false);
    assert.equal(isNestInStealReach(100, 100, { ...nest, eggs: 0 }), false);
  });
});

describe('the steal prompt is wired into the scene (Merlin, 2026-11-14)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '..', 'components', 'earth2', 'Earth2World.jsx'), 'utf8');

  it('the prompt button lives at top level, not inside the collapsible CONTROLS panel', () => {
    // ROOT CAUSE (proven by Merlin's two videos + the code): the
    // button lived ONLY inside the CONTROLS (actions) E2Panel, and
    // E2Panel unmounts its body when shrunk — {!collapsed && <div>
    // {children}</div>}. On his phone the panel sat shrunk to its
    // orb, so the button never rendered no matter how close he
    // stood. The prompt must live outside that panel.
    const panelOpen = scene.indexOf('layout={panelLayout.actions}');
    assert.ok(panelOpen >= 0, 'the CONTROLS panel exists');
    const panelClose = scene.indexOf('</E2Panel>', panelOpen);
    assert.ok(panelClose > panelOpen, 'the panel closes');
    const panelBody = scene.slice(panelOpen, panelClose);
    assert.ok(!panelBody.includes('stealPrompt'), 'no steal prompt inside the collapsible panel');
    assert.ok(scene.includes('STEAL PROMPT — TOP LEVEL'), 'the prompt renders at top level with its why');
    assert.ok(scene.includes("stealPrompt && !driving && !buildMode"), 'the top-level prompt shows on foot only');
  });

  it('the steal tick uses the 6 m reach law, not the old 4 m literal', () => {
    assert.ok(scene.includes('isNestInStealReach(walker.x, walker.z, nest)'), 'the tick reads the reach law');
    assert.ok(!scene.includes('d < 4 && d < nearestD'), 'the old 4 m literal is gone');
    assert.ok(scene.includes('STEAL_REACH_M'), 'the reach constant is imported');
  });

  it('tapping the egg steals it — the click Merlin tried first', () => {
    assert.ok(scene.includes('...nests.map((n) => n.group)'), 'nest groups are tap targets');
    assert.ok(scene.includes('group.userData.nestRef = record'), 'each nest group carries its record');
    assert.ok(scene.includes('stealEggRef.current(tappedNest.id)'), 'an in-reach tap steals straight in');
    assert.ok(scene.includes('Too far — walk up to the nest to steal the egg.'), 'an out-of-reach tap says so');
    assert.ok(scene.includes('This nest is empty.'), 'an empty nest says so');
  });

  it('the steal handler takes a nest id from a tap, not just the live prompt', () => {
    assert.ok(scene.includes('stealEggRef.current = async (nestId)'), 'the handler accepts a nest id');
    assert.ok(scene.includes('stealPromptRef.current && stealPromptRef.current.nestId'), 'the button still resolves through the prompt');
  });
});
