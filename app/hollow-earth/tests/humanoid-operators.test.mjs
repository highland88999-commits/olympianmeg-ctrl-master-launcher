// Humanoid operator agents — the repaired monster agents
// (Merlin, Nov 16 ~02:31, agents workstream). The humanoid
// monster agents used to read the OLD law ("no respawn loop",
// "no diet", "no monster-vs-monster combat", "12 s give-up");
// they now delegate to the same seven-agent bundle operators.js
// reads (monster-life.js). Korus, Ghorrum and the hero are
// untouched — exemptions stand, and these tests pin them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monsterLifeFor, korusLifeFor, watcherLifeFor,
  birthFor, growthFor, deathFor, decompositionFor,
  dietFor, territoryFor, userHuntFor,
} from '../humanoid-operators.js';
import { MONSTER_TYPES, createMonster, createKorus, damageMonster, damageKorus } from '../spawns.js';
import { DAY_MS } from '../../../lib/life-clock.js';

const rng = () => 0.5;
const NOW = 1800000000000; // fixed device clock
function mon(type, x = 0, z = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng, NOW);
  m.active = true;
  return m;
}

test('humanoid agents: birth is seeded mid-life with a 45 s next generation — not "never mid-session"', () => {
  const b = birthFor('monster');
  assert.equal(b.mode, 'seeded-mid-life');
  assert.match(b.note, /mid-life/);
  assert.match(b.note, /45 s/);
  assert.match(b.note, /next generation/);
  assert.equal(birthFor('boss').mode, 'singleton', 'Korus is still placed once, no birth');
  assert.equal(birthFor('watcher').mode, 'singleton', 'Ghorrum is still placed once, no birth');
});

test('humanoid agents: growth is the stage from age + scaleM — young to elder, a read only', () => {
  const young = mon('slot-01');
  young.birthMs = NOW - 10 * DAY_MS;
  assert.equal(growthFor('monster', young, NOW).stage, 'young');
  assert.equal(growthFor('monster', young, NOW).stageName, 'Young');
  const elder = mon('slot-01');
  elder.birthMs = NOW - 150 * DAY_MS;
  assert.equal(growthFor('monster', elder, NOW).stage, 'elder');
  assert.equal(growthFor('monster', elder, NOW).stageName, 'Elder');
  assert.equal(growthFor('monster', elder, NOW).sizeM, 2.34, 'scaleM 2.6 × elder 0.9');
  assert.equal(growthFor('boss').stage, 'adult', 'Korus is still placed as an adult');
});

test('humanoid agents: death reads the record — four causes, live 45 s clock, age death awaited', () => {
  const alive = mon('slot-01');
  const d0 = deathFor('monster', alive);
  assert.equal(d0.state, 'alive');
  assert.equal(d0.deathMs, alive.birthMs + 180 * DAY_MS, 'the awaited death is the age death');
  const slain = mon('slot-01');
  damageMonster(slain, 1000);
  const d1 = deathFor('monster', slain);
  assert.equal(d1.state, 'dead');
  assert.equal(d1.cause, 'combat');
  assert.equal(d1.respawnAt, slain.respawnAtMs);
  assert.match(d1.respawnNote, /45 s/);
  const eaten = mon('slot-01');
  eaten.dead = true;
  eaten.deathCause = 'predation';
  eaten.killerId = 't-slot-19';
  eaten.diedAtMs = NOW - 5000;
  eaten.respawnAtMs = NOW + 40000;
  const d2 = deathFor('monster', eaten);
  assert.equal(d2.cause, 'predation');
  assert.equal(d2.killerId, 't-slot-19');
  assert.match(d2.note, /another monster/);
  const aged = mon('slot-01');
  aged.dead = true;
  aged.deathCause = 'age';
  aged.diedAtMs = NOW - 1000;
  aged.respawnAtMs = NOW + 44000;
  const d3 = deathFor('monster', aged);
  assert.equal(d3.cause, 'age');
  assert.match(d3.note, /Died of age/);
});

