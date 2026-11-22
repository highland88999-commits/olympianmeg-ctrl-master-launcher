// tests/omega-education-fields.test.mjs — Fields of study (CIP-grounded).
// Run: node --test tests/omega-education-fields.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, FIELD_IDS, fieldById, fieldForKeywords } from '../lib/education/fields.js';

test('fourteen fields, each with id, label, blurb and a CIP code or null', () => {
  assert.equal(FIELDS.length, 14);
  const ids = new Set();
  for (const f of FIELDS) {
    assert.ok(f.id && typeof f.id === 'string');
    assert.ok(!ids.has(f.id), `duplicate field id ${f.id}`);
    ids.add(f.id);
    assert.ok(f.label, `${f.id} label`);
    assert.ok(f.blurb && f.blurb.length > 10, `${f.id} blurb`);
    if (f.cip != null) {
      assert.match(f.cip, /^\d{2}$/, `${f.id} CIP must be two digits, got ${f.cip}`);
    }
  }
  assert.equal(FIELD_IDS.size, 14);
  assert.equal(fieldById('general').cip, null);
  assert.equal(fieldById('engineering').cip, '14');
  assert.equal(fieldById('health').cip, '51');
  assert.equal(fieldById('computing').cip, '11');
  assert.equal(fieldById('trades').cip, '46');
  assert.equal(fieldById('nope'), null);
});

test('fieldForKeywords names the field a typed word means', () => {
  assert.equal(fieldForKeywords('welder'), 'trades');
  assert.equal(fieldForKeywords('I want to be a nurse'), 'health');
  assert.equal(fieldForKeywords('computer science degree'), 'computing');
  assert.equal(fieldForKeywords('daycare near me'), 'early-childhood');
  assert.equal(fieldForKeywords('law school'), 'law');
  assert.equal(fieldForKeywords(''), null);
  assert.equal(fieldForKeywords(null), null);
  assert.equal(fieldForKeywords('something with no field in it'), null);
});
