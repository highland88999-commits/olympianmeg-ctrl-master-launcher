// Operator life lines: the elemental-aura field (Merlin,
// Nov 16 ~00:11 lightning, Nov 16 ~01:33-01:34 all seven
// elements). monsterLifeFor gains `aura` — the shared
// auraForElement() object for live sources of any element, null
// otherwise; Korus and Ghorrum are aura-null by design, each
// with a note.
// No operators test file existed before this one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterLifeFor, korusLifeFor, watcherLifeFor } from '../operators.js';
import { MONSTER_TYPES, createMonster, createKorus, applyMonsterAuraHit, damageMonster, damageKorus } from '../spawns.js';
import { AURA_R_M, LIGHTNING_COLORS } from '../../../lib/lightning-aura.js';
import { ELEMENT_AURA } from '../elemental-aura.js';

const rng = () => 0.5;
function mon(type, x = 0, z = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.active = true;
  return m;
}

test('operators aura: lightning family carries a 59 m white-yellow aura', () => {
  const life = monsterLifeFor(mon('slot-17', 0, 0));
  assert.equal(life.aura.radiusM, 59);
  assert.equal(AURA_R_M, 59);
  assert.deepEqual(life.aura.color, LIGHTNING_COLORS['lightning-monster']);
  assert.equal(life.aura.active, true);
  assert.equal(life.aura.targetInRange, null, 'no target known — null, never invented');
  assert.equal(life.aura.distanceM, null);
  assert.match(life.auraNote, /White-yellow/);
});

test('operators aura: every dragon carries its own element aura, red only for the lightning dragon', () => {
  const sky = monsterLifeFor(mon('sky-dragon', 0, 0));
  assert.equal(sky.aura.radiusM, 59, 'Stormwing is lightning: 59 m');
  assert.deepEqual(sky.aura.color, LIGHTNING_COLORS.dragon, 'Stormwing is red');
  assert.match(sky.auraNote, /Red/);
  const cinder = monsterLifeFor(mon('cinder-dragon', 0, 0));
  assert.equal(cinder.aura.radiusM, 24, 'Cinder Maw is fire: 24 m');
  assert.equal(cinder.aura.color, ELEMENT_AURA.fire.color, 'Cinder Maw wears fire orange, not dragon red');
  assert.match(cinder.auraNote, /Fire aura, 24 m/);
  const muse = monsterLifeFor(mon('muse-dragon', 0, 0));
  assert.equal(muse.aura.radiusM, 30, 'Muse is shadow: 30 m');
  assert.equal(muse.aura.color, ELEMENT_AURA.shadow.color, 'Muse wears shadow grey');
  assert.match(muse.auraNote, /Shadow aura, 30 m/);
});

test('operators aura: targetInRange follows a known player position, never an invented one', () => {
  const near = monsterLifeFor(mon('slot-19', 0, 0), Date.now(), { playerPos: { x: 0, z: 30 } });
  assert.equal(near.aura.targetInRange, true);
  assert.equal(near.aura.distanceM, 30);
  const far = monsterLifeFor(mon('slot-19', 0, 0), Date.now(), { playerPos: { x: 0, z: 100 } });
  assert.equal(far.aura.targetInRange, false);
  assert.equal(far.aura.distanceM, 100);
  // A player position carried on the record itself also counts.
  const rec = mon('slot-19', 0, 0);
  rec.playerPos = { x: 0, z: 59 };
  assert.equal(monsterLifeFor(rec).aura.targetInRange, true);
});

