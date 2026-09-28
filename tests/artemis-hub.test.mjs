import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'artemis-hub');
const { MODULE_CARDS, STATUS_READOUTS, HUB_TITLE, HUB_TAGLINE, SIMULATED_NOTE, cardById, cardByRoute, validateCards } =
  await import(join(appDir, 'data.js'));

/* ---------------- content shape ---------------- */

test('hub title and tagline are plain, honest copy', () => {
  assert.equal(HUB_TITLE, 'Artemis Hub');
  assert.match(HUB_TAGLINE, /front door/i);
  assert.doesNotMatch(HUB_TAGLINE + HUB_TITLE, /AI-powered|permanent/i);
});

test('module cards validate clean', () => {
  assert.deepEqual(validateCards(), []);
  assert.ok(MODULE_CARDS.length >= 4, 'hub should link at least four modules');
});

test('cards link only in-launcher routes, no remote URLs', () => {
  for (const c of MODULE_CARDS) {
    assert.ok(c.route.startsWith('/'), `${c.id} route must be in-launcher`);
    assert.doesNotMatch(c.route, /^https?:/i);
  }
});

test('hub links the sibling architect-artemis module', () => {
  const card = cardById('architect-artemis');
  assert.ok(card);
  assert.equal(card.route, '/architect-artemis');
  assert.equal(cardByRoute('/artemis').id, 'artemis');
});

test('cardById returns null for unknown ids', () => {
  assert.equal(cardById('nope'), null);
  assert.equal(cardByRoute('/nope'), null);
});

test('card ids and routes are unique', () => {
  const ids = MODULE_CARDS.map((c) => c.id);
  const routes = MODULE_CARDS.map((c) => c.route);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(routes).size, routes.length);
});

test('status readouts are labeled simulated', () => {
  assert.match(SIMULATED_NOTE, /Simulated/i);
  assert.ok(STATUS_READOUTS.length >= 3);
  for (const r of STATUS_READOUTS) {
    assert.ok(r.label && r.value && r.detail, 'readout needs label, value, detail');
  }
});

/* ---------------- static scans ---------------- */

const TELEMETRY = /central_telemetry|ipify|supabase\.co|OMEGA MIND|brain-uplink|api[_-]?key|apikey/i;
const EXTERNAL = /https?:\/\//;
const MARKUP = /<iframe|<video|mailto:/i;

const sourceFiles = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));

test('no telemetry patterns in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, TELEMETRY, `${f} must not contain telemetry patterns`);
  }
});

test('no external URLs in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, EXTERNAL, `${f} must not contain remote URLs`);
  }
});

test('no iframe/video/mailto in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, MARKUP, `${f} must not contain iframe/video/mailto`);
  }
});
