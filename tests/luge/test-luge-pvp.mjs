// tests/luge/test-luge-pvp.mjs
// Headless tests for the pure Luge PvP module (lib/luge/pvp.js):
// room lifecycle, beacons, standings, results — no network, no DB.
// Run: node tests/luge/test-luge-pvp.mjs (from the repo root).
import {
  LUGE_PVP_SLUG,
  LUGE_MAX_RACERS,
  LUGE_MIN_RACERS,
  PVP_COUNTDOWN_MS,
  PVP_RACE_TIMEOUT_MS,
  BEACON_STALE_MS,
  newRaceCode,
  buildRaceState,
  raceStateFromRoom,
  canStartRace,
  decidePvpJoin,
  pvpRoomIsFull,
  beaconRow,
  isBeaconStale,
  sortStandings,
  raceIsOver,
  pvpResults,
  ghostColorFor,
  formatRaceTime,
} from '../../lib/luge/pvp.js';
import { ROOM_STATUS } from '../../lib/oasis/rooms.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- constants ---
t('slug is luge', LUGE_PVP_SLUG === 'luge');
t('100-player cap', LUGE_MAX_RACERS === 100);
t('2-racer minimum', LUGE_MIN_RACERS === 2);
t('5s countdown', PVP_COUNTDOWN_MS === 5000);
t('race timeout is sane (4 min)', PVP_RACE_TIMEOUT_MS === 240000);

// --- room codes ---
const codes = new Set(Array.from({ length: 200 }, () => newRaceCode()));
t('codes are 6 uppercase alnum chars',
  [...codes].every((c) => /^[A-Z0-9]{6}$/.test(c)));
t('codes are not trivially colliding', codes.size > 190);

// --- race state round-trip ---
const startsAt = Date.now() + 5000;
const room = {
  room_code: 'ABC123',
  game: 'luge',
  status: ROOM_STATUS.PLAYING,
  player_ids: ['u1', 'u2'],
  full_state: buildRaceState({ startsAt, courseId: 7 }),
};
const rs = raceStateFromRoom(room);
t('raceStateFromRoom round-trips startsAt + courseId',
  rs && rs.startsAt === startsAt && rs.courseId === 7);
t('raceStateFromRoom is null without full_state',
  raceStateFromRoom({ status: ROOM_STATUS.WAITING }) === null);
t('raceStateFromRoom is null on malformed state',
  raceStateFromRoom({ full_state: { nope: 1 } }) === null);

// --- hostless starts ---
const waiting = { status: ROOM_STATUS.WAITING, player_ids: ['u1', 'u2', 'u3'] };
t('any seated rider can start (u2, not the host)', canStartRace(waiting, 'u2'));
t('a non-seated rider cannot start', !canStartRace(waiting, 'u9'));
t('one rider alone cannot start', !canStartRace({ status: ROOM_STATUS.WAITING, player_ids: ['u1'] }, 'u1'));
t('cannot start an already-playing room',
  !canStartRace({ ...waiting, status: ROOM_STATUS.PLAYING }, 'u1'));
t('cannot start a null room', !canStartRace(null, 'u1'));

// --- join decisions ---
t('waiting -> race', JSON.stringify(decidePvpJoin({ game: 'luge', status: ROOM_STATUS.WAITING })) === JSON.stringify({ ok: true, mode: 'race' }));
t('playing -> spectate',
  decidePvpJoin({ game: 'luge', status: ROOM_STATUS.PLAYING }).mode === 'spectate');
t('finished -> lobby',
  decidePvpJoin({ game: 'luge', status: ROOM_STATUS.FINISHED }).mode === 'lobby');
t('missing room -> error', !!decidePvpJoin(null).error);
t('wrong game -> error', !!decidePvpJoin({ game: 'chess', status: ROOM_STATUS.WAITING }).error);

// --- capacity ---
t('full at 100 racers', pvpRoomIsFull({ player_ids: Array.from({ length: 100 }, (_, i) => `u${i}`) }));
t('not full at 99 racers', !pvpRoomIsFull({ player_ids: Array.from({ length: 99 }, (_, i) => `u${i}`) }));

