// tests/dino-companion-xp.test.mjs
// COMPANION DINO XP + LEVELS + SAVAGERY (Merlin, 2026-11-26):
// hunting earns XP, XP levels the dino up, higher level = more
// savage. The numbers are pinned here — the curve, the table,
// and the persistence on the backpack record.
//
// Run: node --test tests/dino-companion-xp.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DINO_LEVEL,
  XP_KILL,
  XP_PER_HIT,
  XP_ASSIST,
  XP_TO_MAX_LEVEL,
  xpToNextLevel,
  xpForLevelStart,
  levelForXp,
  aggressionForLevel,
  statsForLevel,
  SAVAGERY_TABLE,
  ATTACK_RANGE,
  pickAttack,
  xpOf,
  levelOf,
  awardXp,
  xpForKill,
  setDinoXp,
  withDinoXp,
} from '../lib/dino-xp.js';
import { makeDinoItem } from '../lib/earth2/breeding.js';

describe('the XP curve', () => {
  it('level 1 -> 2 costs 100 XP, level 9 -> 10 costs 500', () => {
    assert.equal(xpToNextLevel(1), 100);
    assert.equal(xpToNextLevel(2), 150);
    assert.equal(xpToNextLevel(5), 300);
    assert.equal(xpToNextLevel(9), 500);
    assert.equal(xpToNextLevel(10), null);
    assert.equal(xpToNextLevel(99), null);
  });

  it('level starts are cumulative: L2 at 100, max at 2,700', () => {
    assert.equal(xpForLevelStart(1), 0);
    assert.equal(xpForLevelStart(2), 100);
    assert.equal(xpForLevelStart(3), 250);
    assert.equal(xpForLevelStart(10), 2700);
    assert.equal(XP_TO_MAX_LEVEL, 2700);
  });

  it('levelForXp inverts the curve at the boundaries', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(99), 1);
    assert.equal(levelForXp(100), 2);
    assert.equal(levelForXp(249), 2);
    assert.equal(levelForXp(250), 3);
    assert.equal(levelForXp(2699), 9);
    assert.equal(levelForXp(2700), 10);
    assert.equal(levelForXp(99999), 10);
  });

  it('awardXp levels up, jumps multiple levels, and clamps at max', () => {
    assert.deepEqual(awardXp({ xp: 0, level: 1 }, 20), { xp: 20, level: 1, leveledUp: false, levelsGained: 0 });
    assert.deepEqual(awardXp({ xp: 90, level: 1 }, 20), { xp: 110, level: 2, leveledUp: true, levelsGained: 1 });
    const jump = awardXp({ xp: 0, level: 1 }, 700);
    assert.equal(jump.level, 5);
    assert.equal(jump.levelsGained, 4);
    assert.equal(jump.leveledUp, true);
    const maxed = awardXp({ xp: 2600, level: 9 }, 500);
    assert.deepEqual(maxed, { xp: 2700, level: 10, leveledUp: true, levelsGained: 1 });
    assert.deepEqual(awardXp({ xp: 2700, level: 10 }, 100), { xp: 2700, level: 10, leveledUp: false, levelsGained: 0 });
    assert.deepEqual(awardXp({ xp: 0, level: 1 }, -5), { xp: 0, level: 1, leveledUp: false, levelsGained: 0 });
  });
});

describe('XP per kill / hit / assist', () => {
  it('warrior 20, captain 50, Saruman 100', () => {
    assert.equal(XP_KILL.warrior, 20);
    assert.equal(XP_KILL.captain, 50);
    assert.equal(XP_KILL.boss, 100);
    assert.equal(xpForKill('warrior'), 20);
    assert.equal(xpForKill('captain'), 50);
    assert.equal(xpForKill('boss'), 100);
    assert.equal(xpForKill('something-else'), 20);
  });

  it('a hit pays 2, an assist pays 5', () => {
    assert.equal(XP_PER_HIT, 2);
    assert.equal(XP_ASSIST, 5);
  });

  it('2,700 XP to max is ~135 warrior kills', () => {
    assert.equal(Math.ceil(XP_TO_MAX_LEVEL / XP_KILL.warrior), 135);
  });
});

