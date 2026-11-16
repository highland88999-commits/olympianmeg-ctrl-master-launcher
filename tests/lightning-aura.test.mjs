// tests/lightning-aura.test.mjs — the shared lightning-aura law
// (Merlin, Nov 16 ~00:02 Jupiter 2; Nov 16 ~00:11 MonsterVerse).
// Radius 59 m exact, colours per kind, burn numbers, strike
// cadence, victim states. Pure logic — no DOM, no THREE.
// Run: node --test tests/lightning-aura.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AURA_R_M, BURN_HIT_DMG, BURN_DPS, BURN_SECONDS, STRIKE_INTERVAL_S,
  WALKER_MAX_HP, MONSTER_PREY_HP, LIGHTNING_COLORS,
  lightningColorFor, isLightningSource, auraDistance, auraFor,
  strikeDue, createVictimState, applyStrike, burnTick,
} from '../lib/lightning-aura.js';

describe('the aura law', () => {
  it('the radius is 59 m exactly — Merlin’s number', () => {
    assert.equal(AURA_R_M, 59);
    const aura = auraFor('lightning-monster', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    assert.equal(aura.radiusM, 59);
  });
  it('colours are Merlin’s: white-yellow lightning monsters, red dragons, yellow demobats', () => {
    assert.equal(LIGHTNING_COLORS['lightning-monster'].label, 'white-yellow');
    assert.equal(LIGHTNING_COLORS.dragon.label, 'red');
    assert.equal(LIGHTNING_COLORS.demobat.label, 'yellow');
    assert.equal(lightningColorFor('lightning-monster').core, '#fffbe0');
    assert.equal(lightningColorFor('dragon').core, '#ff6a5a');
    assert.equal(lightningColorFor('demobat').core, '#fff9c4');
    assert.equal(lightningColorFor('lightning-monster').glow, '#ffe14d');
    assert.equal(lightningColorFor('dragon').glow, '#ff1e1e');
    assert.equal(lightningColorFor('demobat').glow, '#ffe14d');
  });
  it('only the three kinds are lightning sources', () => {
    for (const kind of ['lightning-monster', 'dragon', 'demobat']) {
      assert.equal(isLightningSource(kind), true, kind);
    }
    assert.equal(isLightningSource('fire'), false);
    assert.equal(isLightningSource('shadow'), false);
    assert.equal(isLightningSource(null), false);
    assert.equal(auraFor('fire', { x: 0, y: 0, z: 0 }), null);
  });
  it('a target inside 59 m is in range; outside is not (boundary inclusive)', () => {
    const hunter = { x: 0, y: 0, z: 0 };
    assert.equal(auraFor('dragon', hunter, { x: 59, y: 0, z: 0 }).targetInRange, true);
    assert.equal(auraFor('dragon', hunter, { x: 59.01, y: 0, z: 0 }).targetInRange, false);
    assert.equal(auraFor('dragon', hunter, { x: 0, y: 0, z: 30 }).targetInRange, true);
    assert.equal(auraFor('dragon', hunter, { x: 0, y: 0, z: -58.9 }).targetInRange, true);
    const far = auraFor('demobat', hunter, { x: 100, y: 0, z: 0 });
    assert.equal(far.targetInRange, false);
    assert.equal(far.distanceM, 100);
  });
  it('the aura exists even with no target known — it simply has nothing to strike', () => {
    const aura = auraFor('lightning-monster', { x: 0, y: 0, z: 0 });
    assert.equal(aura.active, true);
    assert.equal(aura.targetInRange, false);
    assert.equal(aura.distanceM, null);
  });
  it('distance is 3D', () => {
    assert.equal(auraDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  });
});

describe('burn damage', () => {
  it('the numbers are the worker’s call, pinned: 8 on the hit, 6/s for 3 s', () => {
    assert.equal(BURN_HIT_DMG, 8);
    assert.equal(BURN_DPS, 6);
    assert.equal(BURN_SECONDS, 3);
    assert.equal(WALKER_MAX_HP, 100);
    assert.equal(MONSTER_PREY_HP, 100);
  });
  it('a streak lands 8 and lights the burn', () => {
    const v = applyStrike(createVictimState(100), 1000);
    assert.equal(v.hp, 92);
    assert.equal(v.burnDps, 6);
    assert.equal(v.burnRemainingS, 3);
    assert.equal(v.lastStrikeMs, 1000);
    assert.equal(v.dead, false);
  });
  it('the burn eats 6/s and goes out after 3 s (26 total per streak)', () => {
    let v = applyStrike(createVictimState(100), 0);
    v = burnTick(v, 1);
    assert.equal(v.hp, 86);
    assert.equal(v.burnRemainingS, 2);
    v = burnTick(v, 2);
    assert.equal(v.hp, 74);
    assert.equal(v.burnRemainingS, 0);
    assert.equal(v.burnDps, 0);
    const after = burnTick(v, 1);
    assert.equal(after.hp, 74, 'a spent burn takes nothing further');
  });
  it('a second streak re-lights the burn (it does not stack the rate)', () => {
    let v = applyStrike(createVictimState(100), 0);
    v = burnTick(v, 2);
    assert.equal(v.hp, 80);
    v = applyStrike(v, 2000);
    assert.equal(v.hp, 72);
    assert.equal(v.burnDps, 6);
    assert.equal(v.burnRemainingS, 3);
  });
  it('four streaks kill a stationary walker (100 HP, 26 per streak)', () => {
    let v = createVictimState(100);
    for (let i = 0; i < 3; i++) {
      v = applyStrike(v, i * 2000);
      v = burnTick(v, 3);
    }
    assert.equal(v.hp, 22);
    assert.equal(v.dead, false);
    v = applyStrike(v, 8000);
    assert.equal(v.hp, 14);
    v = burnTick(v, 3);
    assert.equal(v.hp, 0);
    assert.equal(v.dead, true);
    const dead = applyStrike(v, 12000);
    assert.equal(dead, v, 'a dead victim stays dead');
  });
  it('a strike never takes HP below zero', () => {
    const v = applyStrike(createVictimState(5), 0);
    assert.equal(v.hp, 0);
    assert.equal(v.dead, true);
  });
});

describe('strike cadence', () => {
  it('a streak fires at most once per 1.5 s at one target', () => {
    assert.equal(STRIKE_INTERVAL_S, 1.5);
    assert.equal(strikeDue(null, 1000), true);
    assert.equal(strikeDue(1000, 1000), false);
    assert.equal(strikeDue(1000, 2499), false);
    assert.equal(strikeDue(1000, 2500), true);
  });
});
