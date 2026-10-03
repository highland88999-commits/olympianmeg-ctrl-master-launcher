// tests/shadow-realm-pvp.test.mjs
// Headless tests for the Shadow Realm PvP room lifecycle
// (lib/shadow-realm/pvp.js): AI autofill, queue-expiry/full-room launch,
// idempotent launch guard, host migration, join decisions, grid presence.
// Pure helpers run directly; the thin Supabase fns run against a minimal
// chainable mock (no network, no DB).
// Run: node tests/shadow-realm-pvp.test.mjs (from the repo root).
import {
  SHADOW_PVP_SLUG,
  SHADOW_GRID_SLUG,
  PVP_SIZES,
  hashRoomCode,
  createPvpRoom,
  shouldLaunch,
  launchRoom,
  aiAutofillCount,
  shouldClaimHost,
  claimHost,
  leavePvpRoom,
  decidePvpJoin,
  queueRemainingMs,
  countdownRemainingMs,
  joinOrCreateGridRoom,
} from '../lib/shadow-realm/pvp.js';
import { GRID_ROOM_CODE as NET_GRID_CODE, GRID_ROOM_CODE } from '../lib/shadow-realm/net.js';
import { ROOM_STATUS, isValidRoomCode } from '../lib/oasis/rooms.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- minimal chainable supabase mock -------------------------------------
// Records calls; .single() results come from a FIFO queue the test fills.
function mockSupabase() {
  const calls = [];
  const queue = [];
  const mk = (table) => {
    const b = {};
    b.insert = (rows) => { calls.push({ op: 'insert', table, rows }); return b; };
    b.update = (vals) => { calls.push({ op: 'update', table, vals }); return b; };
    b.delete = () => { calls.push({ op: 'delete', table }); return b; };
    b.select = (...args) => { calls.push({ op: 'select', table, args }); return b; };
    b.eq = (col, val) => { calls.push({ op: 'eq', table, col, val }); return b; };
    b.single = async () => {
      calls.push({ op: 'single', table });
      return queue.length ? queue.shift() : { data: null, error: null };
    };
    // thenable so fire-and-forget awaits (update/delete without .single())
    // resolve like the real client.
    b.then = (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej);
    return b;
  };
  return { calls, enqueue: (r) => queue.push(r), from: (table) => mk(table) };
}

const roomOf = (over = {}) => ({
  game: SHADOW_PVP_SLUG,
  room_code: 'ABCDEF',
  host_id: 'host1',
  player_ids: ['host1'],
  npc_ids: [],
  status: ROOM_STATUS.WAITING,
  min_players: 2,
  max_players: 4,
  full_state: { trackKey: 'gridiron-oval', laps: 3, queueEndsAt: Date.now() + 60000 },
  ...over,
});

// --- constants ---
t('pvp slug is shadow-realm', SHADOW_PVP_SLUG === 'shadow-realm');
t('grid slug is shadow-realm-grid', SHADOW_GRID_SLUG === 'shadow-realm-grid');
t('allowed field sizes are 2/4/8/20', JSON.stringify(PVP_SIZES) === '[2,4,8,20]');
t('grid code matches net.js', GRID_ROOM_CODE === NET_GRID_CODE);
t('grid code is a valid OASIS code', isValidRoomCode(GRID_ROOM_CODE));
t('hashRoomCode is deterministic', hashRoomCode('ABCDEF') === hashRoomCode('ABCDEF'));
t('hashRoomCode differs per code', hashRoomCode('ABCDEF') !== hashRoomCode('ABCDEG'));

// --- aiAutofillCount ---
t('20 slots, 3 humans -> 17 AI',
  aiAutofillCount(roomOf({ max_players: 20, player_ids: ['a', 'b', 'c'] })) === 17);
t('full room -> 0 AI',
  aiAutofillCount(roomOf({ max_players: 4, player_ids: ['a', 'b', 'c', 'd'] })) === 0);
t('2 slots, 2 humans -> 0 AI',
  aiAutofillCount(roomOf({ max_players: 2, player_ids: ['a', 'b'] })) === 0);
t('never negative', aiAutofillCount(roomOf({ max_players: 2, player_ids: ['a', 'b', 'c'] })) === 0);