// --- beacon rows ---
const row = beaconRow({ roomCode: 'abc123', userId: 'u1', callsign: 'Speedy', sledId: 'p26', progress: 0.5, finished: false });
t('beaconRow normalizes the room code', row.room_code === 'ABC123');
t('beaconRow clamps progress to [0,1]',
  beaconRow({ roomCode: 'A', userId: 'u', progress: 9 }).progress === 1);
t('beaconRow truncates long callsigns',
  beaconRow({ roomCode: 'A', userId: 'u', callsign: 'x'.repeat(50) }).callsign.length === 24);
const finRow = beaconRow({ roomCode: 'A', userId: 'u', progress: 1, finished: true, finishMs: 83412.7 });
t('finished beacon carries a rounded finish_ms', finRow.finish_ms === 83413);
t('unfinished beacon has null finish_ms', row.finish_ms === null);

// --- staleness ---
const now = Date.now();
t('fresh beacon is not stale',
  !isBeaconStale({ updated_at: new Date(now - 1000).toISOString() }, now));
t('quiet beacon is stale',
  isBeaconStale({ updated_at: new Date(now - BEACON_STALE_MS - 1000).toISOString() }, now));
t('unparseable timestamp counts as stale', isBeaconStale({}, now));

// --- standings ---
const beacons = [
  { user_id: 'u1', callsign: 'Apex', progress: 1, finished: true, finish_ms: 90000, updated_at: new Date(now - 1000).toISOString() },
  { user_id: 'u2', callsign: 'Bolt', progress: 1, finished: true, finish_ms: 85000, updated_at: new Date(now - 1000).toISOString() },
  { user_id: 'u3', callsign: 'Mid', progress: 0.6, finished: false, updated_at: new Date(now - 1000).toISOString() },
  { user_id: 'u4', callsign: 'Slow', progress: 0.2, finished: false, updated_at: new Date(now - 1000).toISOString() },
  { user_id: 'ghost', callsign: 'Cam', spectating: true, progress: 0.9, finished: false, updated_at: new Date(now - 1000).toISOString() },
];
const standings = sortStandings(beacons, now);
t('spectators are excluded from standings', !standings.some((s) => s.userId === 'ghost'));
t('finishers sort by time (Bolt before Apex)',
  standings[0].userId === 'u2' && standings[1].userId === 'u1');
t('unfinished sort by progress after finishers',
  standings[2].userId === 'u3' && standings[3].userId === 'u4');
t('ranks are 1..n in order', standings.map((s) => s.rank).join(',') === '1,2,3,4');

// --- race over ---
t('all finished -> over', raceIsOver(beacons.slice(0, 2), startsAt - 60000, now));
t('stale beacons do not hold the room hostage',
  raceIsOver([
    { user_id: 'u1', finished: true, finish_ms: 1, updated_at: new Date(now - 1000).toISOString() },
    { user_id: 'u2', finished: false, progress: 0.3, updated_at: new Date(now - BEACON_STALE_MS - 5000).toISOString() },
  ], startsAt - 60000, now));
t('mid-race is not over', !raceIsOver(beacons, startsAt - 60000, now));
t('timeout ends the race', raceIsOver(beacons, now - PVP_RACE_TIMEOUT_MS - 1000, now));
t('no beacons -> not over', !raceIsOver([], startsAt - 60000, now));

// --- results ---
const { results, dnfs } = pvpResults(beacons, now);
t('results hold the finishers by time',
  results.length === 2 && results[0].userId === 'u2' && results[0].rank === 1);
t('DNFs hold the rest, best progress first',
  dnfs.length === 2 && dnfs[0].userId === 'u3' && dnfs[0].dnf === true);

// --- ghosts + time format ---
t('ghost colors are deterministic', ghostColorFor('u1') === ghostColorFor('u1'));
t('ghost color is a hex color', /^#[0-9a-fA-F]{6}$/.test(ghostColorFor('some-user-id')));
t('formatRaceTime renders m:ss.t', formatRaceTime(83413) === '1:23.4');
t('formatRaceTime handles sub-minute', formatRaceTime(45250) === '0:45.2');
t('formatRaceTime handles zero', formatRaceTime(0) === '0:00.0');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