test('operators aura: every element carries its own aura — radius, secondary and colour from ELEMENT_AURA', () => {
  // One representative family per element (poison's slot-36 has
  // no placed GLB, but the aura is model-independent — the tap
  // card names the emanation either way). The old lightning-only
  // pin ("non-lightning families get aura null") is superseded
  // by the WS5 generalisation.
  const rep = { acid: 'slot-01', fire: 'slot-07', lightning: 'slot-17', poison: 'slot-36', shadow: 'slot-11', sand: 'slot-23', frost: 'slot-10' };
  for (const [element, key] of Object.entries(rep)) {
    const life = monsterLifeFor(mon(key, 0, 0));
    const row = ELEMENT_AURA[element];
    assert.equal(life.aura.radiusM, row.radiusM, `${key} radius`);
    assert.equal(life.aura.secondary, row.secondary, `${key} secondary`);
    assert.equal(life.aura.element, element, `${key} element`);
    assert.equal(life.aura.active, true, `${key} active`);
    assert.match(life.auraNote, new RegExp(`${row.radiusM} m`), `${key} note names its radius`);
    if (element === 'lightning') {
      assert.deepEqual(life.aura.color, LIGHTNING_COLORS['lightning-monster'], `${key} colour`);
      assert.match(life.auraNote, /White-yellow/);
    } else {
      assert.equal(life.aura.color, row.color, `${key} colour is its ELEMENT_AURA colour`);
      assert.match(life.auraNote, new RegExp(element.charAt(0).toUpperCase() + element.slice(1)), `${key} note names its element`);
    }
  }
  // Dead still means off, for every element.
  const dead = mon('slot-07', 0, 0);
  dead.dead = true;
  const deadLife = monsterLifeFor(dead);
  assert.equal(deadLife.aura, null);
  assert.match(deadLife.auraNote, /Dead — the aura is off/);
});

test('operators aura: a dead lightning monster has no aura', () => {
  const m = mon('slot-17', 0, 0);
  m.dead = true;
  const life = monsterLifeFor(m);
  assert.equal(life.aura, null);
  assert.match(life.auraNote, /Dead/);
});

test('operators aura: Korus keeps his own boss mechanics — aura null', () => {
  const life = korusLifeFor(createKorus(true));
  assert.equal(life.aura, null);
  assert.match(life.auraNote, /sky-bolt/);
});

test('operators aura: Ghorrum the watcher — aura null', () => {
  const life = watcherLifeFor();
  assert.equal(life.aura, null);
  assert.match(life.auraNote, /watcher/);
});

/* ---------------- MONSTER-VS-MONSTER (Merlin, Nov 16 ~01:02) ----------------
 * A live lightning source with another monster inside its 59 m
 * aura is hunting prey; Korus and Ghorrum are EXEMPT — never
 * an aura, never prey. */

test('operators mvm: a lightning monster with prey in aura is hunting prey', () => {
  const hunter = mon('slot-17', 0, 0);
  const prey = mon('slot-20', 0, 30);
  const life = monsterLifeFor(hunter, Date.now(), { others: [prey] });
  assert.equal(life.preyTarget, prey.id);
  assert.equal(life.feeding, 'hunt-prey');
  assert.match(life.feedingNote, /another monster/);
  assert.match(life.line, /Hunting prey/);
  // Prey past 59 m is not prey; no others means unknown, never invented.
  const far = monsterLifeFor(hunter, Date.now(), { others: [mon('slot-20', 0, 60)] });
  assert.equal(far.preyTarget, null);
  assert.equal(far.feeding, 'ambush-wait', 'slot-17 is an ambusher — back to lying in wait, not hunting prey');
  const unknown = monsterLifeFor(hunter, Date.now());
  assert.equal(unknown.preyTarget, null);
  // A non-lightning monster never hunts prey — the prey-HUNT
  // stays lightning-carrier-only (WS3) even though every
  // element now auras; its aura still strikes prey in range.
  const plain = mon('slot-01', 0, 0);
  const plainLife = monsterLifeFor(plain, Date.now(), { others: [prey] });
  assert.equal(plainLife.preyTarget, null);
  assert.notEqual(plainLife.feeding, 'hunt-prey');
});

