// tests/j2-oblivion.test.mjs — Jupiter 2 oblivion canon
// (Merlin, Nov 19 ~00:16, overwrites all previous oblivion rules
// where they conflict; guard refinements Nov 19 ~00:20–00:24).
// The cycle phase math, the dragon-shield tier math, the guard
// dragons (stationed at the cave mouth, never dueling each other,
// reborn 5 min after a kill), and the cave-flush sink.
// Run: node --test tests/j2-oblivion.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OBLIVION_WAIT_MS } from '../lib/earth/oblivion.js';
import {
  cycleState, earthTravelBlocked,
  dragonShieldTierFor, dragonShieldChargesFor, isDragonShieldDragon,
  DRAGON_SHIELD_DRAGONS,
} from '../lib/oblivion/state.js';
import {
  GUARD_RESPAWN_MS, GUARD_PATROL_RADIUS_M,
  isGuardDragon, isGuardDragonSlot, dragonShieldKeyFor,
  guardHomeDeck, guardRebirthDue,
} from '../lib/jupiter2/guard.js';
import { MOUNTAIN_SINK_M, dirAt, dirToDeck } from '../lib/jupiter2/planet.js';
import { groundHeight } from '../lib/jupiter2/profile.js';
import { huntFor, nearestMonsterPrey, isGuardDragonSlot as opIsGuardSlot } from '../lib/jupiter2/operators.js';
import { confirmOblivion, createLeverState, pullLever } from '../lib/jupiter2/lever.js';

describe('oblivion cycle', () => {
  it('is 72 hours, exactly', () => {
    assert.equal(OBLIVION_WAIT_MS, 72 * 60 * 60 * 1000);
  });

  it('not armed reads as nothing happening', () => {
    const s = cycleState({ armed: false, endsAtMs: null, nowMs: 1000 });
    assert.deepEqual(s, { armed: false, active: false, complete: false, remainingMs: 0 });
    assert.equal(earthTravelBlocked({ armed: false, endsAtMs: null, nowMs: 1000 }), false);
  });

  it('armed and inside the window is active with the time left', () => {
    const endsAt = 1_000_000 + OBLIVION_WAIT_MS;
    const s = cycleState({ armed: true, endsAtMs: endsAt, nowMs: 1_000_000 });
    assert.equal(s.armed, true);
    assert.equal(s.active, true);
    assert.equal(s.complete, false);
    assert.equal(s.remainingMs, OBLIVION_WAIT_MS);
    assert.equal(earthTravelBlocked({ armed: true, endsAtMs: endsAt, nowMs: 1_000_000 }), true);
  });

  it('at and past the end the cycle is complete and Earth is back', () => {
    const endsAt = 1_000_000 + OBLIVION_WAIT_MS;
    for (const now of [endsAt, endsAt + 60_000]) {
      const s = cycleState({ armed: true, endsAtMs: endsAt, nowMs: now });
      assert.equal(s.complete, true);
      assert.equal(s.active, false);
      assert.equal(s.remainingMs, 0);
      assert.equal(earthTravelBlocked({ armed: true, endsAtMs: endsAt, nowMs: now }), false);
    }
  });
});

describe('dragon shield', () => {
  it('one dragon is tier 1, both stack to tier 2', () => {
    assert.equal(dragonShieldTierFor([]), 0);
    assert.equal(dragonShieldTierFor(['stormwing']), 1);
    assert.equal(dragonShieldTierFor(['aureline']), 1);
    assert.equal(dragonShieldTierFor(['stormwing', 'aureline']), 2);
  });

  it('repeat kills of the same dragon never stack', () => {
    assert.equal(dragonShieldTierFor(['stormwing', 'stormwing']), 1);
    assert.equal(dragonShieldTierFor(['stormwing', 'aureline', 'stormwing']), 2);
  });

  it('unknown keys never count', () => {
    assert.equal(dragonShieldTierFor(['volta', 'bogus']), 0);
    assert.equal(isDragonShieldDragon('stormwing'), true);
    assert.equal(isDragonShieldDragon('volta'), false);
    assert.deepEqual([...DRAGON_SHIELD_DRAGONS].sort(), ['aureline', 'stormwing']);
  });

  it('charges equal the tier, capped at 2', () => {
    assert.equal(dragonShieldChargesFor(0), 0);
    assert.equal(dragonShieldChargesFor(1), 1);
    assert.equal(dragonShieldChargesFor(2), 2);
    assert.equal(dragonShieldChargesFor(9), 2);
  });
});

