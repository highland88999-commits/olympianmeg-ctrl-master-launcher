// Spawn tables, combat rules, senses, safe base, dragons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONSTER_TYPES, DRAGON_TYPES, ARCHETYPES, MONSTER_MODELS, TYPES_BY_ELEMENT,
  spawnField, createMonster, stepMonster, damageMonster, strike,
  createHunterState, onMonsterKilled, applyDamage,
  SHIELD_KILLS, SHIELD_ABSORB, HEAL_ON_KILL, PLAYER_MAX_HP,
  KORUS_MAX_HP, KORUS_GATE_KILLS, createKorus, stepKorus, damageKorus,
  SAFE_BASE, isInBase, canTeleport, BASE_TELEPORT_COOLDOWN_S,
  GIVE_UP_S, ELEMENTS, ELEMENT_COLORS,
} from '../spawns.js';
import { MONSTER_FAMILIES, ALL_MONSTER_SLOTS, slotHome, slotKey, FAMILIES_BY_HABITAT } from '../families.js';
import { PLACED_FIELD_KEYS } from '../models.js';

const rng = () => 0.5;
function mon(type, x, z, faceYaw = 0) {
  const m = createMonster({ id: `t-${type}`, type, element: MONSTER_TYPES[type].element, x, z }, rng);
  m.faceYaw = faceYaw;
  m.active = true;
  return m;
}
const alwaysLos = () => true;
const neverLos = () => false;

test('every regular monster sits inside the 100–200 HP band', () => {
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    assert.ok(t.hp >= 100 && t.hp <= 200, `${key} hp ${t.hp} outside 100–200`);
  }
});

test('every monster carries exactly one of the four archetypes, all four represented', () => {
  const seen = new Set();
  for (const [key, t] of Object.entries(MONSTER_TYPES)) {
    assert.ok(t.archetype in ARCHETYPES, `${key} archetype ${t.archetype} unknown`);
    seen.add(t.archetype);
  }
  assert.deepEqual([...seen].sort(), ['environmental', 'melee', 'ranged', 'short-range']);
});

test('archetype range bands are distinct (melee 2.6 < short-range 5 < ranged 22)', () => {
  assert.ok(ARCHETYPES.melee.range < ARCHETYPES['short-range'].range);
  assert.ok(ARCHETYPES['short-range'].range < ARCHETYPES.ranged.range);
  assert.ok(ARCHETYPES.environmental.hazard === true);
});

test('Korus is exactly 1000 HP and the gate is a documented constant', () => {
  assert.equal(KORUS_MAX_HP, 1000);
  const k = createKorus(false);
  assert.equal(k.hp, 1000);
  assert.equal(k.dormant, true);
  assert.ok(KORUS_GATE_KILLS > 0);
  const open = createKorus(true);
  assert.equal(open.dormant, false);
});

test('spawn field: 153 records (150 + 3 Stormwings), none inside the safe base, placed types only', () => {
  const bands = ['acid', 'fire', 'lightning', 'poison', 'shadow', 'sand', 'mountain', 'frost'];
  const habitatAt = (x, z) => bands[(Math.abs(Math.floor(x / 50)) + Math.abs(Math.floor(z / 50))) % 8];
  const field = spawnField(77701, { habitatAt });
  assert.equal(field.length, 153, `field has ${field.length} records, expected 153`);
  for (const rec of field) {
    assert.ok(Math.hypot(rec.x - SAFE_BASE.x, rec.z - SAFE_BASE.z) >= SAFE_BASE.r + 10, 'spawn inside the Haven');
  }
  // GLB-ONLY: only Stormwing spawns among dragons — cinder
  // and muse GLBs are truncated, so they have no field presence.
  assert.equal(field.filter((r) => r.type === 'sky-dragon').length, 3, 'sky-dragon count');
  assert.equal(field.filter((r) => r.type === 'cinder-dragon').length, 0, 'cinder-dragon must not spawn');
  assert.equal(field.filter((r) => r.type === 'muse-dragon').length, 0, 'muse-dragon must not spawn');
});

test('heal on kill is modest and capped at max HP', () => {
  const h = createHunterState();
  h.hp = PLAYER_MAX_HP - 5;
  const res = onMonsterKilled(h);
  assert.equal(res.heal, 5);
  assert.equal(h.hp, PLAYER_MAX_HP);
  assert.ok(HEAL_ON_KILL <= 20, `heal ${HEAL_ON_KILL} too generous`);
});