test('operators mvm: Korus and Ghorrum are EXEMPT — never prey, stated in the note', () => {
  const korus = korusLifeFor(createKorus(true));
  assert.equal(korus.aura, null);
  assert.match(korus.auraNote, /EXEMPT/);
  assert.match(korus.auraNote, /never prey/);
  const watcher = watcherLifeFor();
  assert.equal(watcher.aura, null);
  assert.match(watcher.auraNote, /EXEMPT/);
  assert.match(watcher.auraNote, /never prey/);
  // And a lightning monster's prey list refuses them outright.
  const hunter = mon('slot-17', 0, 0);
  const korusShaped = { id: 'korus', type: 'korus', x: 0, z: 10, dead: false, active: true };
  const life = monsterLifeFor(hunter, Date.now(), { others: [korusShaped] });
  assert.equal(life.preyTarget, null);
});

/* ---------------- SAVAGERY (Merlin, Nov 16 ~01:33) ----------------
 * Phase-2 workstream 3: death causes + live 45 s respawn, duel
 * and prey-chase reads. Tests written first. */

test('operators savagery: a predation death reports deathCause, live respawnAt, and a Remains line with killer + countdown', () => {
  const prey = mon('slot-01', 0, 0);
  prey.hp = 5;
  const killer = mon('slot-19', 10, 0); // id 't-slot-19', 'Volt Pack Leader'
  assert.equal(applyMonsterAuraHit(prey, { dmg: 8, from: killer.id }), true);
  const now = prey.diedAtMs + 10000; // 10 s after the kill: 35 s left
  const life = monsterLifeFor(prey, now, { others: [killer] });
  assert.equal(life.deathCause, 'predation');
  assert.equal(life.respawnAt, prey.respawnAtMs);
  assert.match(life.respawnNote, /45 s/);
  assert.match(life.respawnNote, /near where it fell/);
  assert.match(life.line, /Remains — Ooze Revenant/);
  assert.match(life.line, /slain by Volt Pack Leader/);
  assert.match(life.line, /returns in 35s/);
});

test('operators savagery: a combat death names the hunter as the killer', () => {
  const m = mon('slot-01', 0, 0);
  assert.equal(damageMonster(m, 1000), true);
  const life = monsterLifeFor(m, m.diedAtMs + 5000);
  assert.equal(life.deathCause, 'combat');
  assert.match(life.line, /slain by the hunter/);
  assert.match(life.line, /returns in 40s/);
});

test('operators savagery: a duelling carrier reports duel and a Dueling line', () => {
  const m = mon('slot-19', 0, 0);
  m.dueling = 't-sky-dragon';
  const life = monsterLifeFor(m, Date.now());
  assert.ok(life.duel, 'duel is reported while duelling');
  assert.equal(life.duel.rivalId, 't-sky-dragon');
  assert.match(life.line, /Dueling/);
  const calm = mon('slot-19', 0, 0);
  assert.equal(monsterLifeFor(calm, Date.now()).duel, null, 'no duel when not duelling');
});

test('operators savagery: feeding is hunt-prey when the record is chasing prey', () => {
  const m = mon('slot-19', 0, 0);
  m.preyTarget = 't-slot-01';
  const life = monsterLifeFor(m, Date.now());
  assert.equal(life.preyTarget, 't-slot-01', 'the record chase is trusted, not re-derived from the 59 m aura');
  assert.equal(life.feeding, 'hunt-prey');
  assert.match(life.line, /Hunting prey/);
});

test('operators savagery: Korus keeps respawnAt null — death is permanent', () => {
  const k = createKorus(true);
  assert.equal(damageKorus(k, 1000), true);
  const life = korusLifeFor(k);
  assert.equal(life.state, 'dead');
  assert.equal(life.respawnAt, null, 'Korus never respawns');
  assert.match(life.respawnNote, /permanent/);
  assert.match(life.line, /throne stands empty/);
});

/* ---------------- AGENTS (Merlin, Nov 16 ~02:31) ----------------
 * The seven-agent life line, conductor side: monsterLifeFor
 * carries the bundle verbatim — birth, growth, death,
 * decomposition, diet, habits, hunger + the generation. */

