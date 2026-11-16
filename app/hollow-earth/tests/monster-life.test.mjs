// Monster life agents: the seven-agent life line (Merlin,
// Nov 16 ~02:31 — agents inside the MonsterVerse monsters, the
// J2 pattern, HE-shaped). Pure functions of (record, device
// clock): birth, growth, death, decomposition, diet, habits,
// hunger + the bundle. No THREE, no DOM, no stored state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEATH_CAUSES, HUNGER_RISE_S, HUNGER_THRESHOLD,
  DECOMP_STAGES, GROWTH_STAGES, LIFESPAN_SOURCE,
  lifespanDaysFor, birthMsFor, ageDaysFor,
  growthStageFor, growthFor,
  ageDeathMsFor, ageDeathDue, deathFor,
  decompFor, hungerFor, dietFor, habitsFor, lifeAgentsFor,
} from '../monster-life.js';
import { MONSTER_TYPES, createMonster } from '../spawns.js';
import { DAY_MS } from '../../../lib/life-clock.js';

const rng = () => 0.5;
const NOW = 1800000000000; // fixed device clock — every test here is deterministic
function mon(type, x = 0, z = 0, nowMs = NOW) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng, nowMs);
  m.active = true;
  return m;
}

/* ---------------- BIRTH ---------------- */

test('agents birth: lifespans follow the HP-band rule, dragons always 420 — a stated convention', () => {
  assert.equal(LIFESPAN_SOURCE, 'convention');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['sky-dragon']), 420, 'Stormwing is a dragon: 420, whatever its HP');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['cinder-dragon']), 420, 'Cinder Maw is a dragon: 420');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['muse-dragon']), 420, 'Muse is a dragon: 420');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-43']), 420, 'Road Colossus, 200 HP: 420');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-02']), 420, 'Lava Hulk, 180 HP: 420');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-17']), 300, 'Storm-Cloud Fiend, 170 HP: 300');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-22']), 300, 'Molten Sentinel, 140 HP: 300');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-01']), 180, 'Ooze Revenant, 120 HP: 180');
  assert.equal(lifespanDaysFor(MONSTER_TYPES['slot-32']), 180, 'Cinder Swarm, 110 HP: 180');
  assert.equal(lifespanDaysFor(null), 180, 'no type — the short default, never a crash');
});

test('agents birth: the field is seeded mid-life — age 0..90% of lifespan, same slot draws the same birth', () => {
  const m = mon('slot-17');
  assert.equal(m.generation, 0, 'fresh monsters are generation 0');
  assert.equal(m.lifespanDays, 300, 'the record carries its lifespan');
  assert.ok(Number.isFinite(m.birthMs), 'birthMs is on the record');
  const age = ageDaysFor(m, NOW);
  assert.ok(age >= 0 && age <= 0.9 * 300, `seeded age ${age} d is inside 0..270 d`);
  // Same type+id draws the same birth, always.
  assert.equal(birthMsFor('slot-17', 't-slot-17', 300, NOW), m.birthMs);
  assert.equal(birthMsFor('slot-17', 't-slot-17', 300, NOW), birthMsFor('slot-17', 't-slot-17', 300, NOW));
  // A record with no birth has no age — null, never invented.
  assert.equal(ageDaysFor({}, NOW), null);
  assert.equal(ageDaysFor({ id: 'x', type: 'slot-01' }, NOW), null);
});

/* ---------------- GROWTH ---------------- */

test('agents growth: stages from age fraction — young / juvenile / adult / elder at 0.15 / 0.45 / 0.8', () => {
  assert.equal(growthStageFor(0, 180), 'young');
  assert.equal(growthStageFor(26, 180), 'young', '26/180 = 0.144 — still young');
  assert.equal(growthStageFor(27, 180), 'juvenile', '27/180 = 0.15 — juvenile');
  assert.equal(growthStageFor(80, 180), 'juvenile');
  assert.equal(growthStageFor(81, 180), 'adult', '81/180 = 0.45 — adult');
  assert.equal(growthStageFor(143, 180), 'adult');
  assert.equal(growthStageFor(144, 180), 'elder', '144/180 = 0.8 — elder');
  assert.equal(growthStageFor(200, 180), 'elder', 'past the lifespan reads elder, never past the last stage');
  assert.deepEqual(GROWTH_STAGES, ['young', 'juvenile', 'adult', 'elder']);
});

