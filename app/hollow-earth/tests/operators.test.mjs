// Operator life lines: the lightning-aura field (Merlin,
// Nov 16 ~00:11). monsterLifeFor gains `aura` — the shared
// auraFor() object for live lightning sources, null otherwise;
// Korus and Ghorrum are aura-null by design, each with a note.
// No operators test file existed before this one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterLifeFor, korusLifeFor, watcherLifeFor } from '../operators.js';
import { MONSTER_TYPES, createMonster, createKorus } from '../spawns.js';
import { AURA_R_M, LIGHTNING_COLORS } from '../../../lib/lightning-aura.js';

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

test('operators aura: every dragon carries a 59 m red aura', () => {
  for (const d of ['sky-dragon', 'cinder-dragon', 'muse-dragon']) {
    const life = monsterLifeFor(mon(d, 0, 0));
    assert.equal(life.aura.radiusM, 59, d);
    assert.deepEqual(life.aura.color, LIGHTNING_COLORS.dragon, d);
    assert.match(life.auraNote, /Red/);
  }
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

test('operators aura: non-lightning families get aura null', () => {
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    if (t.element === 'lightning' || t.dragon) continue;
    const life = monsterLifeFor(mon(key, 0, 0));
    assert.equal(life.aura, null, `${key} must have no aura`);
  }
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
  // A non-lightning monster never hunts prey — no aura, no prey.
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
