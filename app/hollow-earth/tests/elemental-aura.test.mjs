// Hollow Earth elemental aura table: one row per element, radii,
// totals, lightning delegating to the shared law, guards.
// Run: node app/hollow-earth/tests/elemental-aura.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEMENTS, ELEMENT_AURA, auraRowFor, auraForElement, auraSourceAllowed,
  isExemptSource, elementalStrikeDue, applyElementalStrike, elementalTick,
  createElementalVictimState, SHADOW_GLOOM_OPACITY, ACID_POOL_RADIUS_M,
  ACID_POOL_SECONDS, FROST_CHILL_FACTOR, FROST_CHILL_SECONDS, SAND_VEIL_SECONDS,
} from '../elemental-aura.js';
import {
  AURA_R_M, BURN_HIT_DMG, BURN_DPS, BURN_SECONDS, STRIKE_INTERVAL_S,
  LIGHTNING_COLORS,
} from '../../../lib/lightning-aura.js';
import { PROJECTILE_STYLE } from '../monster-projectiles.js';

test('table: exactly the 7 elements from spawns.js:51, one row each', () => {
  assert.deepEqual([...ELEMENTS], ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'frost']);
  for (const el of ELEMENTS) {
    assert.ok(ELEMENT_AURA[el], `missing aura row for ${el}`);
    assert.equal(ELEMENT_AURA[el].element, el);
    assert.ok(ELEMENT_AURA[el].radiusM > 0, `${el} radius`);
    assert.ok(ELEMENT_AURA[el].total === ELEMENT_AURA[el].hit + ELEMENT_AURA[el].dps * ELEMENT_AURA[el].seconds, `${el} total`);
  }
  assert.equal(auraRowFor('unknown-element'), null, 'unknown element has no row');
  assert.equal(auraRowFor(null), null);
});

test('lightning: delegates exactly to lib/lightning-aura.js — 59 m / 8 + 6/s x 3 s = 26', () => {
  const r = ELEMENT_AURA.lightning;
  assert.equal(r.radiusM, AURA_R_M);
  assert.equal(AURA_R_M, 59, 'Merlin\u2019s radius, pinned');
  assert.equal(r.hit, BURN_HIT_DMG);
  assert.equal(BURN_HIT_DMG, 8);
  assert.equal(r.dps, BURN_DPS);
  assert.equal(BURN_DPS, 6);
  assert.equal(r.seconds, BURN_SECONDS);
  assert.equal(BURN_SECONDS, 3);
  assert.equal(r.total, 26);
  assert.equal(r.secondary, 'burn');
  assert.equal(r.color, PROJECTILE_STYLE.lightning.color);
  const a = auraForElement('lightning', { x: 0, z: 0 }, { x: 0, z: -59 });
  assert.equal(a.radiusM, 59);
  assert.equal(a.targetInRange, true, 'strikes at exactly 59 m');
  assert.deepEqual(a.lightningColor, LIGHTNING_COLORS['lightning-monster'], 'white-yellow for lightning monsters');
  const dragon = auraForElement('lightning', { x: 0, z: 0 }, { x: 0, z: -59 }, { dragon: true });
  assert.deepEqual(dragon.lightningColor, LIGHTNING_COLORS.dragon, 'red for dragons');
  const beyond = auraForElement('lightning', { x: 0, z: 0 }, { x: 0, z: -59.5 });
  assert.equal(beyond.targetInRange, false, 'nothing past 59 m');
});

test('fire: 24 m, 4 hit + 4/s burn x 3 s = 16', () => {
  const r = ELEMENT_AURA.fire;
  assert.equal(r.radiusM, 24);
  assert.equal(r.hit, 4);
  assert.equal(r.dps, 4);
  assert.equal(r.seconds, 3);
  assert.equal(r.total, 16);
  assert.equal(r.secondary, 'burn');
  assert.equal(r.color, PROJECTILE_STYLE.fire.color);
  assert.equal(r.color, 0xff6a22);
});