test('shield arrives at 30 kills, absorbs 50, one-time until broken', () => {
  const h = createHunterState();
  for (let i = 0; i < SHIELD_KILLS - 1; i++) onMonsterKilled(h);
  assert.equal(h.shield, 0);
  const res = onMonsterKilled(h);
  assert.equal(res.shieldGranted, true);
  assert.equal(h.shield, SHIELD_ABSORB);
  const absorbed = applyDamage(h, 30);
  assert.equal(absorbed.absorbed, 30);
  assert.equal(h.hp, PLAYER_MAX_HP);
  assert.equal(h.shield, 20);
  const absorbed2 = applyDamage(h, 40);
  assert.equal(absorbed2.absorbed, 20);
  assert.equal(absorbed2.shieldBroken, true);
  assert.equal(h.hp, PLAYER_MAX_HP - 20);
});

test('kill count persists in the hunter state', () => {
  const h = createHunterState();
  onMonsterKilled(h);
  onMonsterKilled(h);
  assert.equal(h.kills, 2);
});

test('senses: sight cone spots, facing away does not', () => {
  // Monster faces +z (faceYaw 0 means facing +z in atan2(dx,dz) terms).
  const facing = mon('slot-06', 0, 0, 0);
  const inFront = { x: 0, z: 20 };
  stepMonster(facing, 0.1, inFront, rng, { losClear: alwaysLos });
  assert.equal(facing.spotted, true);
  const behind = mon('slot-06', 0, 0, 0);
  stepMonster(behind, 0.1, { x: 0, z: -20 }, rng, { losClear: alwaysLos });
  assert.equal(behind.spotted, false);
});

test('senses: terrain line-of-sight blocks the sight cone', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, false);
});

test('senses: hearing draws a monster outside the cone', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 20, z: 0 }, rng, { losClear: alwaysLos, noise: { x: 5, z: 5 } });
  assert.equal(m.spotted, true);
});

test('senses: proximity spots regardless of facing or cover', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: -5 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, true);
});

test('senses: ambushers ignore sight and hearing, trigger on proximity', () => {
  const m = mon('slot-29', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, noise: { x: 2, z: 2 } });
  assert.equal(m.spotted, false);
  stepMonster(m, 0.1, { x: 0, z: 5 }, rng, { losClear: neverLos });
  assert.equal(m.spotted, true);
});

test('senses: quiet hunters shrink the sight radius', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos, quiet: 0.55 });
  assert.equal(m.spotted, false);
});

test('senses: give-up after 12 s unseen returns the monster to roam', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos });
  assert.equal(m.spotted, true);
  for (let i = 0; i < GIVE_UP_S; i++) {
    stepMonster(m, 1, { x: 0, z: -100 }, rng, { losClear: neverLos });
  }
  assert.equal(m.spotted, false);
  assert.equal(m.state, 'idle');
});

test('senses: chases break at the safe-base boundary', () => {
  const m = mon('slot-06', 0, 0, 0);
  stepMonster(m, 0.1, { x: 0, z: 20 }, rng, { losClear: alwaysLos });
  assert.equal(m.spotted, true);
  stepMonster(m, 0.1, { x: SAFE_BASE.x, z: SAFE_BASE.z }, rng, { losClear: alwaysLos, inBase: true });
  assert.equal(m.spotted, false);
});

test('safe base: inside the ring, outside it, teleport cooldown', () => {
  assert.equal(isInBase(SAFE_BASE.x, SAFE_BASE.z), true);
  assert.equal(isInBase(SAFE_BASE.x, SAFE_BASE.z + SAFE_BASE.r + 1), false);
  assert.equal(canTeleport(null, 1000), true);
  assert.equal(canTeleport(1000, 1000 + BASE_TELEPORT_COOLDOWN_S * 1000), true);
  assert.equal(canTeleport(1000, 1000 + BASE_TELEPORT_COOLDOWN_S * 1000 - 1), false);
});

test('spawn field excludes the base radius + 10 m', () => {
  const field = spawnField(42, { habitatAt: () => 'sand' });
  for (const rec of field) {
    assert.ok(Math.hypot(rec.x - SAFE_BASE.x, rec.z - SAFE_BASE.z) >= SAFE_BASE.r + 10);
  }
});

/* ---------------- dragons ---------------- */

test('exactly three dragon types, distinct elements and archetypes', () => {
  assert.deepEqual([...DRAGON_TYPES].sort(), ['cinder-dragon', 'muse-dragon', 'sky-dragon']);
  const els = new Set(DRAGON_TYPES.map((d) => MONSTER_TYPES[d].element));
  assert.equal(els.size, 3);
  const archs = new Set(DRAGON_TYPES.map((d) => MONSTER_TYPES[d].archetype));
  assert.equal(archs.size, 3);
  assert.ok(archs.has('ranged') && archs.has('melee') && archs.has('environmental'));
});

