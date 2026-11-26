// tests/hub-baseball-leaderboard.test.mjs
// Headless tests for lib/hub-baseball/leaderboard-server.js.
// Run: node --test tests/hub-baseball-leaderboard.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEADERBOARD_LIMIT,
  computeMine,
  topEntries,
  validateSubmission,
} from '../lib/hub-baseball/leaderboard-server.js';

const ME = 'user-me';
const OTHER = 'user-other';
const row = (user_id, distance_m, eaten = false, created_at = '2026-11-26T00:00:00Z') =>
  ({ user_id, player: 'P', distance_m, eaten, created_at });

describe('validateSubmission', () => {
  it('accepts a valid flight and normalises it', () => {
    assert.deepEqual(validateSubmission({ distance_m: 1234, eaten: false, player: ' Merlin ' }), {
      ok: true, distance_m: 1234, eaten: false, player: 'Merlin',
    });
  });

  it('defaults a blank player to Player and eaten to false', () => {
    const v = validateSubmission({ distance_m: 10 });
    assert.deepEqual(v, { ok: true, distance_m: 10, eaten: false, player: 'Player' });
    assert.equal(validateSubmission({ distance_m: 10, player: '   ' }).player, 'Player');
  });

  it('trims a long player name to 24 chars', () => {
    const v = validateSubmission({ distance_m: 10, player: 'a'.repeat(40) });
    assert.equal(v.player.length, 24);
  });

  it('rejects a non-numeric distance', () => {
    assert.equal(validateSubmission({ distance_m: 'far' }).ok, false);
    assert.equal(validateSubmission({}).ok, false);
  });

  it('rejects negative and over-cap distances', () => {
    assert.equal(validateSubmission({ distance_m: -1 }).ok, false);
    assert.equal(validateSubmission({ distance_m: 100001 }).ok, false);
    assert.equal(validateSubmission({ distance_m: 100000 }).ok, true);
    assert.equal(validateSubmission({ distance_m: 0 }).ok, true);
  });

  it('rejects a non-boolean eaten flag', () => {
    assert.equal(validateSubmission({ distance_m: 10, eaten: 'yes' }).ok, false);
  });
});

describe('computeMine', () => {
  it('returns best/last/flights/eaten/rank for a user with flights', () => {
    const flights = [
      row(ME, 500, false, '2026-11-26T01:00:00Z'),
      row(ME, 1200, true, '2026-11-26T02:00:00Z'), // best + latest + eaten
      row(ME, 800, false, '2026-11-26T00:30:00Z'),
      row(OTHER, 1500, false, '2026-11-26T01:30:00Z'), // one flight above my best
      row(OTHER, 900, false, '2026-11-26T01:30:00Z'),
    ];
    assert.deepEqual(computeMine(flights, ME), {
      best: 1200, last: 1200, flights: 3, eaten: 1, rank: 2,
    });
  });

  it('rank is 1 when nobody beats my best', () => {
    const flights = [row(ME, 1200), row(OTHER, 900), row(OTHER, 1200)];
    // Tie at 1200 does not beat my best.
    assert.equal(computeMine(flights, ME).rank, 1);
  });

  it('empty flights -> rank null, best/last null, zeros', () => {
    assert.deepEqual(computeMine([], ME), {
      best: null, last: null, flights: 0, eaten: 0, rank: null,
    });
  });

  it('no flights of mine -> rank null even when others flew', () => {
    assert.deepEqual(computeMine([row(OTHER, 500)], ME), {
      best: null, last: null, flights: 0, eaten: 0, rank: null,
    });
  });

  it('last is the most recent flight, not the best', () => {
    const flights = [
      row(ME, 1200, false, '2026-11-26T01:00:00Z'),
      row(ME, 300, false, '2026-11-26T03:00:00Z'),
    ];
    const mine = computeMine(flights, ME);
    assert.equal(mine.best, 1200);
    assert.equal(mine.last, 300);
  });
});

describe('topEntries', () => {
  it('sorts desc by distance, earliest first on ties', () => {
    const flights = [
      row(OTHER, 100, false, '2026-11-26T02:00:00Z'),
      row(ME, 500, false, '2026-11-26T01:00:00Z'),
      row(OTHER, 500, false, '2026-11-26T00:00:00Z'), // tie, earlier
      row(ME, 300, false, '2026-11-26T03:00:00Z'),
    ];
    const top = topEntries(flights);
    assert.deepEqual(top.map((f) => f.distance_m), [500, 500, 300, 100]);
    assert.equal(top[0].created_at, '2026-11-26T00:00:00Z');
  });

  it('caps at n (default 50)', () => {
    assert.equal(LEADERBOARD_LIMIT, 50);
    const flights = Array.from({ length: 60 }, (_, i) => row(OTHER, i + 1));
    assert.equal(topEntries(flights).length, 50);
    assert.equal(topEntries(flights)[0].distance_m, 60);
    assert.equal(topEntries(flights, 3).length, 3);
  });

  it('empty input -> empty output', () => {
    assert.deepEqual(topEntries([]), []);
    assert.deepEqual(topEntries(), []);
  });
});