test('operators agents: the life carries the seven-agent bundle — birth, growth, death, decomp, diet, habits, hunger', () => {
  const m = mon('slot-19', 0, 0);
  const life = monsterLifeFor(m, Date.now());
  assert.ok(life.birth && life.growth && life.death && life.decomp && life.diet && life.habits && life.hunger, 'all seven agents');
  assert.equal(life.generation, 0);
  assert.equal(life.lifespanDays, 180, 'slot-19, 130 HP: 180 d');
  assert.equal(life.lifespanSource, 'convention');
  assert.ok(life.birth.ageDays >= 0 && life.birth.ageDays <= 162, 'seeded mid-life age');
  assert.equal(life.death.state, 'alive');
  assert.equal(life.death.deathMs, m.birthMs + 180 * 86400000, 'the awaited death is the age death');
  assert.equal(life.decomp.remains, 'none');
  assert.match(life.diet.diet, /lightning predator/);
  assert.equal(life.hungry, life.hunger.hunger >= 0.72);
  assert.match(life.line, /(Young|Juvenile|Adult|Elder)/, 'the line names the growth stage');
});

test('operators agents: growth stage follows the record age — a young monster reads Young', () => {
  const m = mon('slot-01', 0, 0);
  m.birthMs = Date.now() - 10 * 86400000;
  const life = monsterLifeFor(m, Date.now());
  assert.equal(life.growth.stage, 'young');
  assert.equal(life.growth.stageName, 'Young');
  assert.match(life.line, /Young/);
});

test('operators agents: an age death reads old age, a Remains line that says died of age, and a 45 s countdown', () => {
  const m = mon('slot-01', 0, 0);
  m.dead = true;
  m.deathCause = 'age';
  m.diedAtMs = Date.now() - 5000;
  m.respawnAtMs = Date.now() + 40000;
  const life = monsterLifeFor(m, Date.now());
  assert.equal(life.deathCause, 'age');
  assert.equal(life.killerName, 'old age');
  assert.equal(life.death.byAge, true);
  assert.equal(life.decomp.windowS, 45);
  assert.match(life.line, /died of age · returns in 40s/);
});

test('operators agents: a dead monster’s decomp reads the 45 s window — fraction and stage', () => {
  const m = mon('slot-01', 0, 0);
  m.dead = true;
  m.deathCause = 'predation';
  m.diedAtMs = 1800000000000;
  m.respawnAtMs = 1800000000000 + 45000;
  const life = monsterLifeFor(m, 1800000000000 + 30000);
  assert.equal(life.decomp.fraction, 0.667, '30 s into the 45 s window');
  assert.equal(life.decomp.stageName, 'ash drift');
  assert.equal(life.decomp.nextGenerationAt, 1800000000000 + 45000);
});

test('operators agents: hunger is J2’s clock — 0→1 over 210 s, hungry ≥ 0.72', () => {
  const m = mon('slot-19', 0, 0);
  const a = monsterLifeFor(m, 1800000000000);
  const b = monsterLifeFor(m, 1800000000000 + 210000);
  assert.ok(Math.abs(a.hunger.hunger - b.hunger.hunger) < 0.01, 'same phase one cycle later');
  assert.equal(a.hunger.threshold, 0.72);
  assert.equal(a.hunger.riseS, 210);
  assert.equal(a.hungry, a.hunger.hunger >= 0.72);
});

test('operators agents: diet and habits read the family — stalk habit, solitary, hunt-prey feeding', () => {
  const m = mon('slot-19', 0, 0);
  m.preyTarget = 't-slot-01';
  const life = monsterLifeFor(m, Date.now());
  assert.equal(life.feeding, 'hunt-prey');
  assert.equal(life.habits.activity, 'hunt-prey');
  assert.deepEqual(life.habits.social, { behaviour: 'Solitary', groupSize: 1 });
  assert.match(life.habits.habit, /Circles and closes/);
  assert.match(life.diet.diet, /Stalks other monsters and the hunter/);
});