describe('savagery: higher level = more savage', () => {
  it('aggression steps defensive -> opportunistic -> savage', () => {
    assert.equal(aggressionForLevel(1), 'defensive');
    assert.equal(aggressionForLevel(2), 'defensive');
    assert.equal(aggressionForLevel(3), 'opportunistic');
    assert.equal(aggressionForLevel(5), 'opportunistic');
    assert.equal(aggressionForLevel(6), 'savage');
    assert.equal(aggressionForLevel(10), 'savage');
  });

  it('the table is strictly more savage at every level', () => {
    assert.equal(SAVAGERY_TABLE.length, MAX_DINO_LEVEL);
    for (let i = 1; i < SAVAGERY_TABLE.length; i++) {
      const a = SAVAGERY_TABLE[i - 1];
      const b = SAVAGERY_TABLE[i];
      assert.ok(b.damage > a.damage, `L${i + 1} hits harder`);
      assert.ok(b.cooldown < a.cooldown, `L${i + 1} attacks faster`);
      assert.ok(b.chaseRange > a.chaseRange, `L${i + 1} chases further`);
      assert.ok(b.moveSpeed > a.moveSpeed, `L${i + 1} runs faster`);
    }
  });

  it('level 1: 6 dmg, 1.6 s, 12 m chase, 5.0 m/s', () => {
    assert.deepEqual(statsForLevel(1, 'adult'), {
      level: 1, damage: 6, cooldown: 1.6, chaseRange: 12, moveSpeed: 5, aggression: 'defensive',
    });
  });

  it('level 5: 22 dmg, 1.2 s, 20 m chase, 6.2 m/s', () => {
    assert.deepEqual(statsForLevel(5, 'adult'), {
      level: 5, damage: 22, cooldown: 1.2, chaseRange: 20, moveSpeed: 6.2, aggression: 'opportunistic',
    });
  });

  it('level 10: 42 dmg, 0.7 s, 30 m chase, 7.7 m/s', () => {
    assert.deepEqual(statsForLevel(10, 'adult'), {
      level: 10, damage: 42, cooldown: 0.7, chaseRange: 30, moveSpeed: 7.7, aggression: 'savage',
    });
  });

  it('sane against the world: L1 needs 10 bites for a warrior, L10 needs 4 for a captain and 15 for Saruman', () => {
    assert.equal(Math.ceil(60 / statsForLevel(1).damage), 10);
    assert.equal(Math.ceil(150 / statsForLevel(10).damage), 4);
    assert.equal(Math.ceil(600 / statsForLevel(10).damage), 15);
    assert.ok(statsForLevel(1).damage < 60, 'a level-1 dino never one-shots a warrior');
    assert.ok(statsForLevel(10).damage < 150, 'even a maxed dino never one-shots a captain');
  });

  it('growth tempers savagery: a baby hits softer and runs slower', () => {
    assert.equal(statsForLevel(1, 'baby').damage, 4);
    assert.equal(statsForLevel(1, 'baby').moveSpeed, 3.5);
    assert.equal(statsForLevel(10, 'baby').damage, 25);
    assert.ok(statsForLevel(10, 'baby').damage > statsForLevel(1, 'adult').damage, 'a maxed baby still out-hits a level-1 adult — level wins over size');
    assert.equal(statsForLevel(1, 'juvenile').damage, 5);
  });
});

describe('attack picks', () => {
  it('carnivore up close bites, a crowd earns a tail swipe, far ground is a charge', () => {
    assert.equal(pickAttack({ diet: 'carnivore', posture: 'biped', dist: 1.5, nearby: 0 }), 'bite');
    assert.equal(pickAttack({ diet: 'carnivore', posture: 'biped', dist: 2.0, nearby: 2 }), 'tail');
    assert.equal(pickAttack({ diet: 'carnivore', posture: 'biped', dist: 5, nearby: 0 }), 'charge');
    assert.equal(pickAttack({ diet: 'carnivore', posture: 'biped', dist: 9, nearby: 0 }), null);
    assert.equal(ATTACK_RANGE.bite, 2.2);
    assert.equal(ATTACK_RANGE.tail, 3.5);
    assert.equal(ATTACK_RANGE.stomp, 2.5);
    assert.equal(ATTACK_RANGE.charge, 8);
  });

  it('herbivores stomp — quadruped or biped — and tail-swipe a crowd too', () => {
    assert.equal(pickAttack({ diet: 'herbivore', posture: 'quadruped', dist: 2.0, nearby: 0 }), 'stomp');
    assert.equal(pickAttack({ diet: 'herbivore', posture: 'biped', dist: 2.0, nearby: 0 }), 'stomp');
    assert.equal(pickAttack({ diet: 'herbivore', posture: 'quadruped', dist: 3.0, nearby: 3 }), 'tail');
    assert.equal(pickAttack({ diet: 'herbivore', posture: 'quadruped', dist: 6, nearby: 0 }), 'charge');
  });
});

describe('XP persists on the backpack record', () => {
  const item = () => makeDinoItem('triceratops', Date.now() - 1000);

  it('a record predating XP reads 0 XP, level 1', () => {
    const it = item();
    assert.equal(xpOf(it), 0);
    assert.equal(levelOf(it), 1);
    assert.equal(it.meta.xp, undefined);
  });

  it('level derives from XP when no level was stored', () => {
    const it = item();
    it.meta.xp = 700;
    assert.equal(levelOf(it), 5);
  });

  it('withDinoXp adds XP and levels the record, pure (the old list is untouched)', () => {
    const items = [item()];
    const missed = withDinoXp(items, 'dino-no-such', 0);
    assert.equal(missed.result, null);
    const { items: after, result: gained } = withDinoXp(items, items[0].meta.dinoId, 120);
    assert.equal(gained.xp, 120);
    assert.equal(gained.level, 2);
    assert.equal(gained.leveledUp, true);
    assert.equal(xpOf(after[0]), 120);
    assert.equal(levelOf(after[0]), 2);
    assert.equal(xpOf(items[0]), 0, 'the input list is not mutated');
  });

  it('setDinoXp writes an exact total (the handle already did the maths)', () => {
    const items = [item()];
    const id = items[0].meta.dinoId;
    const next = setDinoXp(items, id, 2700, 10);
    assert.equal(xpOf(next[0]), 2700);
    assert.equal(levelOf(next[0]), 10);
    assert.equal(items[0].meta.xp, undefined, 'the input list is not mutated');
  });

  it('other dinos in the pack are untouched', () => {
    const a = item();
    const b = makeDinoItem('velociraptor', Date.now() - 2000);
    const { items: next } = withDinoXp([a, b], a.meta.dinoId, 50);
    assert.equal(xpOf(next[0]), 50);
    assert.equal(xpOf(next[1]), 0);
  });
});