test('acid: 18 m, 3 hit + 3/s DoT x 4 s = 15 + ground pool 3.5 m / 4 s', () => {
  const r = ELEMENT_AURA.acid;
  assert.equal(r.radiusM, 18);
  assert.equal(r.hit, 3);
  assert.equal(r.dps, 3);
  assert.equal(r.seconds, 4);
  assert.equal(r.total, 15);
  assert.equal(r.secondary, 'pool');
  assert.equal(r.poolRadiusM, ACID_POOL_RADIUS_M);
  assert.equal(ACID_POOL_RADIUS_M, 3.5);
  assert.equal(r.poolSeconds, ACID_POOL_SECONDS);
  assert.equal(ACID_POOL_SECONDS, 4);
  assert.equal(r.color, 0x7ed321);
  const a = auraForElement('acid', { x: 0, z: 0 }, { x: 0, z: -18 });
  assert.equal(a.targetInRange, true);
  assert.equal(a.poolRadiusM, 3.5);
  assert.equal(a.poolSeconds, 4);
});

test('poison: 20 m, 2 hit + 4/s DoT x 4 s = 18 — row exists though 0 are placed live', () => {
  const r = ELEMENT_AURA.poison;
  assert.equal(r.radiusM, 20);
  assert.equal(r.hit, 2);
  assert.equal(r.dps, 4);
  assert.equal(r.seconds, 4);
  assert.equal(r.total, 18);
  assert.equal(r.secondary, 'dot');
  assert.equal(r.color, 0xc06ae0);
});

test('shadow: 30 m, 3 hit, no DoT, gloom drives haze to full 0.30', () => {
  const r = ELEMENT_AURA.shadow;
  assert.equal(r.radiusM, 30);
  assert.equal(r.hit, 3);
  assert.equal(r.dps, 0);
  assert.equal(r.seconds, 0);
  assert.equal(r.total, 3);
  assert.equal(r.secondary, 'gloom');
  assert.equal(r.gloomOpacity, SHADOW_GLOOM_OPACITY);
  assert.equal(SHADOW_GLOOM_OPACITY, 0.30);
  assert.equal(r.color, 0x555560);
});

test('sand: 26 m, 3 hit, no DoT, sand veil 2 s', () => {
  const r = ELEMENT_AURA.sand;
  assert.equal(r.radiusM, 26);
  assert.equal(r.hit, 3);
  assert.equal(r.dps, 0);
  assert.equal(r.total, 3);
  assert.equal(r.secondary, 'veil');
  assert.equal(r.veilSeconds, SAND_VEIL_SECONDS);
  assert.equal(SAND_VEIL_SECONDS, 2);
  assert.equal(r.color, 0xe8c87a);
});

test('frost: 16 m, 2 hit, no DoT, chill speed x0.7 for 3 s — row exists though 1 is placed live', () => {
  const r = ELEMENT_AURA.frost;
  assert.equal(r.radiusM, 16);
  assert.equal(r.hit, 2);
  assert.equal(r.dps, 0);
  assert.equal(r.total, 2);
  assert.equal(r.secondary, 'chill');
  assert.equal(r.chillFactor, FROST_CHILL_FACTOR);
  assert.equal(FROST_CHILL_FACTOR, 0.7);
  assert.equal(r.chillSeconds, FROST_CHILL_SECONDS);
  assert.equal(FROST_CHILL_SECONDS, 3);
  assert.equal(r.color, 0x9fd8e8);
});

test('auraForElement: unknown element never fires, no target still returns the row', () => {
  assert.equal(auraForElement('unknown-element', { x: 0, z: 0 }, { x: 0, z: 0 }), null);
  assert.equal(auraForElement(null, { x: 0, z: 0 }, { x: 0, z: 0 }), null);
  const a = auraForElement('fire', { x: 0, z: 0 }, null);
  assert.equal(a.radiusM, 24);
  assert.equal(a.targetInRange, false);
  assert.equal(a.distanceM, null, 'no target known — the aura still exists');
});

