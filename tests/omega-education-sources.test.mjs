// tests/omega-education-sources.test.mjs — Source registry.
// Run: node --test tests/omega-education-sources.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_REGISTRY, getSourceRegistry, sourceById, liveSources, stagedSources } from '../lib/education/sources.js';

test('registry: the directory is live, Scorecard is staged without a key', () => {
  const dir = sourceById('omega-directory');
  assert.ok(dir);
  assert.equal(dir.status, 'live');
  assert.ok(dir.notes && dir.notes.includes('615'), 'directory note carries the entry count');
  const sc = sourceById('college-scorecard');
  assert.ok(sc);
  assert.equal(sc.status, 'staged');
  assert.ok(sc.gap && sc.gap.includes('SCORECARD_API_KEY'), 'Scorecard gap names the env var');
  // Every staged source states its exact gap; every live source has notes.
  for (const s of SOURCE_REGISTRY) {
    assert.ok(s.id && s.name && s.url, `${s.id} shape`);
    if (s.status === 'staged') assert.ok(s.gap && s.gap.length > 20, `${s.id} gap`);
    if (s.status === 'live') assert.ok(s.notes && s.notes.length > 20, `${s.id} notes`);
  }
  const ids = new Set(SOURCE_REGISTRY.map((s) => s.id));
  assert.equal(ids.size, SOURCE_REGISTRY.length, 'no duplicate source ids');
});

test('getSourceRegistry flips Scorecard live when the key is set, and never mutates the base', () => {
  const without = getSourceRegistry({});
  assert.equal(without.find((s) => s.id === 'college-scorecard').status, 'staged');
  const withKey = getSourceRegistry({ SCORECARD_API_KEY: 'test-key' });
  const sc = withKey.find((s) => s.id === 'college-scorecard');
  assert.equal(sc.status, 'live');
  assert.ok(sc.notes && sc.notes.includes('1,000'), 'live note carries the rate limit');
  assert.equal(sc.gap, undefined, 'live entry carries no gap');
  // The static base is untouched by the flip.
  assert.equal(SOURCE_REGISTRY.find((s) => s.id === 'college-scorecard').status, 'staged');
  assert.equal(liveSources({ SCORECARD_API_KEY: 'k' }).length, 2);
  assert.equal(stagedSources({}).length, SOURCE_REGISTRY.length - 1);
});
