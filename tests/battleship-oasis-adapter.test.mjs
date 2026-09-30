// tests/battleship-oasis-adapter.test.mjs — Headless tests for the
// Battleship × OASIS adapter (lib/battleship/oasis-adapter.js).
// Run: node tests/battleship-oasis-adapter.test.mjs (from the repo root).
// No browser, no network — a fake in-memory Supabase query builder.
//
// Covers: shareable codes are valid OASIS codes; createLinkedLobby writes
// the SAME code to olympus_battleship_rooms and oasis_rooms (game=battleship,
// 2 players); joinLinkedLobby seats the guest in both rows and flips both
// to playing; rejects invalid/unknown/non-battleship/already-started codes;
// idempotent retry when the OASIS seat exists but the native seat failed;
// rollback when the OASIS insert fails; deep-link URL round-trip.

import assert from 'node:assert/strict';
import {
  generateShareableCode,
  isBattleshipOasisRoom,
  createLinkedLobby,
  joinLinkedLobby,
  BATTLESHIP_OASIS_SLUG,
} from '../lib/battleship/oasis-adapter.js';
import { isValidRoomCode } from '../lib/oasis/rooms.js';
import { buildJoinUrl, codeFromSearch } from '../lib/oasis/share.js';

// ---------------------------------------------------------------- fake db --
function makeFakeSupabase() {
  const tables = { olympus_battleship_rooms: [], oasis_rooms: [] };
  const failOn = {}; // e.g. failOn['oasis_rooms:insert'] = 'boom'

  function from(table) {
    const rows = tables[table];
    const state = { op: null, payload: null, filters: [], wantSingle: false };
    const match = (row) => state.filters.every(([c, v]) => row[c] === v);

    async function run() {
      const key = `${table}:${state.op || 'select'}`;
      if (failOn[key]) return { data: null, error: { message: failOn[key] } };
      if (state.op === 'insert') {
        const recs = (Array.isArray(state.payload) ? state.payload : [state.payload])
          .map((r) => ({ ...r }));
        if (table === 'oasis_rooms') {
          for (const r of recs) {
            if (rows.some((x) => x.room_code === r.room_code)) {
              return { data: null, error: { message: 'duplicate key value violates unique constraint "oasis_rooms_room_code_key"' } };
            }
          }
        }
        rows.push(...recs);
        return { data: state.wantSingle ? recs[0] : recs, error: null };
      }
      if (state.op === 'update') {
        const matched = rows.filter(match);
        matched.forEach((r) => Object.assign(r, state.payload));
        return { data: state.wantSingle ? (matched[0] || null) : matched, error: null };
      }
      if (state.op === 'delete') {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (match(rows[i])) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }
      const matched = rows.filter(match);
      if (state.wantSingle) {
        if (matched.length === 0) return { data: null, error: { message: 'No rows found' } };
        return { data: matched[0], error: null };
      }
      return { data: matched, error: null };
    }

    const builder = {
      insert(p) { state.op = 'insert'; state.payload = p; return builder; },
      update(p) { state.op = 'update'; state.payload = p; return builder; },
      delete() { state.op = 'delete'; return builder; },
      select() { if (!state.op) state.op = 'select'; return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      single() { state.wantSingle = true; return run(); },
      // supabase-js builders are thenable: update().eq() awaited directly.
      then(resolve, reject) { run().then(resolve, reject); },
    };
    return builder;
  }

  return { _tables: tables, _failOn: failOn, from };
}

// ------------------------------------------------------------------ tests --
const results = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push(['PASS', name]))
    .catch((e) => results.push(['FAIL', `${name} — ${e.message}`]));
}

const HOST = 'host-user-1';
const GUEST = 'guest-user-2';

await test('shareable code is a valid OASIS code (no ambiguous glyphs)', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = generateShareableCode();
    assert.equal(code.length, 6);
    assert.ok(isValidRoomCode(code), `invalid code: ${code}`);
    assert.ok(!/[01IO]/.test(code), `ambiguous glyph in: ${code}`);
  }
});

await test('createLinkedLobby writes the same code to both tables', async () => {
  const db = makeFakeSupabase();
  const { code } = await createLinkedLobby(db, { userId: HOST });
  assert.ok(isValidRoomCode(code));

  const native = db._tables.olympus_battleship_rooms.find((r) => r.room_code === code);
  assert.ok(native, 'native row missing');
  assert.equal(native.host_id, HOST);
  assert.equal(native.status, 'waiting');

  const oasis = db._tables.oasis_rooms.find((r) => r.room_code === code);
  assert.ok(oasis, 'oasis row missing');
  assert.equal(oasis.game, BATTLESHIP_OASIS_SLUG);
  assert.deepEqual(oasis.player_ids, [HOST]);
  assert.equal(oasis.status, 'waiting');
  assert.equal(oasis.min_players, 2);
  assert.equal(oasis.max_players, 2);
});