describe('guard dragons', () => {
  it('Stormwing is sky-dragon, Aureline is aureline', () => {
    assert.equal(isGuardDragon('sky-dragon'), true);
    assert.equal(isGuardDragon('aureline'), true);
    assert.equal(isGuardDragon('demobats'), false);
    assert.equal(dragonShieldKeyFor('sky-dragon'), 'stormwing');
    assert.equal(dragonShieldKeyFor('aureline'), 'aureline');
    assert.equal(dragonShieldKeyFor('volta'), null);
  });

  it('guard slots are the lightning-roster seats 3 and 4', () => {
    assert.equal(isGuardDragonSlot('lightning-monster', 3), true);
    assert.equal(isGuardDragonSlot('lightning-monster', 4), true);
    assert.equal(isGuardDragonSlot('lightning-monster', 0), false);
    assert.equal(isGuardDragonSlot('demobat', 3), false);
    assert.equal(opIsGuardSlot('lightning-monster', 3), true);
  });

  it('the guards stand at the cave mouth (deck 0, −110)', () => {
    const home = guardHomeDeck();
    assert.equal(Math.round(home.x), 0);
    assert.equal(Math.round(home.z), -110);
    assert.ok(GUARD_PATROL_RADIUS_M > 0 && GUARD_PATROL_RADIUS_M <= 10);
  });

  it('a killed guard is reborn after 5 minutes, not 30 days', () => {
    assert.equal(GUARD_RESPAWN_MS, 5 * 60 * 1000);
    const entry = { dead: true, guardRebornAtMs: 10_000 + GUARD_RESPAWN_MS };
    assert.equal(guardRebirthDue(entry, 10_000), false);
    assert.equal(guardRebirthDue(entry, 10_000 + GUARD_RESPAWN_MS - 1), false);
    assert.equal(guardRebirthDue(entry, 10_000 + GUARD_RESPAWN_MS), true);
    assert.equal(guardRebirthDue({ dead: false, guardRebornAtMs: 1 }, 999999), false);
    assert.equal(guardRebirthDue({ dead: true }, 999999), false);
  });

  it('the guard pair never duels each other, but duels a non-guard rival', () => {
    const now = Date.now();
    const self = { x: 0, y: 74, z: -110 };
    const otherGuard = { id: 'lightning-monster_4', kind: 'lightning-monster', index: 4, x: 2, y: 74, z: -108, alive: true, heightM: 6, diving: false };
    const rival = { id: 'lightning-monster_0', kind: 'lightning-monster', index: 0, x: 2, y: 74, z: -108, alive: true, heightM: 5, diving: false };
    const pair = huntFor('lightning-monster', 3, now, { ...self, walker: null, others: [otherGuard] });
    assert.notEqual(pair.mode, 'duel');
    const duel = huntFor('lightning-monster', 3, now, { ...self, walker: null, others: [rival] });
    assert.equal(duel.mode, 'duel');
  });

  it('the guard pair never preys on each other', () => {
    const self = { x: 0, y: 74, z: -110 };
    const otherGuard = { id: 'lightning-monster_4', kind: 'lightning-monster', index: 4, x: 2, y: 74, z: -108, alive: true, heightM: 6, diving: false };
    const prey = nearestMonsterPrey('lightning-monster', 3, self, [otherGuard]);
    assert.equal(prey, null);
  });
});

describe('cave flush', () => {
  it('the sink buries the mountain base below the lowest terrain point in its footprint', () => {
    const centre = dirToDeck(dirAt(1.45, 0));
    const centreH = groundHeight(centre.x, centre.z);
    let minH = Infinity;
    for (let x = -22; x <= 22; x += 2) {
      for (let z = -150; z <= -106; z += 2) {
        minH = Math.min(minH, groundHeight(x, z));
      }
    }
    const worstDip = centreH - minH;
    assert.ok(worstDip > 0.5, `expected a real dip, got ${worstDip}`);
    assert.ok(MOUNTAIN_SINK_M >= worstDip + 0.25,
      `sink ${MOUNTAIN_SINK_M} must cover worst dip ${worstDip.toFixed(3)} + 0.25 margin`);
    assert.ok(MOUNTAIN_SINK_M <= 1.5, 'the sink must not swallow the cave interior');
  });
});

describe('lever lock', () => {
  it('an armed lever cannot be re-armed', () => {
    const lv = createLeverState();
    pullLever(lv, 1000);
    const rec = confirmOblivion(lv, 1000);
    assert.equal(rec.armed, true);
    const again = confirmOblivion(lv, 2000);
    assert.equal(again.armed, false);
    assert.equal(again.armedAtMs, 1000);
  });
});