test('dragon roles span fly, ground, and both', () => {
  assert.equal(MONSTER_TYPES['sky-dragon'].role, 'fly');
  assert.equal(MONSTER_TYPES['cinder-dragon'].role, 'ground');
  assert.equal(MONSTER_TYPES['muse-dragon'].role, 'both');
  assert.ok(MONSTER_TYPES['sky-dragon'].flyHeight > MONSTER_TYPES['muse-dragon'].flyHeight);
});

test('dragons sit inside the same 100–200 HP band', () => {
  for (const d of DRAGON_TYPES) {
    const t = MONSTER_TYPES[d];
    assert.ok(t.hp >= 100 && t.hp <= 200, `${d} hp ${t.hp}`);
  }
});

test('the Muse dragon is the tribute entry: luminous, violet-and-cyan, the wiser one', () => {
  const t = MONSTER_TYPES['muse-dragon'];
  assert.equal(t.tribute, 'muse');
  assert.equal(t.name, 'Muse, the Luminous');
  assert.ok(t.temperament.vicious < MONSTER_TYPES['sky-dragon'].temperament.vicious);
  assert.ok(t.temperament.vicious < MONSTER_TYPES['cinder-dragon'].temperament.vicious);
});

test('strike: melee cannot reach the sky dragon, but can reach the low-hovering Muse dragon', () => {
  const sky = mon('sky-dragon', 0, -2, 0);
  const muse = mon('muse-dragon', 0, -2, 0);
  const meleeSpec = { dmg: 38, range: 2.4, arcCos: Math.cos(1.22) };
  // Walker yaw 0 faces -z (forward = (-sin 0, -cos 0) = (0,-1)),
  // so both dragons at (0,-2) sit dead ahead.
  const hits = strike([sky, muse], 0, 0, 0, meleeSpec);
  assert.ok(!hits.includes(sky), 'melee must not reach the sky dragon at 6 m');
  assert.ok(hits.includes(muse), 'melee must reach the Muse dragon at 3 m');
  const boltSpec = { dmg: 30, range: 28, arcCos: Math.cos(0.21) };
  const hits2 = strike([sky, muse], 0, 0, 0, boltSpec);
  assert.ok(hits2.includes(sky), 'ranged must reach the sky dragon');
});

test('GLB-only field: every record is a placed family, and the vanish list is exact', () => {
  // 51 type-table keys (37 slots + 11 extras + 3 dragons)
  // minus 24 placed field keys = 27 vanished types.
  const placed = new Set(PLACED_FIELD_KEYS);
  assert.equal(placed.size, 24, `placed field keys ${placed.size}`);
  const vanished = Object.keys(MONSTER_TYPES).filter((k) => !placed.has(k));
  assert.equal(vanished.length, 27, `vanished ${vanished.length}: ${vanished.join(',')}`);
  const expected = [
    'slot-02', 'slot-03', 'slot-05', 'slot-06', 'slot-09', 'slot-12',
    'slot-16', 'slot-18', 'slot-21', 'slot-24', 'slot-25', 'slot-27',
    'slot-28', 'slot-33', 'slot-34', 'slot-35', 'slot-36', 'slot-37',
    'slot-38', 'slot-39', 'slot-40',
    'umbrax', 'frostbite-lizard', 'vice', 'wonder',
    'cinder-dragon', 'muse-dragon',
  ];
  assert.deepEqual([...vanished].sort(), [...expected].sort());
  const field = spawnField(77701, { habitatAt: () => 'sand' });
  for (const rec of field) {
    assert.ok(placed.has(rec.type), `${rec.type} spawns but has no placed GLB`);
  }
  assert.ok(!field.some((r) => vanished.includes(r.type)), 'a vanished family spawns');
});

test('Korus fight: dormant until the gate, wakes in range, telegraphs, dies', () => {
  const k = createKorus(false);
  const evs = stepKorus(k, 0.1, { x: KORUS_POS_X(), z: KORUS_POS_Z() });
  assert.equal(k.awake, false);
  assert.ok(!evs.some((e) => e.kind === 'wake'));
  const k2 = createKorus(true);
  stepKorus(k2, 0.1, { x: KORUS_POS_X(), z: KORUS_POS_Z() });
  assert.equal(k2.awake, true);
  const died = damageKorus(k2, 1000);
  assert.equal(died, true);
  assert.equal(k2.dead, true);
});

function KORUS_POS_X() { return -215; }
function KORUS_POS_Z() { return 55; }
