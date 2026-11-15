// tests/middle-earth-operators.test.mjs
// MIDDLE-EARTH — OPERATOR AGENTS (Merlin, Nov 14 ~22:56 /
// behaviour logic Nov 14 ~22:59): orcs die by combat only and
// refill on the pod respawn clock; Saruman dies once, by
// combat, completing the campaign; placed creatures never die;
// orcs hunt the user but never fight each other (war-band);
// user death cuts the heat (no corpse fight); the population
// rule holds for orcs and is fixed for placed creatures.
//
// Run: node --test tests/middle-earth-operators.test.mjs (repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PODS, POD_ORDER, SARUMAN_GATE_KILLS } from '../app/middle-earth/data.js';
import {
  createOrc,
  damageOrc,
  RESPAWN_MIN_DIST,
} from '../app/middle-earth/orcs.js';
import { createSaruman, damageBoss } from '../app/middle-earth/boss.js';
import { createHunt, cutHeat, stepHunt } from '../app/middle-earth/hunt.js';
import { completeSaruman } from '../app/middle-earth/campaign.js';
import {
  growthStage,
  canHatchMore,
} from '../lib/earth2/breeding.js';
import {
  MIN_WARRIORS_PER_POD,
  MIN_CAPTAINS_REALM,
  MIN_CAPTAIN_PODS,
  PLACED_SPREAD_MIN_M,
  orcLifeFor,
  orcPopulation,
  orcPopulationAll,
  bossLifeFor,
  placedCreatures,
  placedCreatureLifeFor,
  placedCreatureExtras,
  lifeFor,
  enrichCreatures,
  huntHeatLine,
} from '../app/middle-earth/operators.js';

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const rng = () => 0.5;

describe('deterministic life', () => {
  it('same orc + time = same state on two calls', () => {
    const orc = createOrc({ id: 1, x: 10, z: 20, kind: 'warrior', campId: 0, rove: false }, 0);
    const a = lifeFor(orc, T0);
    const b = lifeFor(orc, T0);
    assert.deepEqual(a, b);
    assert.equal(a.realm, 'middle-earth');
    assert.equal(a.state, 'alive');
    assert.equal(a.hp, 60);
  });

  it('enrichCreatures adds life without dropping records', () => {
    const list = [
      { kind: 'orc', x: 0, z: 0, hp: 60, maxHp: 60, state: 'idle' },
      { kind: 'boss', x: -207, z: 168, hp: 600, maxHp: 600, state: 'dormant' },
      { kind: 'placed', name: 'A Great Eagle', model: 'eagle', pod: 'rivendell' },
    ];
    const out = enrichCreatures(list, T0, { totalKills: 0 });
    assert.equal(out.length, 3);
    for (const c of out) assert.ok(c.life && typeof c.life.line === 'string');
  });
});

describe('death law — combat only', () => {
  it('orcs do not age: an idle orc far in the future is still alive', () => {
    const orc = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    const life = lifeFor(orc, T0 + 100 * 365.25 * 86400000);
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
  });

  it('a killed orc records combat death + the pod respawn clock + the 65 m rule', () => {
    const orc = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    const loot = damageOrc(orc, 200, rng);
    assert.ok(Array.isArray(loot));
    assert.equal(orc.state, 'dead');
    const life = orcLifeFor(orc, T0, { deadAt: 1000, respawnS: 60 });
    assert.equal(life.state, 'dead');
    assert.equal(life.deathCause, 'combat');
    assert.equal(life.respawnAt, 1060);
    assert.equal(life.respawnNeedsDistanceM, RESPAWN_MIN_DIST);
    assert.equal(RESPAWN_MIN_DIST, 65);
  });

  it('Saruman dies once, by combat — death completes the campaign, permanently', () => {
    const boss = createSaruman(undefined, undefined, true);
    assert.equal(boss.state, 'ready');
    const evs = damageBoss({ ...boss, state: 'combat', hp: 600 }, 600);
    assert.ok(evs.some((e) => e.type === 'died'));
    const dead = { ...boss, state: 'dead', hp: 0 };
    const life = bossLifeFor(dead, T0, { totalKills: 30 });
    assert.equal(life.state, 'dead');
    assert.equal(life.deathCause, 'combat');
    assert.equal(life.line, 'Remains — Saruman — the campaign is complete');
    // The campaign record agrees: dead is terminal.
    const c = completeSaruman({ saruman: 'open', totalKills: 30 }, T0);
    assert.equal(c.saruman, 'dead');
    assert.equal(completeSaruman(c, T0).saruman, 'dead');
  });

  it('the boss gate is 30 kills; dormant Saruman cannot be fought', () => {
    const locked = bossLifeFor(createSaruman(undefined, undefined, false), T0, { totalKills: 0 });
    assert.equal(locked.state, 'dormant');
    assert.equal(locked.gateOpen, false);
    assert.equal(locked.gateKills, SARUMAN_GATE_KILLS);
    assert.equal(SARUMAN_GATE_KILLS, 30);
    const open = bossLifeFor(createSaruman(undefined, undefined, true), T0, { totalKills: 30 });
    assert.equal(open.gateOpen, true);
  });

  it('placed creatures never die: no death path exists for them', () => {
    for (const podId of POD_ORDER) {
      for (const def of placedCreatures(podId)) {
        const life = placedCreatureLifeFor(def, T0 + 100 * 365.25 * 86400000);
        assert.equal(life.state, 'alive');
        assert.equal(life.deathCause, null);
      }
    }
  });
});

