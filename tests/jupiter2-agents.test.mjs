// tests/jupiter2-agents.test.mjs — the seven-agent life line for
// Jupiter 2 monsters (Merlin, Nov 16 ~00:08: "inject agents into
// these monsters") + the predator behaviour (Nov 16 ~00:09: "the
// J2 monsters hunt"). Birth, growth, death, decomposition, diet,
// habits + conductor — pure function of place/kind/device clock.
// No garment agent, no weapons agent (monsters wear no clothes and
// carry no weapon — their lightning IS the weapon, lib/lightning-aura.js).
// Run: node --test tests/jupiter2-agents.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CREATURE_KINDS, DEATH_CAUSES, DECOMP_DAYS, DECOMP_STAGES,
  DRAGON_MODEL_KEYS, HUNT_STALK_M, HUNT_HUNGER_THRESHOLD,
  HUNGER_RISE_S, TERRITORY_R_M, CHASE_SPEED_MPS,
  DEMOBAT_DIVE_SPEED_MPS, JUPITER2_FOUNDING,
  growthStage, growthFor, activityFor, isDragonModel, modelFor,
  lightningKindFor, birthFor, deathFor, decompFor, dietFor,
  habitsFor, huntFor, duelOutcome, lifeFor, lifeLineFor,
  enrichCreatures, homeFor,
} from '../lib/jupiter2/operators.js';
import { LIGHTNING_MONSTER_MODELS } from '../lib/jupiter2/models.js';
import { AURA_R_M } from '../lib/lightning-aura.js';

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

describe('the roster — dragons exist', () => {
  it('Stormwing and Aureline ARE dragons in code (models.js)', () => {
    assert.deepEqual([...DRAGON_MODEL_KEYS], ['sky-dragon', 'aureline']);
    assert.equal(isDragonModel('sky-dragon'), true);
    assert.equal(isDragonModel('aureline'), true);
    assert.equal(isDragonModel('slot-19'), false);
    assert.equal(LIGHTNING_MONSTER_MODELS[3].key, 'sky-dragon');
    assert.equal(LIGHTNING_MONSTER_MODELS[3].name, 'Stormwing');
    assert.equal(LIGHTNING_MONSTER_MODELS[4].key, 'aureline');
    assert.equal(LIGHTNING_MONSTER_MODELS[4].name, 'Aureline the Dawnscale');
  });
  it('the dragon kind exists in the operator table', () => {
    assert.equal(CREATURE_KINDS.dragon.realm, 'surface');
    assert.equal(CREATURE_KINDS.dragon.lifespanDays, 420);
    assert.equal(modelFor('dragon', 0).key, 'sky-dragon');
    assert.equal(modelFor('dragon', 1).key, 'aureline');
    assert.equal(modelFor('dragon', 2).key, 'sky-dragon', 'the dragon roster wraps');
  });
  it('lightning kind resolves per model: dragons strike red', () => {
    assert.equal(lightningKindFor('lightning-monster', 0), 'lightning-monster', 'Volta is white-yellow');
    assert.equal(lightningKindFor('lightning-monster', 3), 'dragon', 'Stormwing is red');
    assert.equal(lightningKindFor('lightning-monster', 4), 'dragon', 'Aureline is red');
    assert.equal(lightningKindFor('lightning-monster', 5), 'lightning-monster', 'Lib is white-yellow');
    assert.equal(lightningKindFor('demobat', 0), 'demobat');
    assert.equal(lightningKindFor('dragon', 0), 'dragon');
  });
});