test('agents growth: size is the family scaleM factored by stage — a read only, never a resize', () => {
  // slot-01: scaleM 2.6 — young 0.6×, juvenile 0.8×, adult 1.0×, elder 0.9×.
  const m = mon('slot-01');
  const at = (ageDays) => growthFor({ ...m, birthMs: NOW - ageDays * DAY_MS }, NOW);
  assert.equal(at(0).stage, 'young');
  assert.equal(at(0).sizeM, 1.56);
  assert.equal(at(30).stage, 'juvenile');
  assert.equal(at(30).sizeM, 2.08);
  assert.equal(at(90).stage, 'adult');
  assert.equal(at(90).sizeM, 2.6);
  assert.equal(at(150).stage, 'elder');
  assert.equal(at(150).sizeM, 2.34);
  assert.equal(at(90).stageName, 'Adult');
  // No birth on the record: adult, sizeM the family scaleM, age unknown.
  const bare = growthFor({ stats: MONSTER_TYPES['slot-01'] }, NOW);
  assert.equal(bare.stage, 'adult');
  assert.equal(bare.fraction, null);
  assert.equal(bare.sizeM, 2.6);
  assert.match(bare.note, /unknown/);
});

/* ---------------- DEATH + AGE ---------------- */

test('agents death: age death is birth + lifespan — due at the instant, never before, never for the dead', () => {
  const m = mon('slot-01'); // 180 d lifespan
  const deathMs = ageDeathMsFor(m);
  assert.equal(deathMs, m.birthMs + 180 * DAY_MS);
  assert.equal(ageDeathDue(m, deathMs - 1), false, 'one millisecond early is not due');
  assert.equal(ageDeathDue(m, deathMs), true, 'due at birth + lifespan');
  assert.equal(ageDeathDue(m, deathMs + DAY_MS), true, 'still due past it');
  // The dead never re-die of age; a record with no birth never dies of age.
  const dead = mon('slot-01');
  dead.dead = true;
  assert.equal(ageDeathDue(dead, deathMs + DAY_MS), false);
  assert.equal(ageDeathDue({}, NOW), false, 'no birth — no age verdict, never invented');
  assert.equal(ageDeathMsFor({}), null);
});

test('agents death: deathFor reads the record when dead, and the age death that awaits when alive', () => {
  const m = mon('slot-01');
  const alive = deathFor(m, NOW);
  assert.equal(alive.state, 'alive');
  assert.equal(alive.cause, null);
  assert.equal(alive.deathMs, ageDeathMsFor(m), 'the awaited death is the age death');
  assert.equal(alive.byAge, true);
  const slain = mon('slot-01');
  slain.dead = true;
  slain.deathCause = 'predation';
  slain.killerId = 't-slot-19';
  slain.diedAtMs = NOW - 5000;
  slain.respawnAtMs = NOW + 40000;
  const dead = deathFor(slain, NOW);
  assert.equal(dead.state, 'dead');
  assert.equal(dead.cause, 'predation');
  assert.equal(dead.killerId, 't-slot-19');
  assert.equal(dead.deathMs, NOW - 5000);
  assert.equal(dead.byAge, false);
  assert.equal(dead.respawnAtMs, NOW + 40000);
  const aged = mon('slot-01');
  aged.dead = true;
  aged.deathCause = 'age';
  aged.diedAtMs = NOW - 1000;
  aged.respawnAtMs = NOW + 44000;
  assert.equal(deathFor(aged, NOW).byAge, true, 'age deaths read byAge');
});

/* ---------------- DECOMPOSITION (the 45 s window) ---------------- */