test('humanoid agents: decomposition is the 45 s remains window, fading — not "nothing"', () => {
  const alive = mon('slot-01');
  assert.equal(decompositionFor('monster', alive, NOW).remains, 'none');
  const dead = mon('slot-01');
  dead.dead = true;
  dead.diedAtMs = NOW - 10000;
  dead.respawnAtMs = NOW + 35000;
  const d = decompositionFor('monster', dead, NOW);
  assert.equal(d.remains, 'fading disc');
  assert.equal(d.windowS, 45);
  assert.equal(d.fraction, 0.222, '10 s into the 45 s window');
  assert.equal(d.stageName, 'fresh remains');
  assert.equal(d.nextGenerationAt, NOW + 35000);
  assert.equal(decompositionFor('boss').remains, 'none', 'Korus still leaves no remains');
});

test('humanoid agents: diet is read from the family record — a predator line, never null for a monster', () => {
  const d = dietFor('monster', mon('slot-19'));
  assert.match(d.diet, /Stalks other monsters and the hunter/);
  assert.match(d.diet, /lightning predator/);
  assert.equal(d.action, 'roam');
  const chasing = mon('slot-19');
  chasing.preyTarget = 't-slot-01';
  assert.equal(dietFor('monster', chasing).action, 'hunt-prey');
  const spotted = mon('slot-19');
  spotted.spotted = true;
  assert.equal(dietFor('monster', spotted).action, 'hunt-user');
  assert.equal(dietFor('boss', null).diet, null, 'Korus still has no diet in code');
});

test('humanoid agents: territory is the habitat band with aura, hunt and duel — not "none"', () => {
  const t = territoryFor('monster');
  assert.equal(t.mode, 'habitat-band');
  assert.match(t.note, /59 m aura/);
  assert.match(t.note, /140 m/);
  assert.match(t.note, /duel rivals inside 50 m/);
  assert.equal(territoryFor('boss').mode, 'boss-throne', 'Korus still holds his throne alone');
});

test('humanoid agents: the user hunt gives up after 20 s, not 12', () => {
  const h = userHuntFor(mon('slot-19'));
  assert.equal(h.giveUpS, 20);
  assert.match(h.note, /20 s/);
});

test('humanoid agents: monsterLifeFor reports the death cause, the respawn countdown and the age-death line', () => {
  const slain = mon('slot-01');
  damageMonster(slain, 1000);
  const life = monsterLifeFor(slain, slain.diedAtMs + 10000);
  assert.equal(life.deathCause, 'combat');
  assert.equal(life.respawnInS, 35);
  assert.match(life.line, /Remains — (Young|Juvenile|Adult|Elder) Ooze Revenant · slain by the hunter · returns in 35s/);
  assert.match(life.feedingNote, /returns in 45 s/);
  const aged = mon('slot-01');
  aged.dead = true;
  aged.deathCause = 'age';
  aged.diedAtMs = NOW - 5000;
  aged.respawnAtMs = NOW + 40000;
  const agedLife = monsterLifeFor(aged, NOW);
  assert.equal(agedLife.deathCause, 'age');
  assert.match(agedLife.line, /died of age · returns in 40s/);
  const alive = mon('slot-19');
  const aliveLife = monsterLifeFor(alive, NOW);
  assert.match(aliveLife.line, /Roaming/);
  assert.match(aliveLife.line, /lightning/);
});

test('humanoid agents: Korus and Ghorrum are EXEMPT and unchanged — permanent boss, undying watcher', () => {
  const k = createKorus(true);
  assert.equal(damageKorus(k, 1000), true);
  const klife = korusLifeFor(k);
  assert.equal(klife.state, 'dead');
  assert.equal(klife.deathCause, 'combat');
  assert.match(klife.line, /throne stands empty/);
  const wlife = watcherLifeFor();
  assert.equal(wlife.state, 'alive');
  assert.match(wlife.line, /never hostile/);
});
