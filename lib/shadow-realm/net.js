// lib/shadow-realm/net.js
// Pure netcode math for SHADOW REALM drop 2: PvP track matches + open-world
// presence. Headless-testable — no I/O, no Three.js, no framework.
// (Thin Supabase calls live in lib/shadow-realm/pvp.js; the ghost renderer
// lives in app/shadow-realm/RemoteBikes.jsx.)
//
// Every client rides its own local simulation and beacons its transform;
// the room row only carries lobby state + the synced start timestamp. That
// keeps 20-bike races cheap — one tiny upsert per rider per beacon, one row
// read per poll. Remote bikes are GHOSTS by design: no collision, cosmetic
// only, same as the VS AI bots.

import { normalizeCode } from '../oasis/rooms.js';

/** PvP race beacon cadence: ~3Hz, tiny payload. */
export const RACE_BEACON_MS = 333;
/** Open-world presence beacon cadence: 1Hz. */
export const ROAM_BEACON_MS = 1000;
/** A beacon older than this means its rider dropped — hide the ghost, no pop-up. */
export const BEACON_STALE_MS = 10000;
/** Lobby queue window before the room auto-launches. */
export const QUEUE_MS = 120000; // 2 minutes
/** Synced countdown from launch to the green light. */
export const COUNTDOWN_MS = 5000;
/** Persistent open-world presence room: fixed code in the OASIS charset
 *  (no 0/O, 1/I, L — reads cleanly on a phone screen). */
export const GRID_ROOM_CODE = 'SHDWRD';
/** iPhone perf: never render more than this many remote ghosts. */
export const REMOTE_CAP = 12;

/**
 * Build a beacon row for shadow_realm_beacons. progress is 0..1 over the
 * whole race (lap units / laps); finished carries the synced finish_ms
 * (Date.now() - startsAt). Callsign only — never email/wallet.
 * lives (0..3, default 3) is the BUMP RACE battle state — self-reported
 * like finish times; eliminated riders read as lives 0.
 */
export function beaconRow({ roomCode, userId, callsign, x, z, heading, speed, boosting, progress, finished, finishMs, lives }) {
  const lv = lives == null ? 3 : Math.min(3, Math.max(0, Math.round(Number(lives) || 0)));
  return {
    room_code: normalizeCode(roomCode),
    user_id: userId,
    callsign: String(callsign || 'Rider').slice(0, 24),
    x: Number(x) || 0,
    z: Number(z) || 0,
    heading: Number(heading) || 0,
    speed: Math.max(0, Number(speed) || 0),
    boosting: !!boosting,
    progress: Math.min(1, Math.max(0, Number(progress) || 0)),
    finished: !!finished,
    finish_ms: finished ? Math.max(1, Math.round(Number(finishMs) || 0)) : null,
    lives: lv,
    updated_at: new Date().toISOString(),
  };
}

/** True when the beacon's rider has gone quiet (mid-race or mid-roam). */
export function isBeaconStale(beacon, nowMs = Date.now()) {
  const t = Date.parse(beacon?.updated_at || '');
  if (!Number.isFinite(t)) return true;
  return nowMs - t > BEACON_STALE_MS;
}

const TAU = Math.PI * 2;

/** Angle lerp along the shortest arc — heading never spins the long way. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/**
 * Smooth a remote ghost toward its latest beacon.
 *
 * beacon: the newest known row { x, z, heading, speed, updated_at }.
 * prev:   the last rendered pose { x, z, heading, at } (null on first sight).
 * nowMs:  render-clock ms.
 *
 * The latest beacon is first extrapolated along heading*speed for its age
 * (capped at 0.5s, so ghosts keep gliding between 333ms arrivals), then the
 * rendered pose eases toward that target with an exponential follow —
 * fast enough to track, slow enough to swallow network jitter. Heading
 * lerps along the shortest arc.
 *
 * Pure math: deterministic for a given (beacon, prev, nowMs).
 */
export function interpBeacon(beacon, prev, nowMs) {
  const bx = Number(beacon?.x) || 0;
  const bz = Number(beacon?.z) || 0;
  const bh = Number(beacon?.heading) || 0;
  const bs = Math.max(0, Number(beacon?.speed) || 0);
  const age = Math.max(0, nowMs - Date.parse(beacon?.updated_at || ''));
  // Extrapolate the beacon along its nose (+Z yaw convention: dx=sin,
  // dz=cos) for up to half a second of age.
  const extra = Math.min(age, 500) / 1000;
  const tx = bx + Math.sin(bh) * bs * extra;
  const tz = bz + Math.cos(bh) * bs * extra;
  if (!prev) return { x: tx, z: tz, heading: bh, at: nowMs };
  const dt = Math.max(0, nowMs - (prev.at ?? nowMs));
  const t = 1 - Math.exp(-dt / 120);
  return {
    x: prev.x + (tx - prev.x) * t,
    z: prev.z + (tz - prev.z) * t,
    heading: lerpAngle(prev.heading || 0, bh, Math.min(1, t * 1.5)),
    at: nowMs,
  };
}

/**
 * Live standings from the beacon board. Order: finished by finish_ms
 * ascending, then still-racing by progress descending (mirrors luge).
 * Stale beacons are flagged, never silently dropped.
 * Returns [{ userId, callsign, progress, finished, finishMs, stale, rank }].
 */
export function sortStandings(beacons, nowMs = Date.now()) {
  const rows = (beacons || []).map((b) => ({
    userId: b.user_id,
    callsign: b.callsign || 'Rider',
    progress: Math.min(1, Math.max(0, Number(b.progress) || 0)),
    finished: !!b.finished,
    finishMs: b.finished ? Number(b.finish_ms) || 0 : null,
    stale: isBeaconStale(b, nowMs),
  }));
  rows.sort((a, b) => {
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * The n nearest beacons to pos {x, z}, by 2D distance. Used for the
 * open-world board so every rider renders at most REMOTE_CAP ghosts —
 * the nearest ones, for iPhone perf.
 */
export function nearestN(beacons, pos, n = REMOTE_CAP) {
  const px = Number(pos?.x) || 0;
  const pz = Number(pos?.z) || 0;
  const dist2 = (b) => {
    const dx = (Number(b?.x) || 0) - px;
    const dz = (Number(b?.z) || 0) - pz;
    return dx * dx + dz * dz;
  };
  return [...(beacons || [])]
    .sort((a, b) => dist2(a) - dist2(b))
    .slice(0, Math.max(0, n));
}