test('guards: mounted never fires, dead / inactive / exempt / Haven never fire', () => {
  const base = { id: 'm-1', element: 'fire', x: 0, z: 0 };
  assert.equal(auraSourceAllowed(base), true);
  assert.equal(auraSourceAllowed({ ...base, mounted: true }), false, 'mounted never emanates');
  assert.equal(auraSourceAllowed({ ...base, dead: true }), false, 'dead emits nothing');
  assert.equal(auraSourceAllowed({ ...base, active: false }), false, 'inactive emits nothing');
  assert.equal(auraSourceAllowed(base, { inBase: true }), false, 'The Haven suppresses every aura');
  assert.equal(auraSourceAllowed(null), false);
  // Korus and Ghorrum are exempt by construction.
  assert.equal(isExemptSource({ type: 'korus' }), true);
  assert.equal(isExemptSource({ kind: 'boss' }), true);
  assert.equal(isExemptSource({ kind: 'watcher' }), true);
  assert.equal(isExemptSource({ watcher: true }), true);
  assert.equal(isExemptSource(base), false);
  assert.equal(auraSourceAllowed({ ...base, type: 'korus' }), false, 'Korus never auras');
  assert.equal(auraSourceAllowed({ ...base, kind: 'watcher' }), false, 'Ghorrum never auras');
  assert.equal(
    auraForElement('fire', { x: 0, z: 0 }, { x: 0, z: -5 }, { source: { ...base, mounted: true } }),
    null, 'guard refuses through auraForElement too',
  );
});

test('cadence: one streak per 1.5 s per source, shared by all seven elements', () => {
  assert.equal(STRIKE_INTERVAL_S, 1.5);
  assert.equal(elementalStrikeDue(null, 1000), true, 'first strike always due');
  assert.equal(elementalStrikeDue(1000, 1000), false);
  assert.equal(elementalStrikeDue(1000, 2499), false, 'no double-strike inside the window');
  assert.equal(elementalStrikeDue(1000, 2500), true, 'fires again once 1.5 s have passed');
});

test('applyElementalStrike + elementalTick: hit, DoT, and secondary run their course', () => {
  const v = createElementalVictimState(100);
  const struck = applyElementalStrike(v, 'fire', 1000);
  assert.equal(v.hp, 100, 'does not mutate the victim');
  assert.equal(struck.hp, 96, '4 on the hit');
  assert.equal(struck.dotDps, 4);
  assert.equal(struck.dotRemainingS, 3);
  assert.equal(struck.secondary, 'burn');
  const after = elementalTick(struck, 3);
  assert.equal(after.hp, 84, '4 hit + 4/s x 3 s = 16 total');
  assert.equal(after.dotRemainingS, 0);
  assert.equal(after.dotDps, 0);
  // Acid: pool secondary rides the strike.
  const acid = applyElementalStrike(createElementalVictimState(100), 'acid', 1000);
  assert.equal(acid.hp, 97);
  assert.equal(acid.dotDps, 3);
  assert.equal(acid.secondary, 'pool');
  assert.equal(acid.secondaryRemainingS, 4);
  assert.equal(elementalTick(acid, 4).hp, 85, '3 hit + 3/s x 4 s = 15 total');
  // Frost: chill slows the walker, then releases.
  const frost = applyElementalStrike(createElementalVictimState(100), 'frost', 1000);
  assert.equal(frost.hp, 98);
  assert.equal(frost.secondary, 'chill');
  assert.equal(frost.speedFactor, 0.7);
  assert.equal(elementalTick(frost, 3).speedFactor, 1, 'chill releases after 3 s');
  // Poison totals 18; shadow/sand deal their hit with no DoT.
  assert.equal(applyElementalStrike(createElementalVictimState(100), 'poison', 1000).hp, 98);
  assert.equal(elementalTick(applyElementalStrike(createElementalVictimState(100), 'poison', 1000), 4).hp, 82);
  assert.equal(applyElementalStrike(createElementalVictimState(100), 'shadow', 1000).hp, 97);
  assert.equal(applyElementalStrike(createElementalVictimState(100), 'sand', 1000).hp, 97);
  // Unknown element never fires; dead victims stay dead.
  assert.deepEqual(applyElementalStrike(createElementalVictimState(100), 'unknown', 1000), createElementalVictimState(100));
  const dead = { ...createElementalVictimState(100), hp: 0, dead: true };
  assert.equal(applyElementalStrike(dead, 'fire', 1000), dead);
  assert.equal(elementalTick(dead, 1), dead);
});