describe('birth + growth (agents 1–2)', () => {
  it('birth is seeded before founding, so the world is mid-life on day one', () => {
    for (const kind of ['lightning-monster', 'dragon', 'demobat']) {
      const b = birthFor(kind, 0, NOW);
      assert.ok(b.birthMs <= JUPITER2_FOUNDING, `${kind} born before founding`);
      assert.ok(b.ageDays > 0);
    }
    // Same place + same time = same birth, on any phone.
    assert.deepEqual(birthFor('lightning-monster', 2, NOW), birthFor('lightning-monster', 2, NOW));
  });
  it('growth stages advance with age; size follows the stage', () => {
    assert.equal(growthStage('lightning-monster', 10), 'spark');
    assert.equal(growthStage('lightning-monster', 150), 'juvenile');
    assert.equal(growthStage('lightning-monster', 300), 'adult');
    assert.equal(growthStage('lightning-monster', 400), 'elder');
    const g = growthFor('lightning-monster', 10, 2.2);
    assert.equal(g.stage, 'spark');
    assert.equal(g.sizeFactor, 0.4);
    assert.equal(g.sizeM, 0.88);
    assert.equal(growthFor('lightning-monster', 300, 2.2).sizeM, 2.2);
  });
});

describe('death + decomposition (agents 3–4) — the old no-death law is superseded', () => {
  it('death is REAL now: age ends every life (Merlin, Nov 16 ~00:08)', () => {
    assert.deepEqual([...DEATH_CAUSES], ['age', 'predation', 'territorial-duel']);
    for (const kind of ['lightning-monster', 'dragon', 'demobat']) {
      const life = lifeFor(kind, 0, NOW);
      assert.equal(life.dies, true, `${kind} dies`);
      assert.notEqual(life.death, null);
      assert.equal(life.death.cause, 'age');
      assert.ok(life.death.deathMs > NOW, 'the age-death lies ahead');
    }
  });
  it('a kill moves death earlier — predation and duels are real causes', () => {
    const birth = birthFor('demobat', 0, NOW).birthMs;
    const killed = deathFor('demobat', birth, { cause: 'predation', diedAtMs: NOW + 1000, killerId: 'lightning-monster_0' });
    assert.equal(killed.cause, 'predation');
    assert.equal(killed.deathMs, NOW + 1000);
    assert.equal(killed.killerId, 'lightning-monster_0');
    assert.equal(killed.byAge, false);
    const aged = deathFor('demobat', birth, null);
    assert.equal(aged.cause, 'age');
    assert.equal(aged.byAge, true);
  });
  it('remains decompose, then the next generation is born in the same slot', () => {
    assert.equal(DECOMP_DAYS['lightning-monster'], 30);
    assert.equal(DECOMP_DAYS.dragon, 30);
    assert.equal(DECOMP_DAYS.demobat, 14);
    assert.deepEqual([...DECOMP_STAGES], ['fading charge', 'cold husk', 'ash drift']);
    // Kill generation 0 of the demobat at NOW (its age-death is
    // 2026-11-27, so the kill is earlier and applies): a second
    // later it is decomposing, not alive.
    const killAt = NOW;
    const gen0 = lifeFor('demobat', 0, killAt + 1000, { kill: { generation: 0, cause: 'predation', diedAtMs: killAt, killerId: 'lightning-monster_0' } });
    assert.equal(gen0.state, 'decomposing');
    assert.equal(gen0.generation, 0);
    assert.equal(gen0.death.cause, 'predation');
    assert.equal(gen0.death.killerId, 'lightning-monster_0');
    assert.equal(gen0.decompStageName, 'fading charge');
    const decomp = decompFor('demobat', 0.5);
    assert.equal(decomp.stageName, 'cold husk');
    assert.equal(decompFor('demobat', 0).stageName, 'fading charge');
    assert.equal(decompFor('demobat', 0.99).stageName, 'ash drift');
    // And after the 14-day decomp, the same slot is alive again
    // as generation 1 — the caller keeps passing the kill (the
    // scene holds it in its brain and passes it every tick; the
    // operator function itself holds no state).
    const next = lifeFor('demobat', 0, killAt + 15 * 86400000, { kill: { generation: 0, cause: 'predation', diedAtMs: killAt, killerId: 'lightning-monster_0' } });
    assert.equal(next.state, 'alive');
    assert.equal(next.generation, 1);
  });
  it('the conductor cycles generations: no slot ever stands empty', () => {
    // Step the clock 5 years in 30-day jumps; every read is alive or
    // decomposing, never null, and generations advance.
    let lastGen = -1;
    let sawDecomp = false;
    for (let t = NOW; t < NOW + 5 * 365 * 86400000; t += 30 * 86400000) {
      const life = lifeFor('lightning-monster', 1, t);
      assert.ok(life, `a life exists at ${new Date(t).toISOString()}`);
      assert.ok(['alive', 'decomposing'].includes(life.state));
      assert.ok(life.generation >= lastGen, 'generations never go backwards');
      if (life.state === 'decomposing') sawDecomp = true;
      lastGen = life.generation;
    }
    assert.ok(lastGen > 0, 'generations turn over');
    assert.ok(sawDecomp, 'decomposition is observed across the sweep');
  });
});

