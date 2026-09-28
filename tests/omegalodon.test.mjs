// Tests for the /omegalodon module (Ecosystem Gateway).
// Run with: node --test tests/omegalodon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLATFORMS, makeGuestTag, FIELD_KIT } from '../app/omegalodon/gateway.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'omegalodon');
const read = (f) => readFileSync(join(appDir, f), 'utf8');

// --- Directory data -----------------------------------------------------------------
test('four platforms with unique ids, faithful to the source lineup', () => {
  assert.equal(PLATFORMS.length, 4);
  assert.equal(new Set(PLATFORMS.map((p) => p.id)).size, 4);
  const titles = PLATFORMS.map((p) => p.title);
  for (const t of ['Nexus World Engine', 'Omega Hub', 'Dominion Auction House', 'Network Messages']) {
    assert.ok(titles.includes(t), `missing platform "${t}"`);
  }
  for (const p of PLATFORMS) {
    assert.ok(p.description && p.description.length > 10);
    assert.ok(['ONLINE', 'OFFLINE'].includes(p.status));
  }
});

test('only the in-build Omega Hub route is linked', () => {
  const linked = PLATFORMS.filter((p) => p.route);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].route, '/omega-hub');
  assert.equal(linked[0].status, 'ONLINE');
  for (const p of PLATFORMS.filter((x) => !x.route)) {
    assert.ok(p.note && p.note.length > 5, `${p.id} needs an offline note`);
  }
});

test('no platform points at an external URL', () => {
  for (const p of PLATFORMS) {
    assert.ok(!p.route || p.route.startsWith('/'), `${p.id} route must be internal`);
  }
});

// --- Guest session ---------------------------------------------------------------------
test('makeGuestTag produces Guest-XXXX tags', () => {
  const tag = makeGuestTag();
  assert.ok(/^Guest-[A-Z2-9]{4}$/.test(tag), `bad tag: ${tag}`);
  assert.notEqual(makeGuestTag(), makeGuestTag());
});

test('field kit has three starter items', () => {
  assert.equal(FIELD_KIT.length, 3);
  assert.equal(new Set(FIELD_KIT.map((k) => k.id)).size, 3);
});

// --- Static security scan --------------------------------------------------------------------
test('no telemetry, keys, video, or external requests in module source', () => {
  const files = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  assert.ok(files.length >= 2);
  const forbidden = [
    'supabase', 'ipify', 'central_telemetry', 'logBrainAction', 'eyJhbGciOi',
    'http://', 'https://', 'vercel.app', 'cdn.jsdelivr', 'catbox', 'file.garden',
    '<iframe', '<video', 'mailto:', 'Merlin_Root',
  ];
  for (const f of files) {
    const src = read(f);
    for (const pat of forbidden) {
      assert.ok(!src.toLowerCase().includes(pat.toLowerCase()),
        `${f} must not contain "${pat}"`);
    }
  }
});

test('page marks sign-in as simulated and keeps the gateway title', () => {
  const src = read('page.jsx');
  assert.ok(src.includes('ECOSYSTEM GATEWAY'));
  assert.ok(src.toLowerCase().includes('simulat'));
  assert.ok(src.includes('prefers-reduced-motion'));
});
