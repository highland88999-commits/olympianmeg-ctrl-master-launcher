// Tests for the Merlin Mandates module: ledger logic + static scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  seedMandates,
  createMandate,
  addMandate,
  updateMandate,
  toggleMandate,
  deleteMandate,
  moveMandate,
  stats,
  exportText,
  serializeList,
  deserializeList,
} from '../app/merlin-mandates/mandates.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'merlin-mandates');
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

test('no CDN libraries or ad/product links', () => {
  const banned = ['unpkg', 'jsdelivr', 'cdnjs', 'three', 'catbox', 'innodigym', 'vercel.app'];
  for (const s of banned) {
    assert.ok(!allCode.toLowerCase().includes(s), `banned string present: ${s}`);
  }
});

test('no JWT-shaped secrets in built files', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(allCode), 'JWT-shaped token found');
});

// ---------- Ledger logic ----------

test('createMandate requires a title', () => {
  assert.throws(() => createMandate('   '), /title/);
  const m = createMandate('Ship it', 'today');
  assert.equal(m.title, 'Ship it');
  assert.equal(m.detail, 'today');
  assert.equal(m.fulfilled, false);
  assert.ok(m.id && m.createdAt > 0);
});

test('seedMandates provides editable starter examples', () => {
  const seeds = seedMandates();
  assert.ok(seeds.length >= 3);
  for (const s of seeds) {
    assert.ok(s.title && s.id);
    assert.equal(s.fulfilled, false);
  }
  const ids = new Set(seeds.map((s) => s.id));
  assert.equal(ids.size, seeds.length);
});

test('addMandate prepends', () => {
  const list = addMandate([], createMandate('First'));
  assert.equal(list.length, 1);
  const list2 = addMandate(list, createMandate('Second'));
  assert.equal(list2[0].title, 'Second');
  assert.equal(list2.length, 2);
});

test('toggleMandate flips fulfilled state', () => {
  let list = [createMandate('A')];
  list = toggleMandate(list, list[0].id);
  assert.equal(list[0].fulfilled, true);
  list = toggleMandate(list, list[0].id);
  assert.equal(list[0].fulfilled, false);
});

test('updateMandate edits title and detail', () => {
  let list = [createMandate('A', 'old')];
  list = updateMandate(list, list[0].id, { title: 'B', detail: 'new' });
  assert.equal(list[0].title, 'B');
  assert.equal(list[0].detail, 'new');
});

test('deleteMandate removes by id', () => {
  const a = createMandate('A');
  const b = createMandate('B');
  const list = deleteMandate([a, b], a.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, b.id);
});

test('moveMandate reorders and no-ops at edges', () => {
  const a = createMandate('A');
  const b = createMandate('B');
  const c = createMandate('C');
  let list = moveMandate([a, b, c], b.id, -1);
  assert.deepEqual(list.map((m) => m.id), [b.id, a.id, c.id]);
  list = moveMandate(list, b.id, 1);
  assert.deepEqual(list.map((m) => m.id), [a.id, b.id, c.id]);
  assert.deepEqual(moveMandate([a, b], a.id, -1).map((m) => m.id), [a.id, b.id]);
  assert.deepEqual(moveMandate([a, b], b.id, 1).map((m) => m.id), [a.id, b.id]);
});

test('stats counts active and fulfilled', () => {
  let list = [createMandate('A'), createMandate('B')];
  list = toggleMandate(list, list[0].id);
  assert.deepEqual(stats(list), { total: 2, fulfilled: 1, active: 1 });
  assert.deepEqual(stats([]), { total: 0, fulfilled: 0, active: 0 });
});

test('exportText renders a readable checklist', () => {
  let list = [createMandate('A', 'detail a')];
  list = toggleMandate(list, list[0].id);
  const txt = exportText(list);
  assert.ok(txt.includes('MERLIN MANDATES'));
  assert.ok(txt.includes('[x] A'));
  assert.ok(txt.includes('detail a'));
});

test('serialize/deserialize round-trips', () => {
  const list = [createMandate('A', 'd')];
  const back = deserializeList(serializeList(list));
  assert.equal(back.length, 1);
  assert.equal(back[0].title, 'A');
  assert.equal(back[0].detail, 'd');
});

test('deserializeList rejects garbage and skips bad entries', () => {
  assert.equal(deserializeList('nope'), null);
  assert.equal(deserializeList('{}'), null);
  const back = deserializeList(JSON.stringify([{ title: 'Ok' }, { nope: true }, null]));
  assert.equal(back.length, 1);
  assert.equal(back[0].title, 'Ok');
});
