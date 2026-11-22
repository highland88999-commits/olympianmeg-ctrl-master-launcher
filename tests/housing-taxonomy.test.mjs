// tests/housing-taxonomy.test.mjs — Housing sections and property types.
// Run: node --test tests/housing-taxonomy.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS, sectionById, PROPERTY_TYPES, typeForKeywords, typeLabel,
} from '../lib/housing/taxonomy.js';

test('sections: exactly three, in the user’s words', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ['real-estate', 'rentals', 'temporary']);
  assert.equal(sectionById('real-estate').label, 'Real Estate');
  assert.equal(sectionById('rentals').label, 'Rentals');
  assert.equal(sectionById('temporary').label, 'Temporary');
  assert.equal(sectionById('nope'), null);
});

test('types: the fixed list covers houses, condos, land and stays', () => {
  const ids = PROPERTY_TYPES.map((t) => t.id);
  for (const want of ['house', 'condo', 'townhouse', 'duplex', 'land', 'hotel', 'hostel', 'guest-house', 'motel']) {
    assert.ok(ids.includes(want), want);
  }
  assert.equal(typeLabel('house'), 'House');
  assert.equal(typeLabel('nope'), null);
});

test('typeForKeywords: maps a listing’s own words, never guesses', () => {
  assert.equal(typeForKeywords('3-bed detached house with garage'), 'house');
  assert.equal(typeForKeywords('Downtown condo, 2 bed 2 bath'), 'condo');
  assert.equal(typeForKeywords('Riverside Hostel — dorms from $30'), 'hostel');
  assert.equal(typeForKeywords('Grand Hotel & Suites'), 'hotel');
  assert.equal(typeForKeywords('Vacant lot, 0.5 acre'), 'land');
  assert.equal(typeForKeywords('A lovely place'), null);
  assert.equal(typeForKeywords(''), null);
  assert.equal(typeForKeywords(null), null);
});
