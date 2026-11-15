// lib/anti-life/decay-spots.js — shared decayed-spot sync.
//
// ANTI-LIFE LINGERING DECAY (Merlin, 2026-11-15): contagion needs
// effected things to be visible to other users, so decayed SPOTS
// (a place a carrier decayed, live until the carrier's own timer
// dies) are shared through Supabase on the same plain-DB-polling
// pattern as presence (lib/presence.js): 2.5 s cadence, zero
// Realtime, zero websockets. The Supabase client is passed in (never
// hard-coded), and every function is defensive:
//
// - If Supabase isn't configured the client no-ops cleanly.
// - If the `anti_life_decay_spots` table is missing/unreachable the
//   first 42P01 error flips `available` to false and everything
//   after is a silent no-op. Pages render solo, zero errors, and no
//   fake contagion is ever shown.
// - Spots are read only inside their live window (expires_at in the
//   future); an expired spot is dead ground, and the carrier's own
//   spots die with their timer — the reset law, enforced by the
//   expiry itself.
//
// Pure helpers (sanitizeSpotRow / mapRowToSpot / mergeSpots /
// sanitizeWorldKey) are headless-testable in plain Node.

import { DECAY_POLL_MS, SPOT_RADIUS_M, createSpot, isSpotLive, shouldWriteSpot } from './lingering.js';

export const TABLE = 'anti_life_decay_spots';
export const POLL_MS = DECAY_POLL_MS;
export const READ_LIMIT = 100;

/** World keys are route paths ('/middle-earth') or bare realm keys
 *  ('hell'). Anything else is not a world. */
export function sanitizeWorldKey(raw) {
  if (typeof raw !== 'string') return null;
  const w = raw.trim();
  if (!w || w.length > 64) return null;
  if (!/^[a-z0-9/_-]+$/.test(w)) return null;
  return w;
}

function finiteNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Map a DB row to a spot object; returns null for unusable rows. */
export function mapRowToSpot(row, nowMs = Date.now()) {
  if (!row || typeof row !== 'object' || !row.id) return null;
  const expiresAt = row.expires_at;
  const expMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expMs) || expMs <= Number(nowMs)) return null;
  const world = sanitizeWorldKey(row.world);
  if (!world) return null;
  return {
    id: String(row.id),
    world,
    x: finiteNum(row.x),
    y: finiteNum(row.y),
    z: finiteNum(row.z),
    radiusM: finiteNum(row.radius_m, SPOT_RADIUS_M),
    carrierId: typeof row.carrier_id === 'string' ? row.carrier_id : '',
    expiresAt: new Date(expMs).toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(expMs).toISOString(),
  };
}

/** Alias kept for symmetry with the presence client. */
export const sanitizeSpotRow = mapRowToSpot;

/** Merge a fresh poll into the known set: dedupe by id, drop
 *  expired, newest expiry wins on conflict. */