// --- shouldLaunch ---
const now = Date.now();
t('queue expiry launches',
  shouldLaunch(roomOf({ full_state: { queueEndsAt: now - 1 } }), now));
t('full room launches early',
  shouldLaunch(roomOf({
    max_players: 4,
    player_ids: ['a', 'b', 'c', 'd'],
    full_state: { queueEndsAt: now + 60000 },
  }), now));
t('open queue, open seats -> wait',
  !shouldLaunch(roomOf({ full_state: { queueEndsAt: now + 60000 } }), now));
t('playing room never relaunches',
  !shouldLaunch(roomOf({ status: ROOM_STATUS.PLAYING, full_state: { queueEndsAt: now - 1 } }), now));
t('null room -> false', !shouldLaunch(null, now));

// --- createPvpRoom ---
{
  const sb = mockSupabase();
  let threw = false;
  try { await createPvpRoom(sb, { hostId: 'h', maxPlayers: 3, trackKey: 't', laps: 3 }); }
  catch { threw = true; }
  t('rejects maxPlayers outside 2/4/8/20', threw);
}
{
  const sb = mockSupabase();
  const created = roomOf({ room_code: 'ZZZZZZ' });
  sb.enqueue({ data: created, error: null }); // createRoom insert
  sb.enqueue({ data: { ...created, full_state: { trackKey: 'neon-loop', laps: 5, queueEndsAt: 123 } }, error: null });
  const room = await createPvpRoom(sb, { hostId: 'h', maxPlayers: 8, trackKey: 'neon-loop', laps: 5 });
  const insert = sb.calls.find((c) => c.op === 'insert');
  t('creates a shadow-realm waiting room',
    insert && insert.table === 'oasis_rooms' && insert.rows[0].game === 'shadow-realm'
    && insert.rows[0].max_players === 8 && insert.rows[0].min_players === 2
    && insert.rows[0].status === 'waiting');
  const update = sb.calls.find((c) => c.op === 'update' && c.vals.full_state);
  t('stamps trackKey/laps/queueEndsAt into full_state',
    !!update && update.vals.full_state.trackKey === 'neon-loop'
    && update.vals.full_state.laps === 5
    && typeof update.vals.full_state.queueEndsAt === 'number');
  t('returns the updated room', room.room_code === 'ZZZZZZ' && room.full_state.laps === 5);
}

// --- launchRoom: idempotent conditional update ---
{
  const sb = mockSupabase();
  const waiting = roomOf({ status: 'waiting' });
  const playing = { ...waiting, status: 'playing', full_state: { ...waiting.full_state, startsAt: now + 5000 } };
  sb.enqueue({ data: playing, error: null }); // first writer wins
  sb.enqueue({ data: null, error: null });     // second finds no waiting row
  const first = await launchRoom(sb, waiting, now);
  const second = await launchRoom(sb, waiting, now);
  t('first launch wins', first.won === true && first.room.status === 'playing');
  t('second launch loses (idempotent)', second.won === false && second.room === null);
  const update = sb.calls.find((c) => c.op === 'update');
  t('launch writes status + startsAt',
    !!update && update.vals.status === 'playing'
    && update.vals.full_state.startsAt === now + 5000);
  t('launch is guarded by eq(status, waiting)',
    sb.calls.some((c) => c.op === 'eq' && c.col === 'status' && c.val === 'waiting'));
}

// --- shouldClaimHost / claimHost ---
t('claims when host is gone and I am longest-joined',
  shouldClaimHost(roomOf({ host_id: 'gone', player_ids: ['a', 'b'] }), 'a'));
t('no claim when host still seated',
  !shouldClaimHost(roomOf({ host_id: 'a', player_ids: ['a', 'b'] }), 'a'));
t('no claim when I am not longest-joined',
  !shouldClaimHost(roomOf({ host_id: 'gone', player_ids: ['a', 'b'] }), 'b'));
t('no claim without an id', !shouldClaimHost(roomOf(), ''));
{
  const sb = mockSupabase();
  const orphaned = roomOf({ host_id: 'gone', player_ids: ['a', 'b'] });
  sb.enqueue({ data: { ...orphaned, host_id: 'a' }, error: null });
  const res = await claimHost(sb, orphaned, 'a');
  const update = sb.calls.find((c) => c.op === 'update');
  t('claimHost writes host_id for the qualifier',
    res.claimed === true && !!update && update.vals.host_id === 'a');
  const res2 = await claimHost(sb, orphaned, 'b');
  t('claimHost refuses a non-qualifier without touching the DB',
    res2.claimed === false && sb.calls.filter((c) => c.op === 'update').length === 1);
}

