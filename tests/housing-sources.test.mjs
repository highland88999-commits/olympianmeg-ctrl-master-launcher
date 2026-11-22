// tests/housing-sources.test.mjs — Housing source registry honesty.
// Run: node --test tests/housing-sources.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_REGISTRY, getSourceRegistry, liveSources, stagedSources, sourceById,
} from '../lib/housing/sources.js';

test('registry: 20 sources, 1 live, 19 staged without keys', () => {
  assert.equal(SOURCE_REGISTRY.length, 20);
  assert.equal(liveSources({}).length, 1);
  assert.equal(liveSources({})[0].id, 'osm-stays');
  assert.equal(stagedSources({}).length, 19);
});

test('registry: every entry has an id, name, kind, status, url — and every staged entry states its gap', () => {
  const ids = new Set();
  for (const s of SOURCE_REGISTRY) {
    assert.ok(s.id && !ids.has(s.id), `unique id: ${s.id}`);
    ids.add(s.id);
    assert.ok(s.name, `${s.id}: name`);
    assert.ok(s.kind, `${s.id}: kind`);
    assert.ok(s.status === 'live' || s.status === 'staged', `${s.id}: status`);
    assert.ok(/^https?:\/\//.test(s.url), `${s.id}: url`);
    if (s.status === 'staged') {
      assert.ok(typeof s.gap === 'string' && s.gap.length > 20, `${s.id}: gap in plain words`);
    }
  }
});

test('registry: the two documented dead ends say so and are never live', () => {
  assert.equal(sourceById('zillow').status, 'staged');
  assert.match(sourceById('zillow').gap, /DEAD END/);
  assert.equal(sourceById('amadeus').status, 'staged');
  assert.match(sourceById('amadeus').gap, /DEAD END/);
});

test('registry: Redfin flips live when RAPIDAPI_KEY is set, staged without it', () => {
  const off = getSourceRegistry({}).find((s) => s.id === 'redfin-listings');
  assert.equal(off.status, 'staged');
  assert.match(off.gap, /RAPIDAPI_KEY/);
  const on = getSourceRegistry({ RAPIDAPI_KEY: 'test-key-not-real' }).find((s) => s.id === 'redfin-listings');
  assert.equal(on.status, 'live');
  assert.ok(on.notes, 'live note');
  assert.equal(on.gap, undefined);
  assert.equal(liveSources({ RAPIDAPI_KEY: 'test-key-not-real' }).length, 2);
});

test('registry: sections split the board three ways', () => {
  const kinds = new Set(SOURCE_REGISTRY.map((s) => s.kind));
  assert.ok(kinds.has('temporary'));
  assert.ok(kinds.has('commercial'));
});