describe('diet + habits (agents 5–6)', () => {
  it('every monster is a predator: hungry means hunting', () => {
    const d = dietFor('lightning-monster', 0, NOW, []);
    assert.ok(d.diet.length > 10);
    assert.equal(d.hungerThreshold, HUNT_HUNGER_THRESHOLD);
    assert.ok(d.hunger >= 0 && d.hunger < 1);
    // Hunger cycles 0→1 over 210 s on the clock.
    assert.equal(HUNGER_RISE_S, 210);
    const h1 = dietFor('lightning-monster', 0, NOW, []).hunger;
    const h2 = dietFor('lightning-monster', 0, NOW + 105000, []).hunger;
    assert.ok(Math.abs(((h1 + 0.5) % 1) - h2) < 0.01, 'hunger advances half a cycle in 105 s');
  });
  it('habits are clock-driven and solitary', () => {
    const h = habitsFor('demobat', 0, NOW);
    assert.ok(h.activity.length > 3);
    assert.equal(h.social.behaviour, 'Solitary');
    assert.equal(h.social.groupSize, 1);
    assert.notEqual(
      activityFor('demobat', new Date(2026, 10, 15, 2).getTime()),
      activityFor('demobat', new Date(2026, 10, 15, 8).getTime()),
    );
  });
});