test('agents decomp: the 45 s respawn window IS the decomposition — fresh remains → fading charge → ash drift', () => {
  assert.deepEqual(DECOMP_STAGES, ['fresh remains', 'fading charge', 'ash drift']);
  const m = mon('slot-01');
  assert.equal(decompFor(m, NOW).remains, 'none', 'alive — no remains');
  m.dead = true;
  m.diedAtMs = NOW - 10000;
  m.respawnAtMs = NOW + 35000; // 45 s window
  const d0 = decompFor(m, NOW - 10000);
  assert.equal(d0.fraction, 0);
  assert.equal(d0.stageName, 'fresh remains');
  assert.equal(d0.windowS, 45);
  assert.equal(d0.nextGenerationAt, NOW + 35000);
  const d1 = decompFor(m, NOW);
  assert.equal(d1.fraction, 0.222, '10 s into the 45 s window');
  assert.equal(d1.stageName, 'fresh remains');
  const d2 = decompFor(m, NOW + 15000);
  assert.equal(d2.fraction, 0.556, '25 s in');
  assert.equal(d2.stageName, 'fading charge');
  const d3 = decompFor(m, NOW + 30000);
  assert.equal(d3.fraction, 0.889, '40 s in');
  assert.equal(d3.stageName, 'ash drift');
  const d4 = decompFor(m, NOW + 35000);
  assert.equal(d4.fraction, 1, 'at the respawn instant the remains are gone');
  // Dead with no death time: unknown window, never invented.
  const bare = { dead: true };
  assert.equal(decompFor(bare, NOW).remains, 'unknown');
  assert.equal(decompFor(bare, NOW).fraction, null);
});

/* ---------------- HUNGER ---------------- */

test('agents hunger: cycles 0→1 over 210 s, hungry ≥ 0.72 for part of the cycle, same phase a cycle later', () => {
  const m = mon('slot-19');
  let hungryCount = 0;
  let seen = 0;
  for (let s = 0; s < HUNGER_RISE_S; s += 5) {
    const h = hungerFor(m, NOW + s * 1000);
    assert.ok(h.hunger >= 0 && h.hunger < 1, `hunger ${h.hunger} in [0,1)`);
    assert.equal(h.hungry, h.hunger >= HUNGER_THRESHOLD, 'hungry is exactly the 0.72 threshold');
    assert.equal(h.threshold, 0.72);
    assert.equal(h.riseS, 210);
    if (h.hungry) hungryCount++;
    seen++;
  }
  assert.ok(hungryCount > 0, 'hungry for part of the cycle');
  assert.ok(hungryCount < seen, 'not hungry for the whole cycle');
  assert.ok(
    Math.abs(hungerFor(m, NOW + HUNGER_RISE_S * 1000).hunger - hungerFor(m, NOW).hunger) < 0.01,
    'the same phase one cycle later (within float rounding)',
  );
  // Deterministic per monster: the same (type, id, clock) always draws the same hunger.
  assert.deepEqual(hungerFor(m, NOW), hungerFor(m, NOW));
});

/* ---------------- DIET ---------------- */

test('agents diet: read from the family record — attitude + archetype + habitat + element secondary, never invented', () => {
  const volt = dietFor(mon('slot-19'), NOW);
  assert.match(volt.diet, /Stalks other monsters and the hunter/);
  assert.match(volt.diet, /ranged lightning predator/);
  assert.match(volt.diet, /lightning band/);
  assert.match(volt.diet, /burns its prey/);
  assert.equal(volt.prey, 'other monsters and the hunter');
  assert.equal(volt.feedingMode, 'roam');
  // One representative per element secondary.
  assert.match(dietFor(mon('slot-01'), NOW).diet, /corrosive pool/, 'acid pools');
  assert.match(dietFor(mon('slot-07'), NOW).diet, /burns its prey/, 'fire burns');
  assert.match(dietFor(mon('slot-36'), NOW).diet, /venoms its prey/, 'poison venoms');
  assert.match(dietFor(mon('slot-11'), NOW).diet, /gloom/, 'shadow glooms');
  assert.match(dietFor(mon('slot-23'), NOW).diet, /sand veil/, 'sand veils');
  assert.match(dietFor(mon('slot-10'), NOW).diet, /chills its prey/, 'frost chills');
  // Attitude verbs: charge runs prey down, ambush lies in wait.
  assert.match(dietFor(mon('slot-02'), NOW).diet, /Runs down/, 'charge');
  assert.match(dietFor(mon('slot-29'), NOW).diet, /Lies in wait for/, 'ambush');
  assert.match(dietFor(mon('slot-36'), NOW).diet, /an environmental poison predator/, 'the article fits the archetype');
  // No family on the record: diet null, never invented.
  const bare = dietFor({ id: 'x' }, NOW);
  assert.equal(bare.diet, null);
  assert.match(bare.note, /never invented/);
});

