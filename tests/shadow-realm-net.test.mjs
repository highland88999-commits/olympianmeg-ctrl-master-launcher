// tests/shadow-realm-net.test.mjs
// Headless tests for the pure Shadow Realm netcode math
// (lib/shadow-realm/net.js): constants, beacon rows, staleness,
// interpolation/extrapolation (incl. heading wrap), standings, nearestN.
// Run: node tests/shadow-realm-net.test.mjs (from the repo root).
import {
  RACE_BEACON_MS,
  ROAM_BEACON_MS,
  BEACON_STALE_MS,
  QUEUE_MS,
  COUNTDOWN_MS,
  GRID_ROOM_CODE,
  REMOTE_CAP,
  beaconRow,
  isBeaconStale,
  lerpAngle,
  interpBeacon,
  sortStandings,
  nearestN,
} from '../lib/shadow-realm/net.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// --- constants ---
t('PvP beacon cadence ~3Hz', RACE_BEACON_MS === 333);
t('roam beacon cadence 1Hz', ROAM_BEACON_MS === 1000);
t('stale threshold 10s', BEACON_STALE_MS === 10000);
t('queue window 2 min', QUEUE_MS === 120000);
t('countdown 5s', COUNTDOWN_MS === 5000);
t('grid room code is 6 chars', GRID_ROOM_CODE.length === 6);
t('grid room code uses the OASIS charset (no 0/O/1/I/L)',
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(GRID_ROOM_CODE));
t('remote cap 12', REMOTE_CAP === 12);

// --- beaconRow ---
const row = beaconRow({
  roomCode: 'abc123', userId: 'u1', callsign: 'Merlin', x: 10, z: -4,
  heading: 1.5, speed: 22, boosting: true, progress: 0.42,
  finished: false, finishMs: null,
});
t('room code normalized to uppercase', row.room_code === 'ABC123');
t('callsign kept', row.callsign === 'Merlin');
t('transform fields pass through',
  row.x === 10 && row.z === -4 && row.heading === 1.5 && row.speed === 22);
t('boosting flag kept', row.boosting === true);
t('unfinished -> finish_ms null', row.finished === false && row.finish_ms === null);
t('updated_at is an ISO string', Number.isFinite(Date.parse(row.updated_at)));

t('progress clamps to 1', beaconRow({ roomCode: 'A', userId: 'u', progress: 1.5 }).progress === 1);
t('progress clamps to 0', beaconRow({ roomCode: 'A', userId: 'u', progress: -0.2 }).progress === 0);
t('callsign defaults to Rider', beaconRow({ roomCode: 'A', userId: 'u' }).callsign === 'Rider');
t('callsign truncates at 24', beaconRow({ roomCode: 'A', userId: 'u', callsign: 'x'.repeat(40) }).callsign.length === 24);
t('finished stamps finish_ms (>=1)',
  beaconRow({ roomCode: 'A', userId: 'u', finished: true, finishMs: 83413 }).finish_ms === 83413);
t('negative speed clamps to 0', beaconRow({ roomCode: 'A', userId: 'u', speed: -5 }).speed === 0);

// --- isBeaconStale ---
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
t('fresh beacon is live', !isBeaconStale({ updated_at: iso(now - 1000) }, now));
t('old beacon is stale', isBeaconStale({ updated_at: iso(now - BEACON_STALE_MS - 1) }, now));
t('missing timestamp is stale', isBeaconStale({}, now));

// --- lerpAngle: shortest arc ---
t('plain lerp', approx(lerpAngle(0, Math.PI, 0.5), Math.PI / 2));
t('wrap midpoint goes through PI, not 0',
  approx(lerpAngle(Math.PI - 0.2, -Math.PI + 0.2, 0.5), Math.PI));
t('full lerp reaches target across the wrap',
  approx(lerpAngle(Math.PI - 0.2, -Math.PI + 0.2, 1), Math.PI + 0.2));

// --- interpBeacon ---
const b0 = { x: 5, z: 7, heading: 1.2, speed: 0, updated_at: iso(now) };
const snap = interpBeacon(b0, null, now);
t('first sight snaps to the beacon', snap.x === 5 && snap.z === 7 && approx(snap.heading, 1.2));