describe('the hunt (Merlin, Nov 16 ~00:09)', () => {
  const self = { x: 0, y: 88, z: 0 };
  const farWalker = { x: 500, y: 88, z: 0, alive: true, mounted: false };
  const nearWalker = { x: 50, y: 88, z: 0, alive: true, mounted: false };
  const auraWalker = { x: 30, y: 88, z: 0, alive: true, mounted: false };
  const midWalker = { x: 100, y: 88, z: 0, alive: true, mounted: false };

  it('the stalk range is 140 m — Earth 2’s number', () => {
    assert.equal(HUNT_STALK_M, 140);
    assert.equal(AURA_R_M, 59);
  });
  it('a hungry monster hunts the walker on foot — user first', () => {
    // Find a hungry instant for slot 0 by scanning the clock.
    let hungryAt = null;
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 1000) {
      const h = huntFor('lightning-monster', 0, t, { ...self, walker: nearWalker, others: [] });
      if (h.hungry) { hungryAt = t; break; }
    }
    assert.ok(hungryAt, 'a hungry instant exists inside one hunger cycle');
    const hunt = huntFor('lightning-monster', 0, hungryAt, { ...self, walker: midWalker, others: [] });
    assert.equal(hunt.mode, 'hunt-user');
    assert.equal(hunt.target, 'walker');
    assert.equal(hunt.targetKind, 'walker');
  });
  it('inside 59 m the hunt becomes the attack — the streaks strike', () => {
    let hungryAt = null;
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 1000) {
      if (huntFor('lightning-monster', 0, t, { ...self, walker: auraWalker, others: [] }).hungry) { hungryAt = t; break; }
    }
    const hunt = huntFor('lightning-monster', 0, hungryAt, { ...self, walker: auraWalker, others: [] });
    assert.equal(hunt.mode, 'attack');
    assert.ok(hunt.distanceM <= 59);
  });
  it('a walker in the speeder is NOT prey — mounted is immune', () => {
    const mounted = { ...nearWalker, mounted: true };
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 5000) {
      const h = huntFor('lightning-monster', 0, t, { ...self, walker: mounted, others: [] });
      assert.notEqual(h.mode, 'hunt-user', 'never hunts a mounted walker');
      assert.notEqual(h.mode, 'attack', 'never strikes a mounted walker');
    }
  });
  it('no prey in range means no hunt, even hungry', () => {
    let hungryAt = null;
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 1000) {
      if (huntFor('lightning-monster', 0, t, { ...self, walker: farWalker, others: [] }).hungry) { hungryAt = t; break; }
    }
    const hunt = huntFor('lightning-monster', 0, hungryAt, { ...self, walker: farWalker, others: [] });
    assert.equal(hunt.mode, 'idle');
  });
  it('a diving demobat is prey for lightning monsters — a circling one is not', () => {
    let hungryAt = null;
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 1000) {
      if (huntFor('lightning-monster', 0, t, { ...self, walker: farWalker, others: [] }).hungry) { hungryAt = t; break; }
    }
    const diving = { id: 'demobat_2', kind: 'demobat', index: 2, x: 100, y: 90, z: 0, alive: true, heightM: 2, diving: true };
    const circling = { ...diving, diving: false };
    const huntDive = huntFor('lightning-monster', 0, hungryAt, { ...self, walker: farWalker, others: [diving] });
    assert.equal(huntDive.mode, 'hunt-prey');
    assert.equal(huntDive.target, 'demobat_2');
    const huntCircle = huntFor('lightning-monster', 0, hungryAt, { ...self, walker: farWalker, others: [circling] });
    assert.equal(huntCircle.mode, 'idle');
  });
  it('demobats hunt the walker, never other monsters', () => {
    let hungryAt = null;
    for (let t = NOW; t < NOW + HUNGER_RISE_S * 1000; t += 1000) {
      if (huntFor('demobat', 0, t, { ...self, walker: nearWalker, others: [] }).hungry) { hungryAt = t; break; }
    }
    assert.ok(hungryAt, 'a hungry instant exists for the demobat');
    const hunt = huntFor('demobat', 0, hungryAt, { ...self, walker: midWalker, others: [] });
    assert.equal(hunt.mode, 'hunt-user');
    const monsterPrey = { id: 'lightning-monster_1', kind: 'lightning-monster', index: 1, x: 40, y: 88, z: 0, alive: true, heightM: 2, diving: false };
    const huntMonster = huntFor('demobat', 0, hungryAt, { ...self, walker: farWalker, others: [monsterPrey] });
    assert.equal(huntMonster.mode, 'idle', 'demobats never hunt lightning monsters');
  });
  it('two lightning monsters within 50 m duel — the bigger wins', () => {
    assert.equal(TERRITORY_R_M, 50);
    const rival = { id: 'lightning-monster_1', kind: 'lightning-monster', index: 1, x: 30, y: 88, z: 0, alive: true, heightM: 2.0, diving: false };
    // Slot 0 is Volta (2.2 m) vs slot 1 Auric Storm (2.0 m): Volta wins.
    const duel = huntFor('lightning-monster', 0, NOW, { ...self, walker: farWalker, others: [rival] });
    assert.equal(duel.mode, 'duel');
    assert.equal(duel.winnerSceneId, 'lightning-monster_0');
    assert.equal(duel.loserSceneId, 'lightning-monster_1');
    const out = duelOutcome({ id: 'a', heightM: 2 }, { id: 'b', heightM: 3 });
    assert.equal(out.winnerId, 'b');
    assert.equal(out.loserId, 'a');
  });
  it('chase speeds beat the walk — the hunt closes distance', () => {
    assert.equal(CHASE_SPEED_MPS, 9);
    assert.equal(DEMOBAT_DIVE_SPEED_MPS, 12);
    assert.ok(CHASE_SPEED_MPS > 6, 'a chase (9 m/s) beats the 6 m/s walk');
  });
});

