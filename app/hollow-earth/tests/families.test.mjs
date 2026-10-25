// Monster-first families: every slot has a home, every family
// is valid, and the spawn field puts families in their own
// habitat bands — the world built around the monsters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONSTER_FAMILIES, ALL_MONSTER_SLOTS, BOSS_SLOT, slotHome, slotKey,
  FAMILIES_BY_HABITAT, FAMILIES_BY_ELEMENT, FAMILY_KEYS,
} from '../families.js';
import {
  MONSTER_TYPES, DRAGON_TYPES, ARCHETYPES, MONSTER_MODELS, KORUS_MODEL,
  spawnField, createMonster, buildMonsterFigure, ELEMENTS, ELEMENT_COLORS,
  SAFE_BASE, KORUS_POS,
} from '../spawns.js';
import { BIOMES, BIOME_IDS, biomeAt } from '../biomes.js';

test('all 38 unique monster slots have a home: 37 families + Korus the boss', () => {
  assert.equal(ALL_MONSTER_SLOTS.length, 38);
  assert.ok(!ALL_MONSTER_SLOTS.includes(4), 'slot 4 is the banner, not a monster');
  for (const dup of [15, 31, 41, 42]) {
    assert.ok(!ALL_MONSTER_SLOTS.includes(dup), `slot ${dup} is a duplicate, not unique`);
  }
  let families = 0;
  let bosses = 0;
  for (const slot of ALL_MONSTER_SLOTS) {
    const home = slotHome(slot);
    if (home === 'family') families++;
    else if (home === 'boss') bosses++;
    else assert.fail(`slot ${slot} has no home`);
  }
  assert.equal(families, 37);
  assert.equal(bosses, 1);
  assert.equal(slotHome(BOSS_SLOT), 'boss');
  assert.equal(FAMILY_KEYS.length, 37);
});

test('non-monster slots have no home', () => {
  assert.equal(slotHome(4), null);
  assert.equal(slotHome(15), null);
  assert.equal(slotHome(31), null);
  assert.equal(slotHome(41), null);
  assert.equal(slotHome(42), null);
  assert.equal(slotHome(99), null);
});

test('every family is valid: element, attitude, archetype, habitat, HP band', () => {
  for (const key of FAMILY_KEYS) {
    const f = MONSTER_FAMILIES[key];
    assert.equal(key, slotKey(f.slot), `${key} key does not match its slot`);
    assert.ok(f.name && f.name.length > 0, `${key} has no name`);
    assert.ok(ELEMENTS.includes(f.element), `${key} element ${f.element} unknown`);
    assert.ok(['stalk', 'charge', 'ambush'].includes(f.attitude), `${key} attitude ${f.attitude} unknown`);
    assert.ok(f.archetype in ARCHETYPES, `${key} archetype ${f.archetype} unknown`);
    assert.ok(BIOME_IDS.includes(f.habitat), `${key} habitat ${f.habitat} is not a band`);
    assert.ok(['beast', 'vortex'].includes(f.form), `${key} form ${f.form} unknown`);
    assert.ok(f.hp >= 100 && f.hp <= 200, `${key} hp ${f.hp} outside 100–200`);
    assert.ok(f.dmg > 0 && f.speed > 0 && f.scaleM > 0 && f.footprintR > 0, `${key} has a non-positive stat`);
    assert.ok(ELEMENT_COLORS[f.element] != null, `${key} element ${f.element} has no colour`);
  }
});

test('all four archetypes and all three attitudes are represented across families alone', () => {
  const archs = new Set(Object.values(MONSTER_FAMILIES).map((f) => f.archetype));
  assert.deepEqual([...archs].sort(), ['environmental', 'melee', 'ranged', 'short-range']);
  const atts = new Set(Object.values(MONSTER_FAMILIES).map((f) => f.attitude));
  assert.deepEqual([...atts].sort(), ['ambush', 'charge', 'stalk']);
});

