// Hollow Earth bolt visuals: which visible bolt a ranged strike throws.
// Run: node app/hollow-earth/tests/bolt-visual.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boltKindFor, BOLT_STYLE, BOLT_SPEED, BOLT_MAX_LIFE } from '../bolt-visual.js';

test('backpack weapon class wins', () => {
  assert.equal(boltKindFor({ meta: { weaponClass: 'firearm' }, name: 'Revolver' }, 'bow'), 'firearm');
  assert.equal(boltKindFor({ meta: { weaponClass: 'bow' }, name: 'Recurve Bow' }, 'staff'), 'bow');
});

test('telling names fall back when no class', () => {
  assert.equal(boltKindFor({ name: 'Longbow of the Wilds' }, 'staff'), 'bow');
  assert.equal(boltKindFor({ name: 'Arcane Wand', description: 'casts spells' }, 'bow'), 'spell');
  assert.equal(boltKindFor({ name: 'Rusty Pipe' }, 'bow'), 'bow'); // hero kind, not the name
  assert.equal(boltKindFor({ name: 'Rusty Pipe' }, 'staff'), 'spell');
});

test('bare fallback is a firearm streak', () => {
  assert.equal(boltKindFor(null, null), 'firearm');
  assert.equal(boltKindFor({ name: 'Unknown Thing' }, 'spear'), 'firearm');
});

test('styles: distinct colors, visible thickness, sane flight', () => {
  assert.equal(BOLT_STYLE.firearm.color, 0xffb347);
  assert.equal(BOLT_STYLE.bow.color, 0xf5d67a);
  assert.equal(BOLT_STYLE.spell.color, 0xc084fc);
  for (const kind of ['firearm', 'bow', 'spell']) {
    assert.ok(BOLT_STYLE[kind].thick >= 0.05, `${kind} thick enough to see`);
    assert.ok(BOLT_STYLE[kind].len >= 0.5, `${kind} long enough to read as a bolt`);
  }
  assert.equal(BOLT_SPEED, 30);
  assert.ok(BOLT_MAX_LIFE >= 1, 'long shots stay visible long enough to cross the field');
});