describe('the conductor (agent 7)', () => {
  it('every kind gets a full life line, and it is pure', () => {
    for (const kind of ['lightning-monster', 'dragon', 'demobat']) {
      const life = lifeFor(kind, 0, NOW);
      assert.ok(life.birthMs <= NOW);
      assert.ok(['spark', 'juvenile', 'adult', 'elder'].includes(life.stage));
      assert.ok(life.diet.length > 10);
      assert.ok(life.habit.length > 10);
      assert.ok(life.activity.length > 3);
      assert.ok(life.dietDetail, 'diet agent present');
      assert.ok(life.habits, 'habits agent present');
      assert.ok(life.hunt, 'hunt agent present');
      assert.ok(life.aura, 'aura present');
      assert.ok(life.line.length > 10, 'life line present');
      assert.deepEqual(lifeFor(kind, 0, NOW), life, 'same place + same time = same life');
    }
  });
  it('the life line names the real creature, its stage, and its lightning', () => {
    const volta = lifeFor('lightning-monster', 0, NOW);
    assert.equal(volta.name, 'Volta');
    assert.match(volta.line, /Volta/);
    assert.match(volta.line, /white-yellow lightning/);
    const stormwing = lifeFor('lightning-monster', 3, NOW);
    assert.equal(stormwing.name, 'Stormwing');
    assert.equal(stormwing.dragon, true);
    assert.match(stormwing.line, /Dragon/);
    assert.match(stormwing.line, /red lightning/);
    const bat = lifeFor('demobat', 0, NOW);
    assert.match(bat.line, /yellow lightning/);
    const remains = lifeLineFor({ state: 'decomposing', name: 'Volta', decompStageName: 'cold husk' });
    assert.equal(remains, 'Remains — Volta · cold husk');
  });
  it('homes are spread inside the world disc', () => {
    for (const kind of ['lightning-monster', 'demobat']) {
      const seen = new Set();
      for (let i = 0; i < 9; i++) {
        const h = homeFor(kind, i);
        assert.ok(Math.hypot(h.x, h.z) <= 78, 'home inside the disc');
        seen.add(`${h.x.toFixed(2)},${h.z.toFixed(2)}`);
      }
      assert.equal(seen.size, 9, 'homes are spread, not stacked');
    }
  });
  it('enrichCreatures adds a life to every creature record', () => {
    const creatures = [
      { id: 'lightning-monster_0', kind: 'lightning-monster', index: 0 },
      { id: 'demobat_0', kind: 'demobat', index: 0 },
    ];
    const out = enrichCreatures(creatures, NOW, {});
    assert.equal(out[0].life.name, 'Volta');
    assert.equal(out[1].life.name, 'Demobat');
    assert.equal(out, creatures, 'enriches in place');
  });
  it('a dead creature’s life line reads as remains, with no hunt and no aura', () => {
    // Kill generation 0 of Volta at NOW (its age-death is
    // 2027-04-23, so the kill applies): a second later it is
    // decomposing remains, not a hunter.
    const life = lifeFor('lightning-monster', 0, NOW + 1000, {
      kill: { generation: 0, cause: 'predation', diedAtMs: NOW, killerId: 'lightning-monster_1' },
    });
    assert.equal(life.state, 'decomposing');
    assert.equal(life.hunt.mode, 'idle');
    assert.equal(life.aura, null);
    assert.match(life.line, /^Remains — /);
    assert.equal(life.death.cause, 'predation');
  });
});