test('agents diet: feedingMode reads the live action — hunt-user, hunt-prey, ambush-wait, roam, none', () => {
  const spotted = mon('slot-19');
  spotted.spotted = true;
  assert.equal(dietFor(spotted, NOW).feedingMode, 'hunt-user');
  assert.match(dietFor(spotted, NOW).feedingNote, /Hunting the user/);
  const chasing = mon('slot-19');
  chasing.preyTarget = 't-slot-01';
  assert.equal(dietFor(chasing, NOW).feedingMode, 'hunt-prey');
  assert.match(dietFor(chasing, NOW).feedingNote, /another monster/);
  const waiting = mon('slot-17'); // ambusher
  assert.equal(dietFor(waiting, NOW).feedingMode, 'ambush-wait');
  const dead = mon('slot-19');
  dead.dead = true;
  dead.respawnAtMs = NOW + 30000;
  assert.equal(dietFor(dead, NOW).feedingMode, 'none');
  assert.match(dietFor(dead, NOW).feedingNote, /returns in 45 s/);
});

/* ---------------- HABITS ---------------- */

test('agents habits: activity reads the behaviour state; every monster is solitary', () => {
  const roaming = habitsFor(mon('slot-19'));
  assert.equal(roaming.activity, 'roam');
  assert.deepEqual(roaming.social, { behaviour: 'Solitary', groupSize: 1 });
  assert.match(roaming.habit, /Circles and closes on prey/, 'stalk habit, read from the attitude');
  assert.match(habitsFor(mon('slot-02')).habit, /Bursts from range/, 'charge habit');
  assert.match(habitsFor(mon('slot-29')).habit, /Lies still until prey closes in/, 'ambush habit');
  const waiting = habitsFor(mon('slot-17')); // ambusher, state 'ambush' at create
  assert.equal(waiting.activity, 'ambush-wait');
  const chasing = mon('slot-19');
  chasing.preyTarget = 't-slot-01';
  assert.equal(habitsFor(chasing).activity, 'hunt-prey');
  assert.equal(habitsFor(chasing).moving, true);
  const duelling = mon('slot-19');
  duelling.dueling = 't-sky-dragon';
  assert.equal(habitsFor(duelling).activity, 'duel');
  const hunting = mon('slot-19');
  hunting.spotted = true;
  hunting.state = 'stalk';
  assert.equal(habitsFor(hunting).activity, 'stalk');
  const dead = mon('slot-19');
  dead.dead = true;
  assert.equal(habitsFor(dead).activity, 'dead');
  assert.equal(habitsFor(dead).moving, false);
});

/* ---------------- THE BUNDLE ---------------- */

test('agents bundle: lifeAgentsFor carries all seven agents + the generation, one call', () => {
  const m = mon('slot-19');
  const a = lifeAgentsFor(m, NOW);
  assert.ok(a.birth && a.growth && a.death && a.decomp && a.diet && a.habits && a.hunger, 'all seven agents');
  assert.equal(a.generation, 0);
  assert.ok(a.birth.ageDays >= 0 && a.birth.ageDays <= 0.9 * 180, 'seeded mid-life age');
  assert.equal(a.birth.lifespanDays, 180, 'slot-19, 130 HP: 180 d');
  assert.equal(a.birth.lifespanSource, 'convention');
  assert.equal(a.death.deathMs, m.birthMs + 180 * DAY_MS, 'the awaited death is the age death');
  assert.equal(a.decomp.remains, 'none', 'alive — no remains');
  assert.match(a.diet.diet, /Volt Pack Leader|lightning/, 'diet names the family’s element');
  assert.equal(a.hunger.hungry, a.hunger.hunger >= 0.72);
  // Death causes are the four, in the open.
  assert.deepEqual([...DEATH_CAUSES].sort(), ['age', 'combat', 'predation', 'territorial-duel']);
});