export function mergeSpots(existing, incoming, nowMs = Date.now()) {
  const byId = new Map();
  for (const s of Array.isArray(existing) ? existing : []) {
    if (isSpotLive(s, nowMs)) byId.set(s.id, s);
  }
  for (const s of Array.isArray(incoming) ? incoming : []) {
    if (!isSpotLive(s, nowMs)) continue;
    const prev = byId.get(s.id);
    if (!prev || new Date(s.expiresAt).getTime() > new Date(prev.expiresAt).getTime()) {
      byId.set(s.id, s);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function resolveClient(sb) {
  try {
    if (!sb || typeof sb.from !== 'function') return null;
    return sb;
  } catch {
    return null;
  }
}

/**
 * createDecaySpotsClient(supabase, opts)
 *
 * opts: {
 *   world:    current world key ('/middle-earth') — setWorld() moves it
 *   userId:   signed-in row id override (RLS law — same as presence:
 *             a signed-in carrier's rows carry id = auth.uid());
 *             guests keep their device carrier id.
 *   carrierId: the device carrier id (from the lingering carrier
 *             state); the row carrier_id.
 *   getPosition: () => ({ world, x, y, z }) | null — live walker pos
 *   onSpots:  (spots) => void — called after every poll
 *   onChange: ({ available }) => void — availability transitions
 * }
 *
 * Returns { available, join, update, leave, dispose, getSpots,
 * setWorld }. When unavailable every method is a safe no-op.
 */
export function createDecaySpotsClient(supabase, opts = {}) {
  const getPosition = typeof opts.getPosition === 'function' ? opts.getPosition : () => null;
  const onSpots = typeof opts.onSpots === 'function' ? opts.onSpots : () => {};
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};

  let sb = resolveClient(supabase);
  let available = !!sb;
  let joined = false;
  let world = sanitizeWorldKey(opts.world) || '/middle-earth';
  const carrierId = typeof opts.carrierId === 'string' && opts.carrierId
    ? opts.carrierId
    : 'guest';
  const rowCarrierId = typeof opts.userId === 'string' && opts.userId ? opts.userId : carrierId;
  let lastWrite = null; // { atMs, world, x, z }
  let lastPos = null;
  let pollTimer = 0;
  let spots = [];
  let missingTableNotified = false;

  function setAvailable(v) {
    if (available === v) return;
    available = v;
    if (!v) {
      stopPoll();
      spots = [];
      try {
        onSpots([]);
      } catch { /* host callback must never break us */ }
    }
    try {
      onChange({ available });
    } catch { /* noop */ }
  }

  function noteDbError(error) {
    if (!error) return false;
    const code = error.code;
    const msg = String(error.message || '');
    const missing =
      code === '42P01' || /relation .* does not exist/i.test(msg)
      || /table .*anti_life_decay_spots/i.test(msg);
    if (missing && !missingTableNotified) {
      missingTableNotified = true;
      sb = null;
      setAvailable(false);
    }
    return missing;
  }

  async function pollOnce() {
    if (!available || !sb || !joined) return;
    if (typeof document !== 'undefined' && document.hidden) return; // save quota
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await sb
        .from(TABLE)
        .select('id,world,x,y,z,radius_m,carrier_id,expires_at,updated_at')
        .eq('world', world)
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: true })
        .limit(READ_LIMIT);
      if (error) {
        if (noteDbError(error)) return;
        return;
      }
      const now = Date.now();
      const fresh = (Array.isArray(data) ? data : [])
        .map((row) => mapRowToSpot(row, now))
        .filter(Boolean);
      spots = mergeSpots(spots.filter((s) => s.world === world), fresh, now);
      try {
        onSpots(spots.slice());
      } catch { /* noop */ }
    } catch {
      /* transient — next tick retries */
    }
  }

  function startPoll() {
    stopPoll();
    if (typeof setInterval === 'undefined') return;
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  /** Best-effort delete of our own expired rows (the reset law:
   *  when our timer dies, our spots die — expiry filters them
   *  everywhere even if this delete never runs). */
  async function purgeOwnExpired() {
    if (!available || !sb) return false;
    try {
      const { error } = await sb
        .from(TABLE)
        .delete()
        .eq('carrier_id', rowCarrierId)
        .lt('expires_at', new Date().toISOString());
      if (error) {
        noteDbError(error);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    get available() {
      return available;
    },
    get world() {
      return world;
    },
    getSpots() {
      return spots.slice();
    },
    setWorld(next) {
      const w = sanitizeWorldKey(next);
      if (!w || w === world) return;
      world = w;
      spots = [];
      if (joined) pollOnce();
    },

    /** Start polling. Safe to call repeatedly. */
    async join() {
      if (!available || !sb) return false;
      joined = true;
      startPoll();
      return available;
    },

    /**
     * Write our decayed spot for the current position, gated by the
     * linger throttle + 200 m spacing. Call often — the gate makes
     * it cheap. Pass explicit state or rely on getPosition().
     * Returns false when nothing was written (not a carrier, not
     * moved enough, throttled, or unavailable).
     */
    async update(state) {
      if (!available || !sb || !joined) return false;
      const carrier = state && typeof state === 'object' ? state : null;
      if (!carrier || !carrier.expiresAt) return false;
      if (Number(carrier.expiresAt) <= Date.now()) return false;
      const pos = getPosition();
      if (!pos || !pos.world) return false;
      const gate = shouldWriteSpot(lastWrite, lastPos, pos, Date.now());
      if (!gate.ok) return false;
      const spot = createSpot({
        carrierId: rowCarrierId,
        world: sanitizeWorldKey(pos.world) || world,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        expiresAt: carrier.expiresAt,
      });
      try {
        const { error } = await sb.from(TABLE).upsert({
          id: spot.id,
          world: spot.world,
          x: spot.x,
          y: spot.y,
          z: spot.z,
          radius_m: spot.radiusM,
          carrier_id: spot.carrierId,
          expires_at: spot.expiresAt,
          updated_at: spot.updatedAt,
        }, { onConflict: 'id' });
        if (error) {
          if (noteDbError(error)) return false;
          return false;
        }
        lastWrite = { atMs: Date.now(), world: spot.world, x: spot.x, z: spot.z };
        lastPos = { world: spot.world, x: spot.x, y: spot.y, z: spot.z };
        return true;
      } catch {
        return false;
      }
    },

    /** Best-effort purge of our expired rows + stop everything. */
    async leave() {
      joined = false;
      stopPoll();
      await purgeOwnExpired();
      spots = [];
    },

    purgeOwnExpired,

    dispose() {
      joined = false;
      stopPoll();
      spots = [];
    },
  };
}