// --- leavePvpRoom ---
{
  const sb = mockSupabase();
  sb.enqueue({ data: roomOf({ player_ids: ['a', 'b'] }), error: null });
  await leavePvpRoom(sb, { code: 'ABCDEF', playerId: 'a' });
  const update = sb.calls.find((c) => c.op === 'update');
  t('leave removes the rider from player_ids',
    !!update && JSON.stringify(update.vals.player_ids) === '["b"]');
  t('leave deletes the own beacon row',
    sb.calls.some((c) => c.op === 'delete' && c.table === 'shadow_realm_beacons'));
}

// --- decidePvpJoin ---
t('null room -> error', !!decidePvpJoin(null).error);
t('wrong game -> error', !!decidePvpJoin(roomOf({ game: 'luge' })).error);
t('waiting -> lobby', JSON.stringify(decidePvpJoin(roomOf())) === JSON.stringify({ ok: true, mode: 'lobby' }));
t('playing -> spectate', decidePvpJoin(roomOf({ status: 'playing' })).mode === 'spectate');
t('finished -> lobby', decidePvpJoin(roomOf({ status: 'finished' })).mode === 'lobby');

// --- queue / countdown remaining ---
t('queueRemainingMs counts down', queueRemainingMs(roomOf({ full_state: { queueEndsAt: now + 90000 } }), now) === 90000);
t('queueRemainingMs floors at 0', queueRemainingMs(roomOf({ full_state: { queueEndsAt: now - 5 } }), now) === 0);
t('queueRemainingMs null without a queue', queueRemainingMs(roomOf({ full_state: {} }), now) === null);
t('countdownRemainingMs reads startsAt',
  countdownRemainingMs(roomOf({ full_state: { startsAt: now + 4200 } }), now) === 4200);

// --- joinOrCreateGridRoom ---
{
  // Existing room, already seated: no writes.
  const sb = mockSupabase();
  const grid = roomOf({ game: SHADOW_GRID_SLUG, room_code: GRID_ROOM_CODE, status: 'playing', player_ids: ['me'] });
  sb.enqueue({ data: grid, error: null });
  const room = await joinOrCreateGridRoom(sb, 'me');
  t('existing grid room returned as-is', room === grid);
  t('no write when already seated', !sb.calls.some((c) => c.op === 'update' || c.op === 'insert'));
}
{
  // Existing room, not seated: seat the rider.
  const sb = mockSupabase();
  const grid = roomOf({ game: SHADOW_GRID_SLUG, room_code: GRID_ROOM_CODE, status: 'playing', player_ids: ['x'] });
  sb.enqueue({ data: grid, error: null });
  sb.enqueue({ data: { ...grid, player_ids: ['x', 'me'] }, error: null });
  const room = await joinOrCreateGridRoom(sb, 'me');
  const update = sb.calls.find((c) => c.op === 'update');
  t('seats the rider in the existing grid room',
    room.player_ids.includes('me') && !!update && update.vals.player_ids.includes('me'));
}
{
  // Create race lost (unique violation): re-fetch the winner's room.
  const sb = mockSupabase();
  const grid = roomOf({ game: SHADOW_GRID_SLUG, room_code: GRID_ROOM_CODE, status: 'playing', player_ids: ['rival'] });
  sb.enqueue({ data: null, error: { message: 'not found' } }); // first getRoom
  sb.enqueue({ data: null, error: { code: '23505', message: 'duplicate' } }); // insert conflict
  sb.enqueue({ data: grid, error: null }); // re-fetch
  const room = await joinOrCreateGridRoom(sb, 'me');
  t('create race -> re-fetches the winning room', room === grid);
  const insert = sb.calls.find((c) => c.op === 'insert');
  t('grid create uses the fixed code + playing status',
    !!insert && insert.rows[0].room_code === GRID_ROOM_CODE
    && insert.rows[0].game === SHADOW_GRID_SLUG
    && insert.rows[0].status === 'playing'
    && insert.rows[0].full_state.persistent === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