await test('createLinkedLobby rejects without a user id', async () => {
  const db = makeFakeSupabase();
  await assert.rejects(() => createLinkedLobby(db, { userId: null }), /Sign in/);
});

await test('createLinkedLobby rolls back the native row when the OASIS insert fails', async () => {
  const db = makeFakeSupabase();
  db._failOn['oasis_rooms:insert'] = 'simulated insert failure';
  await assert.rejects(() => createLinkedLobby(db, { userId: HOST }), /shareable battle/);
  assert.equal(db._tables.olympus_battleship_rooms.length, 0, 'native row was not rolled back');
});

await test('guest joins: seated in both rows, both flip to playing', async () => {
  const db = makeFakeSupabase();
  const { code } = await createLinkedLobby(db, { userId: HOST });

  const res = await joinLinkedLobby(db, { code, userId: GUEST });
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  assert.equal(res.code, code);

  const oasis = db._tables.oasis_rooms.find((r) => r.room_code === code);
  assert.ok(oasis.player_ids.includes(GUEST), 'guest not seated in oasis row');
  assert.equal(oasis.status, 'playing');

  const native = db._tables.olympus_battleship_rooms.find((r) => r.room_code === code);
  assert.equal(native.guest_id, GUEST);
  assert.equal(native.status, 'playing');
});

await test('join rejects an invalid code', async () => {
  const db = makeFakeSupabase();
  const res = await joinLinkedLobby(db, { code: '!!!', userId: GUEST });
  assert.equal(res.error, 'Enter a valid 6-character code.');
});

await test('join rejects an unknown code', async () => {
  const db = makeFakeSupabase();
  const res = await joinLinkedLobby(db, { code: 'ABCDEF', userId: GUEST });
  assert.equal(res.error, 'Battle not found or already started.');
});

await test('join rejects an OASIS room for a different game', async () => {
  const db = makeFakeSupabase();
  db._tables.oasis_rooms.push({
    game: 'chess', room_code: 'ABCDEF', host_id: HOST,
    player_ids: [HOST], npc_ids: [], status: 'waiting',
    min_players: 2, max_players: 2,
  });
  const res = await joinLinkedLobby(db, { code: 'ABCDEF', userId: GUEST });
  assert.equal(res.error, 'Battle not found or already started.');
});

await test('join rejects an already-started battle', async () => {
  const db = makeFakeSupabase();
  const { code } = await createLinkedLobby(db, { userId: HOST });
  const first = await joinLinkedLobby(db, { code, userId: GUEST });
  assert.ok(!first.error);
  const second = await joinLinkedLobby(db, { code, userId: 'guest-user-3' });
  assert.equal(second.error, 'Battle not found or already started.');
});

await test('join is idempotent when the OASIS seat exists but the native seat failed', async () => {
  const db = makeFakeSupabase();
  const { code } = await createLinkedLobby(db, { userId: HOST });
  // Simulate a partial first attempt: guest seated in OASIS, native untouched.
  db._tables.oasis_rooms.find((r) => r.room_code === code).player_ids.push(GUEST);

  const res = await joinLinkedLobby(db, { code, userId: GUEST });
  assert.ok(!res.error, `unexpected error: ${res.error}`);
  const native = db._tables.olympus_battleship_rooms.find((r) => r.room_code === code);
  assert.equal(native.guest_id, GUEST);
  assert.equal(native.status, 'playing');
});

await test('isBattleshipOasisRoom only matches game=battleship', () => {
  assert.ok(isBattleshipOasisRoom({ game: 'battleship' }));
  assert.ok(!isBattleshipOasisRoom({ game: 'chess' }));
  assert.ok(!isBattleshipOasisRoom(null));
  assert.ok(!isBattleshipOasisRoom({}));
});

await test('deep-link URL round-trips through buildJoinUrl/codeFromSearch', async () => {
  const db = makeFakeSupabase();
  const { code } = await createLinkedLobby(db, { userId: HOST });
  const url = buildJoinUrl('https://olympusverse.com', 'battleship', code);
  assert.equal(url, `https://olympusverse.com/battleship?code=${code}`);
  const parsed = codeFromSearch(new URL(url).search);
  assert.equal(parsed, code);
  const res = await joinLinkedLobby(db, { code: parsed, userId: GUEST });
  assert.ok(!res.error, `deep-link join failed: ${res.error}`);
});

// ------------------------------------------------------------------ report --
const failed = results.filter(([s]) => s === 'FAIL');
for (const [s, name] of results) console.log(`${s} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} green`);
if (failed.length) process.exit(1);
