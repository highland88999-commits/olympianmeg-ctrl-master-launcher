// Tests for the /omega-mansion module.
// Run with: node --test tests/omega-mansion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ROOMS, getRoom, roomIndex, nextRoom } from '../app/omega-mansion/rooms.js';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'omega-mansion');
const read = (f) => readFileSync(join(appDir, f), 'utf8');

// --- Rooms ----------------------------------------------------------------------
test('six rooms with unique ids, features, and palettes', () => {
  assert.equal(ROOMS.length, 6);
  assert.equal(new Set(ROOMS.map((r) => r.id)).size, 6);
  const features = new Set(ROOMS.map((r) => r.feature));
  assert.equal(features.size, 6, 'each room needs a distinct feature');
  for (const r of ROOMS) {
    assert.ok(r.name && r.desc.length > 40, `${r.id} needs real copy`);
    assert.ok(r.palette && r.palette.accent && r.palette.wallTop);
  }
});

test('getRoom falls back to the foyer', () => {
  assert.equal(getRoom('library').name, 'Library of Hours');
  assert.equal(getRoom('bogus').id, ROOMS[0].id);
});

test('roomIndex resolves positions', () => {
  assert.equal(roomIndex('grand-foyer'), 0);
  assert.equal(roomIndex('throne-room'), 5);
  assert.equal(roomIndex('bogus'), 0);
});

test('nextRoom wraps around both directions', () => {
  assert.equal(nextRoom('grand-foyer', 1), 'observatory');
  assert.equal(nextRoom('grand-foyer', -1), 'throne-room');
  assert.equal(nextRoom('throne-room', 1), 'grand-foyer');
});

test('a full tour visits every room exactly once', () => {
  let id = ROOMS[0].id;
  const seen = new Set([id]);
  for (let i = 0; i < ROOMS.length - 1; i++) {
    id = nextRoom(id, 1);
    seen.add(id);
  }
  assert.equal(seen.size, ROOMS.length);
  assert.equal(nextRoom(id, 1), ROOMS[0].id);
});

// --- Static security scan --------------------------------------------------------------
test('no telemetry, keys, or external requests in module source', () => {
  const files = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  assert.ok(files.length >= 2);
  const forbidden = [
    'supabase', 'ipify', 'central_telemetry', 'logBrainAction', 'connected_repos',
    'track_ping', 'eyJhbGciOi', 'http://', 'https://', 'cdn.jsdelivr',
    'catbox', 'file.garden', 'three', '<iframe', '<video', 'mailto:',
  ];
  for (const f of files) {
    const src = read(f);
    for (const pat of forbidden) {
      assert.ok(!src.toLowerCase().includes(pat.toLowerCase()),
        `${f} must not contain "${pat}"`);
    }
  }
});

test('page supports reduced motion and pointer look-around', () => {
  const src = read('page.jsx');
  assert.ok(src.includes('prefers-reduced-motion'));
  assert.ok(src.includes('onPointerMove'));
  assert.ok(src.includes('aria-label'));
});
