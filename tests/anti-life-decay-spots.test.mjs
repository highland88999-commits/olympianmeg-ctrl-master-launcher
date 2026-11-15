// tests/anti-life-decay-spots.test.mjs — shared decayed spots for
// the Anti-Life lingering decay (Merlin, 2026-11-15). Contagion needs
// effected things to be visible to other users, so spots live in
// Supabase (supabase/anti-life-decay.sql — STAGED, not run) on the
// presence polling pattern. If the table is missing the client
// no-ops cleanly: no fake contagion, ever.
// Run: node tests/anti-life-decay-spots.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TABLE,
  mapRowToSpot,
  mergeSpots,
  sanitizeSpotRow,
  sanitizeWorldKey,
} from '../lib/anti-life/decay-spots.js';
import { createSpot } from '../lib/anti-life/lingering.js';

const NOW = 1800000000000;

test('the spots table name', () => {
  assert.equal(TABLE, 'anti_life_decay_spots');
});

test('world keys are routes or bare realm keys, nothing else', () => {
  assert.equal(sanitizeWorldKey('/middle-earth'), '/middle-earth');
  assert.equal(sanitizeWorldKey('hell'), 'hell');
  assert.equal(sanitizeWorldKey('  /earth-2  '), '/earth-2');
  assert.equal(sanitizeWorldKey(''), null);
  assert.equal(sanitizeWorldKey(null), null);
  assert.equal(sanitizeWorldKey('/middle earth'), null, 'no spaces');
  assert.equal(sanitizeWorldKey('/middle-earth?x=1'), null, 'no query strings');
  assert.equal(sanitizeWorldKey('x'.repeat(65)), null, 'capped at 64');
});

function row(over = {}) {
  return {
    id: 'c1:/middle-earth:0:0',
    world: '/middle-earth',
    x: 10,
    y: 0,
    z: 20,
    radius_m: 50,
    carrier_id: 'c1',
    expires_at: new Date(NOW + 600000).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...over,
  };
}

test('a live row maps to a spot', () => {
  const s = mapRowToSpot(row(), NOW);
  assert.ok(s);
  assert.equal(s.id, 'c1:/middle-earth:0:0');
  assert.equal(s.world, '/middle-earth');
  assert.equal(s.x, 10);
  assert.equal(s.z, 20);
  assert.equal(s.radiusM, 50);
  assert.equal(s.carrierId, 'c1');
  assert.equal(s.expiresAt, new Date(NOW + 600000).toISOString());
  assert.equal(sanitizeSpotRow(row(), NOW).id, s.id, 'alias agrees');
});

test('unusable rows map to null — never a phantom spot', () => {
  assert.equal(mapRowToSpot(null, NOW), null);
  assert.equal(mapRowToSpot({}, NOW), null, 'no id');
  assert.equal(mapRowToSpot(row({ expires_at: new Date(NOW - 1).toISOString() }), NOW), null,
    'expired rows are dead ground');
  assert.equal(mapRowToSpot(row({ expires_at: 'not-a-date' }), NOW), null);
  assert.equal(mapRowToSpot(row({ world: '/bad world' }), NOW), null);
  assert.equal(mapRowToSpot(row({ world: '' }), NOW), null);
  const weird = mapRowToSpot(row({ x: 'abc', radius_m: 'nope' }), NOW);
  assert.ok(weird, 'bad numbers fall back, the row survives');
  assert.equal(weird.x, 0);
  assert.equal(weird.radiusM, 50, 'radius falls back to the 50 m infection law');
});

test('merge dedupes by id, drops expired, newest expiry wins', () => {
  const a = createSpot({ carrierId: 'c1', world: '/middle-earth', x: 0, z: 0, expiresAt: NOW + 300000, nowMs: NOW });
  const aNewer = { ...a, expiresAt: new Date(NOW + 600000).toISOString() };
  const dead = createSpot({ carrierId: 'c2', world: '/middle-earth', x: 500, z: 0, expiresAt: NOW + 1000, nowMs: NOW });
  const merged = mergeSpots([a, dead], [aNewer], NOW + 2000);
  assert.equal(merged.length, 1, 'the expired spot is gone');
  assert.equal(merged[0].id, a.id);
  assert.equal(merged[0].expiresAt, new Date(NOW + 600000).toISOString(), 'newest wins');
  assert.deepEqual(mergeSpots([], [], NOW), [], 'empty in, empty out');
  assert.deepEqual(mergeSpots(null, undefined, NOW), [], 'null-safe');
});

test('the SQL stages the spots table with a live-read window and a purge', () => {
  const sql = readFileSync('supabase/anti-life-decay.sql', 'utf8');
  assert.ok(sql.includes('DO NOT RUN YET'), 'staged, not run');
  assert.ok(sql.includes('create table if not exists public.anti_life_decay_spots'), 'table declared');
  assert.ok(sql.includes('expires_at > now()'), 'reads see live spots only');
  assert.ok(sql.includes('purge_expired_decay_spots'), 'purge function staged');
  assert.ok(sql.includes("radius_m > 0 and radius_m <= 50"), 'radius capped at the 50 m infection law');
  assert.ok(sql.includes('anti_life_decay_spots_world_live_idx'), 'world+expiry index');
});

test('the client follows the presence pattern: defensive, polling, no Realtime', () => {
  const src = readFileSync('lib/anti-life/decay-spots.js', 'utf8');
  assert.ok(src.includes('42P01'), 'missing table flips unavailable');
  assert.ok(src.includes('setInterval(pollOnce, POLL_MS)'), '2.5 s poll cadence');
  assert.ok(!src.includes('createChannel'), 'no Realtime channels');
  assert.ok(!src.includes('WebSocket'), 'no websockets');
  assert.ok(src.includes("onConflict: 'id'"), 'spot upsert by deterministic id');
  assert.ok(src.includes('.gt(\'expires_at\''), 'poll reads live rows only');
});