test('every habitat band holds at least one family, and the tables agree with the families', () => {
  for (const id of BIOME_IDS) {
    assert.ok((FAMILIES_BY_HABITAT[id] || []).length >= 1, `band ${id} holds no family`);
  }
  for (const key of FAMILY_KEYS) {
    const f = MONSTER_FAMILIES[key];
    assert.ok(FAMILIES_BY_HABITAT[f.habitat].includes(key), `${key} missing from its habitat table`);
    assert.ok(FAMILIES_BY_ELEMENT[f.element].includes(key), `${key} missing from its element table`);
    assert.equal(MONSTER_TYPES[key].habitat, f.habitat, `${key} type table habitat drifted`);
    assert.equal(MONSTER_TYPES[key].name, f.name, `${key} type table name drifted`);
  }
});

test('model mapping is slot-keyed and swappable, dragons keep named seats, Korus his own', () => {
  for (const key of FAMILY_KEYS) {
    assert.equal(MONSTER_MODELS[key].url, `/models/hollow-earth/${key}.glb`);
  }
  assert.equal(MONSTER_MODELS['sky-dragon'].url, '/models/hollow-earth/sky-dragon.glb');
  assert.equal(MONSTER_MODELS['cinder-dragon'].url, '/models/hollow-earth/cinder-dragon.glb');
  assert.equal(MONSTER_MODELS['muse-dragon'].url, '/models/hollow-earth/muse-dragon.glb');
  assert.equal(KORUS_MODEL.url, '/models/hollow-earth/korus.glb');
});

test('the frost element and Frozen Reaches band exist for the ice yeti', () => {
  assert.ok(ELEMENTS.includes('frost'));
  assert.ok(ELEMENT_COLORS.frost != null);
  assert.equal(BIOMES.frost.element, 'frost');
  assert.equal(MONSTER_FAMILIES['slot-10'].element, 'frost');
  assert.equal(MONSTER_FAMILIES['slot-10'].habitat, 'frost');
  assert.equal(MONSTER_FAMILIES['slot-10'].name, 'Ice Yeti');
});

test('Korus’s court stands deep in the shadow band', () => {
  assert.equal(biomeAt(KORUS_POS.x, KORUS_POS.z).dominant, 'shadow');
  assert.equal(biomeAt(BIOMES.shadow.anchor.x, BIOMES.shadow.anchor.z).dominant, 'shadow');
});

test('spawn field with the real biome field: every family appears, in its own band', () => {
  const field = spawnField(77701, { habitatAt: (x, z) => biomeAt(x, z).dominant });
  assert.ok(field.length >= 150, `field has ${field.length} records`);
  const seen = new Set(field.map((r) => r.type));
  for (const key of FAMILY_KEYS) {
    assert.ok(seen.has(key), `family ${key} never spawns`);
  }
  for (const d of DRAGON_TYPES) {
    assert.equal(field.filter((r) => r.type === d).length, 3, `${d} count`);
  }
  for (const rec of field) {
    const band = biomeAt(rec.x, rec.z).dominant;
    assert.equal(band, MONSTER_TYPES[rec.type].habitat, `${rec.type} at ${rec.x},${rec.z} sits in ${band}, not its ${MONSTER_TYPES[rec.type].habitat} band`);
    assert.ok(Math.hypot(rec.x - SAFE_BASE.x, rec.z - SAFE_BASE.z) >= SAFE_BASE.r + 10, 'spawn inside the Haven');
  }
});

test('vortex families get a funnel stand-in, not a quadruped', () => {
  class G { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } }
  class Mesh { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = { set: () => {} }; this.rotation = {}; this.scale = { set: () => {} }; } }
  const R = {
    Group: G, Mesh,
    SphereGeometry: class {}, CylinderGeometry: class {}, ConeGeometry: class {}, BoxGeometry: class {},
    MeshStandardMaterial: class { constructor(m) { Object.assign(this, m); } },
  };
  const m = createMonster({ id: 't-vortex', type: 'slot-05', element: 'sand', x: 0, z: 0 }, () => 0.5);
  const fig = buildMonsterFigure(R, m);
  assert.equal(fig.userData.form, 'vortex');
  assert.equal(fig.userData.modelPath, MONSTER_MODELS['slot-05'].url);
  assert.ok(fig.children.length >= 4, `vortex figure has ${fig.children.length} parts`);
  const beast = createMonster({ id: 't-beast', type: 'slot-06', element: 'fire', x: 0, z: 0 }, () => 0.5);
  const beastFig = buildMonsterFigure(R, beast);
  assert.equal(beastFig.userData.form, undefined);
});
