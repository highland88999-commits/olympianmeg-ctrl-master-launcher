// tests/omega-education-search.test.mjs — Pure directory search.
// Run: node --test tests/omega-education-search.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTORY } from '../lib/education/directory.js';
import { searchDirectory, keywordMatches, fieldMatches, levelMatches, dedupeEntries } from '../lib/education/search.js';

const REDWATER = { lat: 53.9489, lon: -113.1067 };

test('keyword search matches name, programs and city', () => {
  const out = searchDirectory(DIRECTORY, { q: 'nursing' });
  assert.ok(out.length > 0, 'nursing should match');
  assert.ok(out.every((e) => keywordMatches(e, 'nursing')));
  assert.ok(out.some((e) => e.name === 'University of Alberta'));
  const redwater = searchDirectory(DIRECTORY, { q: 'Redwater' });
  assert.ok(redwater.length > 0);
  assert.ok(redwater.every((e) => e.location.city === 'Redwater' || /redwater/i.test(e.name)));
  assert.equal(searchDirectory(DIRECTORY, { q: 'zzzznope' }).length, 0);
});

test('level filter narrows to that level only', () => {
  for (const level of ['daycare', 'k12', 'trades', 'college', 'university']) {
    const out = searchDirectory(DIRECTORY, { level });
    assert.ok(out.length > 0, `${level} should have entries`);
    assert.ok(out.every((e) => levelMatches(e, level) && e.level === level), `${level} only`);
  }
  assert.equal(searchDirectory(DIRECTORY, { level: 'preschool' }).length, 0);
  assert.equal(searchDirectory(DIRECTORY, { level: 'nope' }).length, DIRECTORY.length);
});

test('field filter: K-12 schools match any field, universities only their own', () => {
  // A K-12 school teaches the full curriculum.
  const k12 = DIRECTORY.find((e) => e.level === 'k12');
  assert.ok(fieldMatches(k12, 'engineering'));
  assert.ok(fieldMatches(k12, 'health'));
  assert.ok(fieldMatches(k12, 'arts'));
  // A university matches only the fields it lists.
  const uofa = DIRECTORY.find((e) => e.name === 'University of Alberta');
  assert.ok(fieldMatches(uofa, 'engineering'));
  assert.ok(!fieldMatches(uofa, 'early-childhood'));
  const auarts = DIRECTORY.find((e) => e.name === 'Alberta University of the Arts');
  assert.ok(fieldMatches(auarts, 'arts'));
  assert.ok(!fieldMatches(auarts, 'engineering'));
  // A field search still returns the local schools alongside the specialists.
  const out = searchDirectory(DIRECTORY, { field: 'engineering', centre: REDWATER, radiusKm: 100 });
  assert.ok(out.some((e) => e.level === 'k12'), 'local K-12 schools show for a field search');
  assert.ok(out.some((e) => e.level === 'university'), 'universities show for a field search');
});

test('radius filter keeps nearby entries and online ones, drops far ones', () => {
  const out = searchDirectory(DIRECTORY, { centre: REDWATER, radiusKm: 25 });
  assert.ok(out.length > 0, 'something is within 25 km of Redwater');
  assert.ok(out.every((e) => e.distanceKm == null || e.distanceKm <= 25), 'all within radius');
  assert.ok(out.some((e) => e.location.city === 'Redwater'), 'Redwater entries inside 25 km');
  assert.ok(out.some((e) => e.online === true), 'online entries pass the radius filter');
  assert.ok(!out.some((e) => e.location.city === 'Toronto'), 'Toronto is not within 25 km of Redwater');
  const wide = searchDirectory(DIRECTORY, { centre: REDWATER, radiusKm: 100 });
  assert.ok(wide.length > out.length, 'a wider radius finds more');
  assert.ok(wide.some((e) => e.location.city === 'Edmonton'), 'Edmonton is within 100 km of Redwater');
});

test('results sort by distance when a centre is known, by name otherwise', () => {
  const near = searchDirectory(DIRECTORY, { centre: REDWATER, radiusKm: 100 });
  const dists = near.map((e) => e.distanceKm).filter((d) => d != null);
  const sorted = [...dists].sort((a, b) => a - b);
  assert.deepEqual(dists, sorted, 'distances ascending');
  const named = searchDirectory(DIRECTORY, { q: 'university' });
  const names = named.map((e) => e.name);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sortedNames, 'names ascending without a centre');
});

test('dedupeEntries drops the same school twice, keeps distinct schools sharing a URL', () => {
  const a = { id: 'x1', url: 'https://example.com/a', name: 'A School' };
  const b = { id: 'x2', url: 'https://example.com/a/', name: 'A School' };
  const c = { id: 'x3', url: 'https://example.com/b', name: 'B School' };
  const d = { id: 'x4', url: 'https://example.com/a', name: 'A Different School' };
  const out = dedupeEntries([a, b, c, d]);
  assert.deepEqual(out.map((e) => e.id), ['x1', 'x3', 'x4']);
});
