// tests/omega-education-levels.test.mjs — Levels for Omega Education.
// Run: node --test tests/omega-education-levels.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_IDS, levelById, levelImageSrc, BACKGROUND_IMAGE_SRC } from '../lib/education/levels.js';

test('six levels, daycare through university, each with id, label, blurb and subs', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['daycare', 'preschool', 'k12', 'trades', 'college', 'university']);
  const ids = new Set();
  for (const lvl of LEVELS) {
    assert.ok(lvl.id && typeof lvl.id === 'string');
    assert.ok(!ids.has(lvl.id), `duplicate level id ${lvl.id}`);
    ids.add(lvl.id);
    assert.ok(lvl.label, `${lvl.id} label`);
    assert.ok(lvl.blurb && lvl.blurb.length > 10, `${lvl.id} blurb`);
    assert.ok(Array.isArray(lvl.subs) && lvl.subs.length >= 3, `${lvl.id} subs`);
  }
  assert.equal(LEVEL_IDS.size, 6);
});

test('levelById returns the level or null', () => {
  assert.equal(levelById('k12').label, 'K-12 schools');
  assert.equal(levelById('trades').label, 'Trades & apprenticeships');
  assert.equal(levelById('nope'), null);
});

test('levelImageSrc maps exactly the six real levels, nothing else', () => {
  for (const lvl of LEVELS) {
    assert.equal(levelImageSrc(lvl.id), `/images/education/${lvl.id}.webp`);
  }
  assert.equal(levelImageSrc(''), null);
  assert.equal(levelImageSrc(null), null);
  assert.equal(levelImageSrc(undefined), null);
  assert.equal(levelImageSrc('technology'), null);
  assert.equal(levelImageSrc('K12'), null);
  assert.equal(levelImageSrc('k-12'), null);
});

test('background image source is the education background', () => {
  assert.equal(BACKGROUND_IMAGE_SRC, '/images/education/background.webp');
});