// Heading 0 = nose +Z: dir (sin 0, cos 0) = (0, 1).
const gliding = { x: 0, z: 0, heading: 0, speed: 10, updated_at: iso(now - 400) };
const ex1 = interpBeacon(gliding, null, now);
t('extrapolates along heading*speed (0.4s * 10 = 4)', approx(ex1.z, 4) && approx(ex1.x, 0));

const oldGlide = { x: 0, z: 0, heading: 0, speed: 10, updated_at: iso(now - 800) };
const ex2 = interpBeacon(oldGlide, null, now);
t('extrapolation caps at 0.5s (0.5 * 10 = 5)', approx(ex2.z, 5));

const sideGlide = { x: 0, z: 0, heading: Math.PI / 2, speed: 10, updated_at: iso(now - 500) };
const ex3 = interpBeacon(sideGlide, null, now);
t('heading PI/2 extrapolates along +X', approx(ex3.x, 5) && approx(ex3.z, 0, 1e-9));

const follow = interpBeacon(
  { x: 10, z: 0, heading: 0, speed: 0, updated_at: iso(now) },
  { x: 0, z: 0, heading: 0, at: now - 100 },
  now
);
t('eases toward the target (t = 1-exp(-100/120))',
  follow.x > 5 && follow.x < 6.5 && approx(follow.z, 0));

const frozen = interpBeacon(
  { x: 10, z: 0, heading: 0, speed: 0, updated_at: iso(now) },
  { x: 2, z: 3, heading: 0.5, at: now },
  now
);
t('dt=0 keeps the previous pose', frozen.x === 2 && frozen.z === 3 && approx(frozen.heading, 0.5));

const wrapPose = interpBeacon(
  { x: 0, z: 0, heading: -Math.PI + 0.1, speed: 0, updated_at: iso(now) },
  { x: 0, z: 0, heading: Math.PI - 0.1, at: now - 83 },
  now
);
t('heading follows the shortest arc mid-lerp', Math.abs(wrapPose.heading - Math.PI) < 0.1);

// --- sortStandings: finished by time asc, then racing by progress desc ---
const board = [
  { user_id: 'u1', callsign: 'A', progress: 0.9, finished: true, finish_ms: 90000, updated_at: iso(now - 500) },
  { user_id: 'u2', callsign: 'B', progress: 0.3, finished: false, finish_ms: null, updated_at: iso(now - 500) },
  { user_id: 'u3', callsign: 'C', progress: 0.8, finished: false, finish_ms: null, updated_at: iso(now - 500) },
  { user_id: 'u4', callsign: 'D', progress: 1, finished: true, finish_ms: 85000, updated_at: iso(now - 500) },
  { user_id: 'u5', callsign: 'E', progress: 0.1, finished: false, finish_ms: null, updated_at: iso(now - 20000) },
];
const st = sortStandings(board, now);
t('finishers first, fastest first', st[0].userId === 'u4' && st[1].userId === 'u1');
t('then racing by progress desc', st[2].userId === 'u3' && st[3].userId === 'u2' && st[4].userId === 'u5');
t('ranks are 1..n', st.map((s) => s.rank).join(',') === '1,2,3,4,5');
t('stale flagged, never dropped', st[4].stale === true && st[0].stale === false);

// --- nearestN ---
const nb = [
  { user_id: 'far', x: 100, z: 0 },
  { user_id: 'mid', x: 10, z: 0 },
  { user_id: 'near', x: 1, z: 1 },
];
const nn = nearestN(nb, { x: 0, z: 0 }, 2);
t('nearest first, capped at n',
  nn.length === 2 && nn[0].user_id === 'near' && nn[1].user_id === 'mid');
const capped = nearestN(Array.from({ length: 30 }, (_, i) => ({ user_id: `u${i}`, x: i, z: 0 })), { x: 0, z: 0 });
t('defaults to REMOTE_CAP', capped.length === REMOTE_CAP);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