describe('user-hunt branch (applies) vs corpse fight (does not)', () => {
  it('a chasing orc hunts the user; an idle orc patrols', () => {
    const chase = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    chase.state = 'chase';
    assert.equal(lifeFor(chase, T0).feeding, 'hunt-user');
    const idle = createOrc({ id: 2, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    assert.equal(lifeFor(idle, T0).feeding, 'patrol');
  });

  it('user death cuts the heat — the orcs lose the trail, they do not fight over a corpse', () => {
    const hunt = createHunt(80);
    const cut = cutHeat(hunt);
    assert.ok(cut < 80);
    assert.equal(hunt.lastKnown, null);
    // And the operators never report a corpse contest for orcs.
    const orc = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    assert.equal(lifeFor(orc, T0).territory, 'band');
    assert.equal(lifeFor(orc, T0).duel, null);
  });

  it('the hunt meter dispatches parties at the coded thresholds', () => {
    const hunt = createHunt(44);
    hunt.lastKnown = { x: 10, z: 10 };
    const evs = stepHunt(hunt, 0, false);
    assert.deepEqual(evs, []);
    hunt.heat = 45;
    const evs2 = stepHunt(hunt, 0, false);
    assert.equal(evs2[0].type, 'dispatch');
    assert.equal(evs2[0].size, 3);
    assert.match(huntHeatLine(45), /Hot|Warm/);
  });
});

describe('population rule (Merlin Nov 14 ~22:57)', () => {
  it('orcs already meet it: ≥ 2 warriors in every pod', () => {
    const all = orcPopulationAll(() => true);
    assert.equal(all.meetsWarriors, true);
    for (const podId of POD_ORDER) {
      assert.ok(all.perPod[podId].warriors >= MIN_WARRIORS_PER_POD, podId);
    }
  });

  it('captains: ≥ 2 realm-wide across ≥ 2 pods (the Shire has none — captainChance 0)', () => {
    const all = orcPopulationAll(() => true);
    assert.ok(all.captains >= MIN_CAPTAINS_REALM, `only ${all.captains} captains`);
    assert.ok(all.captainPods.length >= MIN_CAPTAIN_PODS, all.captainPods.join(','));
    assert.equal(all.perPod.shire.captains, 0);
    assert.equal(PODS.shire.orcs.captainChance, 0);
  });

  it('placed creatures fail it as coded: exactly one copy each', () => {
    const counts = {};
    for (const podId of POD_ORDER) {
      for (const c of placedCreatures(podId)) counts[c.id] = (counts[c.id] || 0) + 1;
    }
    assert.deepEqual(counts, { eagle: 1, horse: 1, warg: 1, 'fell-beast': 1, dragon: 1 });
  });

  it('placedCreatureExtras adds a second copy ≥ 100 m away in the same pod', () => {
    for (const podId of POD_ORDER) {
      const originals = placedCreatures(podId);
      const extras = placedCreatureExtras(podId);
      assert.equal(extras.length, originals.length);
      for (const e of extras) {
        assert.equal(e.operatorExtra, true);
        assert.equal(e.pod, podId);
        const orig = originals.find((o) => o.id === e.id.replace('-second', ''));
        const d = Math.hypot(e.x - orig.x, e.z - orig.z);
        assert.ok(d >= PLACED_SPREAD_MIN_M, `${e.id} only ${Math.round(d)} m away`);
      }
    }
  });

  it('orcPopulation is deterministic for a fixed tryPlace', () => {
    assert.deepEqual(orcPopulation('rohan', () => true), orcPopulation('rohan', () => true));
    assert.equal(orcPopulation('nope', () => true), null);
  });
});

describe('tap-card life line', () => {
  it('orc: name · patrol/hunt · band', () => {
    const orc = createOrc({ id: 1, x: 0, z: 0, kind: 'warrior', campId: 0, rove: false }, 0);
    assert.match(lifeFor(orc, T0).line, /Orc Warrior · Patrolling · Band of 3/);
    const cap = createOrc({ id: 2, x: 0, z: 0, kind: 'captain', campId: 0, rove: false }, 0);
    assert.match(lifeFor(cap, T0).line, /Captain/);
  });

  it('boss: dormant line names the gate; placed: ambient line', () => {
    assert.match(bossLifeFor(createSaruman(undefined, undefined, false), T0, { totalKills: 0 }).line, /Dormant · gate opens at 30 orc kills/);
    const eagle = placedCreatures('rivendell')[0];
    assert.match(placedCreatureLifeFor(eagle, T0).line, /Ambient · no hunt, no death in code/);
  });

  it('backpack law is untouched: caps 1 / 4, growth 1 d / 7 d', () => {
    assert.deepEqual(canHatchMore([], false, []), { ok: true, cap: 1, raised: 0 });
    assert.deepEqual(canHatchMore([], true, []), { ok: true, cap: 4, raised: 0 });
    assert.equal(growthStage(T0, T0 + 8 * 86400000), 'adult');
  });
});
