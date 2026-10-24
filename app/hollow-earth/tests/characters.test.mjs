// Character roster: the Monster Hunter default, the imported
// Middle-earth heroes (stats verbatim), and the exclusions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, HERO_ORDER, DEFAULT_HERO, heroDef, HERO_MODEL } from '../characters.js';

test('default hero is the realm’s own Monster Hunter', () => {
  assert.equal(DEFAULT_HERO, 'monster-hunter');
  assert.equal(HERO_ORDER[0], 'monster-hunter');
  const h = heroDef(DEFAULT_HERO);
  assert.equal(h.name, 'Kael, the Monster Hunter');
  assert.ok(h.trait && h.trait.toLowerCase().includes('tracking'));
  assert.equal(h.maxHp, 120);
  assert.equal(h.meleeDmg, 38);
  assert.equal(h.meleeClass, 'spear');
  assert.equal(h.ranged.dmg, 30);
});

test('all five Middle-earth heroes are imported with verbatim stats', () => {
  const expected = {
    wizard: { maxHp: 100, meleeDmg: 30, rangedDmg: 30, rangedRange: 26 },
    ranger: { maxHp: 110, meleeDmg: 36, rangedDmg: 26, rangedRange: 30 },
    'elf-archer': { maxHp: 95, meleeDmg: 30, rangedDmg: 34, rangedRange: 38 },
    dwarf: { maxHp: 135, meleeDmg: 44, rangedDmg: 20, rangedRange: 24 },
    halfling: { maxHp: 90, meleeDmg: 28, rangedDmg: 22, rangedRange: 26 },
  };
  for (const [key, exp] of Object.entries(expected)) {
    const h = HEROES[key];
    assert.ok(h, `${key} missing`);
    assert.equal(h.realm, 'Middle-earth');
    assert.equal(h.maxHp, exp.maxHp, `${key} maxHp`);
    assert.equal(h.meleeDmg, exp.meleeDmg, `${key} meleeDmg`);
    assert.equal(h.ranged.dmg, exp.rangedDmg, `${key} ranged dmg`);
    assert.equal(h.ranged.range, exp.rangedRange, `${key} ranged range`);
  }
});

test('roster is exactly six: hunter + five Middle-earth heroes', () => {
  assert.deepEqual(HERO_ORDER, ['monster-hunter', 'wizard', 'ranger', 'elf-archer', 'dwarf', 'halfling']);
});

test('Star Wars placed characters are excluded (no hero stats in their home program)', () => {
  assert.ok(!HEROES['jedi-knight']);
  assert.ok(!HEROES['sith-lord']);
  assert.ok(!HEROES['jedi']);
  assert.ok(!HEROES['sith']);
});

test('non-playable Middle-earth cast and creatures are excluded', () => {
  assert.ok(!HEROES['dark-lord']);
  assert.ok(!HEROES['white-wizard']);
  assert.ok(!HEROES['saruman']);
  assert.ok(!HEROES['horse']);
  assert.ok(!HEROES['eagle']);
  assert.ok(!HEROES['warg']);
  assert.ok(!HEROES['dragon']);
  assert.ok(!HEROES['fell-beast']);
});

test('heroDef falls back to the Monster Hunter for unknown keys', () => {
  assert.equal(heroDef('nope').key, 'monster-hunter');
});

test('the Monster Hunter’s Tripo landing path is registered', () => {
  assert.equal(HERO_MODEL['monster-hunter'].url, '/models/hollow-earth/monster-hunter.glb');
  assert.equal(HERO_MODEL['monster-hunter'].height, 1.9);
});

test('every hero has a reticle-derivable melee and ranged class', () => {
  const meleeClasses = new Set(['blade', 'blunt', 'cane', 'staff', 'spear']);
  const rangedKinds = new Set(['bow', 'staff']);
  for (const key of HERO_ORDER) {
    const h = HEROES[key];
    assert.ok(meleeClasses.has(h.meleeClass), `${key} meleeClass ${h.meleeClass}`);
    assert.ok(rangedKinds.has(h.ranged.kind), `${key} ranged kind ${h.ranged.kind}`);
  }
});
