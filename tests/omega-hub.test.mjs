// Tests for the /omega-hub module.
// Run with: node --test tests/omega-hub.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SECTORS, getSector, HAZARD_LABEL } from '../app/omega-hub/content.js';
import { TERMINAL_BANNER, runCommand } from '../app/omega-hub/terminal.js';
import {
  CATALOG, getItem, createBackpack, addItem, removeItem, listItems,
  itemCount, summarizeBackpack, serializeBackpack, deserializeBackpack,
} from '../app/omega-hub/backpack.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'omega-hub');
const read = (f) => readFileSync(join(appDir, f), 'utf8');
const ctx = { guestTag: 'GUEST-TEST', backpackSummary: () => [] };

// --- Content -------------------------------------------------------------------
test('four sectors with unique ids and palettes', () => {
  assert.equal(SECTORS.length, 4);
  assert.equal(new Set(SECTORS.map((s) => s.id)).size, 4);
  for (const s of SECTORS) {
    assert.ok(s.name && s.desc.length > 20);
    assert.ok(s.palette && s.palette.accent);
    assert.ok(HAZARD_LABEL[s.hazard]);
  }
});

test('getSector falls back to the first sector', () => {
  assert.equal(getSector('nexus-prime').name, 'NEXUS PRIME');
  assert.equal(getSector('nope').id, SECTORS[0].id);
});

// --- Terminal (simulated shell) ---------------------------------------------------
test('terminal banner declares the simulation', () => {
  assert.ok(TERMINAL_BANNER.join(' ').toLowerCase().includes('simulation'));
});

test('HELP lists the commands', () => {
  const r = runCommand('help', ctx);
  assert.ok(r.lines.join(' ').includes('SCAN'));
});

test('WHOAMI shows the guest tag', () => {
  const r = runCommand('whoami', ctx);
  assert.ok(r.lines[0].includes('GUEST-TEST'));
});

test('SECTORS lists every sector', () => {
  const r = runCommand('sectors', ctx);
  assert.equal(r.lines.length, 4);
});

test('SCAN of a known sector returns a simulated report', () => {
  const r = runCommand('scan nexus-prime', ctx);
  assert.ok(r.lines[0].includes('NEXUS PRIME'));
  assert.ok(r.lines.join(' ').toLowerCase().includes('simulated'));
});

test('SCAN of an unknown sector fails plainly', () => {
  const r = runCommand('scan nowhere', ctx);
  assert.ok(r.lines[0].toLowerCase().includes('unknown sector'));
});

test('CLEAR returns the clear flag', () => {
  assert.deepEqual(runCommand('clear', ctx), { lines: [], clear: true });
});

test('ABOUT admits everything is local', () => {
  const r = runCommand('about', ctx);
  assert.ok(r.lines.join(' ').toLowerCase().includes('locally'));
});

test('unknown commands get a helpful error', () => {
  const r = runCommand('hacktheplanet', ctx);
  assert.ok(r.lines[0].includes('HELP'));
});

test('empty input returns no lines', () => {
  assert.deepEqual(runCommand('   ', ctx).lines, []);
});

// --- Backpack ----------------------------------------------------------------------
test('catalog has eight unique items with kinds', () => {
  assert.equal(CATALOG.length, 8);
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, 8);
  for (const c of CATALOG) assert.ok(['tool', 'armor', 'trinket', 'consumable'].includes(c.kind));
});

test('addItem / removeItem / counts', () => {
  let bp = createBackpack();
  assert.equal(itemCount(bp), 0);
  bp = addItem(bp, 'pulse-lantern');
  bp = addItem(bp, 'pulse-lantern');
  assert.equal(itemCount(bp), 2);
  assert.equal(listItems(bp)[0].qty, 2);
  bp = removeItem(bp, 'pulse-lantern');
  assert.equal(itemCount(bp), 1);
  bp = removeItem(bp, 'pulse-lantern');
  assert.equal(itemCount(bp), 0);
  assert.deepEqual(listItems(bp), []);
});

test('addItem rejects unknown ids', () => {
  assert.equal(addItem(createBackpack(), 'bogus'), false);
});

test('removeItem on missing id is a no-op', () => {
  const bp = createBackpack();
  assert.deepEqual(removeItem(bp, 'pulse-lantern'), bp);
});

test('summarizeBackpack formats lines', () => {
  let bp = addItem(createBackpack(), 'echo-charm');
  const lines = summarizeBackpack(bp);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('Echo Charm'));
});

test('backpack survives a serialize round-trip', () => {
  let bp = addItem(createBackpack(), 'grav-boots');
  const rt = deserializeBackpack(serializeBackpack(bp));
  assert.equal(itemCount(rt), 1);
});

test('deserializeBackpack sanitizes hostile input', () => {
  assert.equal(itemCount(deserializeBackpack('not json{{{')), 0);
  assert.equal(itemCount(deserializeBackpack(JSON.stringify({ items: { 'pulse-lantern': 5, 'bogus': 3, 'ion-cutter': -2 } }))), 5);
  assert.equal(itemCount(deserializeBackpack(JSON.stringify({ nope: 1 }))), 0);
});

// --- Static security scan ---------------------------------------------------------------
test('no telemetry, auth backends, or external requests in module source', () => {
  const files = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  assert.ok(files.length >= 4);
  const forbidden = [
    'supabase', 'ipify', 'central_telemetry', 'logBrainAction', 'connected_repos',
    'track_ping', 'oauth', 'signInWithOAuth', 'eyJhbGciOi',
    'http://', 'https://', 'cdn.jsdelivr', 'catbox', 'file.garden', 'wikimedia',
    'model-viewer', '<iframe', '<video', 'mailto:',
  ];
  for (const f of files) {
    const src = read(f);
    for (const pat of forbidden) {
      assert.ok(!src.toLowerCase().includes(pat.toLowerCase()),
        `${f} must not contain "${pat}"`);
    }
  }
});

test('page labels the terminal as simulated and backpack as local', () => {
  const src = read('page.jsx');
  assert.ok(src.toLowerCase().includes('simulat'));
  assert.ok(src.includes('localStorage'));
  assert.ok(src.includes('prefers-reduced-motion'));
});
