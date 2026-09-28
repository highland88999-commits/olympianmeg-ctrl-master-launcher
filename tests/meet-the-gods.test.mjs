// Tests for the Meet the Gods module: codex data + query helpers + scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GODS,
  ALL_DOMAINS,
  getGod,
  searchGods,
  filterByDomain,
  searchAndFilter,
} from '../app/meet-the-gods/gods.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'meet-the-gods');
const allCode = readdirSync(appDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.jsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'))
  .join('\n');

// ---------- Static scans ----------

test('no telemetry or tracking strings in built files', () => {
  const banned = [
    'supabase', 'ipify', 'central_telemetry', 'track_ping', 'nexus_visitor_id',
    'logBrainAction', 'brain-uplink', 'OMEGA MIND', 'connected_repos', 'api.ipify',
  ];
  for (const s of banned) {
    assert.ok(!allCode.includes(s), `banned string present: ${s}`);
  }
});

test('no external URLs, iframes, video tags, or mailto links', () => {
  assert.ok(!allCode.includes('https://'), 'no https URLs allowed');
  assert.ok(!allCode.includes('http://'), 'no http URLs allowed');
  assert.ok(!/<iframe/i.test(allCode), 'no iframes allowed');
  assert.ok(!/<video/i.test(allCode), 'no video tags allowed');
  assert.ok(!allCode.includes('mailto:'), 'no mailto links allowed');
});

test('no CDN libraries or font imports', () => {
  const banned = ['unpkg', 'jsdelivr', 'cdnjs', 'tailwindcss', 'font-awesome', 'fonts.googleapis', 'three.js', 'three@', 'THREE.', 'vercel.app'];
  for (const s of banned) {
    assert.ok(!allCode.includes(s), `banned dependency present: ${s}`);
  }
  assert.ok(!allCode.toLowerCase().includes('import * as three'), 'three.js import found');
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

// ---------- Codex data ----------

test('pantheon has fourteen complete entries', () => {
  assert.equal(GODS.length, 14);
  const ids = new Set();
  for (const g of GODS) {
    assert.ok(g.id && !ids.has(g.id), `duplicate or missing id: ${g.id}`);
    ids.add(g.id);
    assert.ok(g.name, `${g.id} missing name`);
    assert.ok(g.greek, `${g.id} missing greek name`);
    assert.ok(g.roman, `${g.id} missing roman name`);
    assert.ok(Array.isArray(g.domains) && g.domains.length > 0, `${g.id} missing domains`);
    assert.ok(Array.isArray(g.epithets) && g.epithets.length > 0, `${g.id} missing epithets`);
    assert.ok(Array.isArray(g.symbols) && g.symbols.length > 0, `${g.id} missing symbols`);
    assert.ok(g.summary && g.summary.length > 40, `${g.id} summary too short`);
    assert.match(g.color, /^#[0-9a-f]{6}$/i, `${g.id} bad color`);
  }
});

test('the twelve Olympians plus Hades and Persephone are present', () => {
  const names = GODS.map((g) => g.name);
  for (const n of ['Zeus', 'Hera', 'Poseidon', 'Demeter', 'Athena', 'Apollo', 'Artemis',
    'Ares', 'Aphrodite', 'Hephaestus', 'Hermes', 'Dionysus', 'Hades', 'Persephone']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('ALL_DOMAINS is sorted and covers every god', () => {
  const sorted = [...ALL_DOMAINS].sort();
  assert.deepEqual(ALL_DOMAINS, sorted);
  for (const g of GODS) {
    for (const d of g.domains) assert.ok(ALL_DOMAINS.includes(d), `domain ${d} missing`);
  }
});

test('getGod returns entries and null for unknown ids', () => {
  assert.equal(getGod('zeus').name, 'Zeus');
  assert.equal(getGod('nope'), null);
});

// ---------- Query helpers ----------

test('searchGods matches name, domain, epithet, symbol, roman', () => {
  assert.ok(searchGods('zeus').some((g) => g.id === 'zeus'));
  assert.ok(searchGods('thunderbolt').some((g) => g.id === 'zeus'));
  assert.ok(searchGods('jupiter').some((g) => g.id === 'zeus'));
  assert.ok(searchGods('wine').some((g) => g.id === 'dionysus'));
  assert.ok(searchGods('SEA').some((g) => g.id === 'poseidon'), 'search should be case-insensitive');
});

test('searchGods with empty query returns everyone', () => {
  assert.equal(searchGods('').length, 14);
  assert.equal(searchGods('   ').length, 14);
});

test('searchGods returns empty for nonsense', () => {
  assert.deepEqual(searchGods('zzzzqqqq'), []);
});

test('filterByDomain narrows the pantheon', () => {
  const sea = filterByDomain('Sea');
  assert.equal(sea.length, 1);
  assert.equal(sea[0].id, 'poseidon');
  assert.equal(filterByDomain('').length, 14);
  assert.deepEqual(filterByDomain('Nonexistent'), []);
});

test('searchAndFilter combines both', () => {
  // 'Warfare' domain is Athena only; searching 'wisdom' within 'War' finds nothing.
  assert.deepEqual(searchAndFilter('wisdom', 'War'), []);
  const r = searchAndFilter('owl', 'Warfare');
  assert.ok(r.some((g) => g.id === 'athena'));
});
