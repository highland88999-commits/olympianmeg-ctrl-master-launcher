// lib/anti-life/lingering.js — the lingering decay effect.
//
// ANTI-LIFE LINGERING DECAY (Merlin, 2026-11-15): visiting
// Anti-Life leaves a lingering decay on the user. THE LAW:
//   1. Every visit to /anti-life grants the decay for 10 minutes —
//      every user, every visit.
//   2. Leaving Anti-Life, the decay follows the user EVERYWHERE for
//      the remaining 10 minutes — same effect as inside Anti-Life.
//   3. RANGE 1 km: things within 1 km of the carrier decay.
//   4. When the timer wears off, everything the carrier touched
//      RESETS to its normal state. Decay is temporary, never
//      permanent destruction.
//   5. CONTAGION: any user whose character passes within ~50 m of
//      decayed ground is infected with a FRESH 10-minute timer —
//      same effect, same reset when theirs wears off.
//   6. RE-ACQUISITION: once all effect has worn out, the user must
//      RETURN to Anti-Life to get it again. The chain does not renew
//      itself — when the whole chain dies out, the source is the
//      only way back.
//
// WHAT DECAY DOES (extends the existing decay.js, no second decay):
// inside Anti-Life the world fades bloom → ash as you move
// (decay.js: palette drains to grey-brown, trees wither and droop,
// buildings crumble, neon dies, ash falls). The lingering effect is
// the SAME law carried out: the world around the carrier drains to
// ash — desaturated, darkened, ash falling — deepening as the 10
// minutes run down, and every world-entity within 1 km withers the
// way witherAt/collapseAt wither things near the camera in the
// art piece. When the timer ends the drain lifts and everything
// stands as it was.
//
// HOW IT TRAVELS (honest architecture): the carrier's timer lives
// on their own device (localStorage — the effect is theirs, and it
// survives navigation and refresh). Contagion between users needs
// effected things to be visible to other users, so decayed SPOTS
// (a place a carrier decayed, with the carrier's expiry) are shared
// through Supabase (lib/anti-life/decay-spots.js) on the same
// 2.5 s DB-polling pattern as presence (lib/presence.js) — zero
// Realtime, zero websockets. If the spots table is missing the sync
// client no-ops cleanly: the carrier still decays their own view,
// nobody else is infected, nothing errors. No fake contagion, ever.
//
// Pure except for the guarded window/localStorage helpers at the
// bottom — unit-testable in plain Node.

import { earthDistanceM } from '../earth/earth-presence.js';

export const DECAY_DURATION_MS = 10 * 60 * 1000; // 10 minutes, Merlin's law
export const DECAY_RANGE_M = 1000; // 1 km — the carrier's own decay field
export const SPOT_RADIUS_M = 50; // infection is ~50 m around decayed ground (Merlin, 2026-11-15: tightened from the 1 km field — the carrier's own field stays 1 km)
export const SPOT_SPACING_M = 200; // a new spot per 200 m of carrier travel
export const DECAY_POLL_MS = 2500; // spot poll cadence (presence pattern)
export const DECAY_WRITE_MS = 2500; // spot write throttle (presence pattern)
export const STORAGE_KEY = 'olympus:anti-life-decay:v1';
export const POSITION_EVENT = 'olympus:decay-position';

// ---------------------------------------------------------------------------
// World scales — 1 km mapped onto each world's own units.
//
// Metre worlds (x/z in metres): the 1 km field is world-scale —
// Middle-earth is 680 m across, the nether/higher realms 760 m,
// the hub ~340 m, Hollow Earth 680 m, Star Wars 1,040 m, Earth 2
// 1,400 m. One carrier standing anywhere near the middle decays
// the whole world; from an edge they decay most of it. That is the
// law as ordered (1 km), not a bug: in a 680 m world a kilometre
// IS the world. Planet-scale worlds (Earth 1/3/4, lat/lon) take a
// real 1 km radius. Anti-Life itself is a 2D canvas in px — the
// native decay.js effect applies there, not spots.
// ---------------------------------------------------------------------------

export const WORLD_SCALES = {
  '/anti-life': { units: 'px', sizeM: null },
  '/': { units: 'm', sizeM: 340 },
  '/middle-earth': { units: 'm', sizeM: 680 },
  '/earth-2': { units: 'm', sizeM: 1400 },
  '/star-wars': { units: 'm', sizeM: 1040 },
  '/hollow-earth': { units: 'm', sizeM: 680 },
  '/nether-realm': { units: 'm', sizeM: 760 },
  helheim: { units: 'm', sizeM: 760 },
  yomi: { units: 'm', sizeM: 760 },
  annwn: { units: 'm', sizeM: 760 },
  duat: { units: 'm', sizeM: 760 },
  mictlan: { units: 'm', sizeM: 760 },
  xibalba: { units: 'm', sizeM: 760 },
  hell: { units: 'm', sizeM: 760 },
  naraka: { units: 'm', sizeM: 760 },
  diyu: { units: 'm', sizeM: 760 },
  kur: { units: 'm', sizeM: 760 },
  nav: { units: 'm', sizeM: 760 },
  orun: { units: 'm', sizeM: 760 },
  elysium: { units: 'm', sizeM: 760 },
  valhalla: { units: 'm', sizeM: 760 },
  aaru: { units: 'm', sizeM: 760 },
  heaven: { units: 'm', sizeM: 760 },
  svarga: { units: 'm', sizeM: 760 },
  takamagahara: { units: 'm', sizeM: 760 },
  'tir-na-nog': { units: 'm', sizeM: 760 },
  tlalocan: { units: 'm', sizeM: 760 },
  'maya-sky': { units: 'm', sizeM: 760 },
  vyraj: { units: 'm', sizeM: 760 },
  tiangong: { units: 'm', sizeM: 760 },
  '/earth': { units: 'latlon', sizeM: null },
  '/earth-3': { units: 'latlon', sizeM: null },
  '/earth-4': { units: 'latlon', sizeM: null },
  '/flying-dutchman': { units: 'm', sizeM: null },
};

/** Scale entry for a world key ('/middle-earth') or bare realm key
 *  ('hell'). Unknown routes assume metres — the 1 km range still
 *  applies, in metres. */
export function worldScale(world) {
  if (typeof world !== 'string' || !world) return { units: 'm', sizeM: null };
  if (WORLD_SCALES[world]) return WORLD_SCALES[world];
  const bare = world.replace(/^\//, '');
  if (WORLD_SCALES[bare]) return WORLD_SCALES[bare];
  if (WORLD_SCALES[`/${bare}`]) return WORLD_SCALES[`/${bare}`];
  return { units: 'm', sizeM: null };
}

/** True when the 1 km field covers the whole world from its middle
 *  (world diameter at most 2 km). In every metre-scale world on the
 *  platform this is true — one carrier decays the world. */
export function rangeCoversWorld(world) {
  const s = worldScale(world);
  return s.sizeM != null && s.sizeM <= DECAY_RANGE_M * 2;
}

/** Distance in metres between two positions in a world. Positions
 *  are { x, z } in metres, or { x: lat, y: lon } for latlon worlds.
 *  Returns null where distance has no meaning (the 2D canvas). */
export function distanceM(world, a, b) {
  const s = worldScale(world);
  if (s.units === 'latlon') {
    if (!a || !b) return null;
    return earthDistanceM(a.x, a.y, b.x, b.y);
  }
  if (s.units !== 'm') return null;
  if (!a || !b) return null;
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  return Math.hypot(dx, dz);
}

/** Decay strength at a distance inside the 1 km field: 1 at the
 *  carrier's feet, 0 at the edge — the same falloff shape as
 *  witherAt's proximity term in decay.js (near things wither
 *  hardest). */
export function decayStrengthAt(distanceM) {
  const d = Number(distanceM);
  if (!Number.isFinite(d) || d <= 0) return 1;
  if (d >= DECAY_RANGE_M) return 0;
  return 1 - d / DECAY_RANGE_M;
}

/** Screen-space overlay strength from how far through the 10
 *  minutes the carrier is: the world greys progressively and is
 *  fully ashen near the end — the same deepening as the art
 *  piece's decay 0 → 1. */
export function overlayStrength(elapsedFraction) {
  const f = Math.max(0, Math.min(1, Number(elapsedFraction) || 0));
  return {
    desat: 0.35 + 0.65 * f, // 0.35 at grant, 1.0 as the timer dies
    darken: 0.08 + 0.22 * f,
    ash: 0.4 + 0.6 * f, // ashfall density
  };
}

// ---------------------------------------------------------------------------
// Carrier state — the 10-minute timer. Stored on the device; the
// effect is the carrier's and survives navigation and refresh.
// ---------------------------------------------------------------------------

export function makeCarrierId(randomFn) {
  const rnd = randomFn || Math.random;
  const hex = () => Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, '0');
  const h = hex() + hex() + hex() + hex();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Fresh carrier state. source: 'anti-life' (a visit) or
 *  'contagion' (infected by passing effected ground). */
export function createCarrierState({ source, nowMs, carrierId, randomFn } = {}) {
  const now = Number(nowMs ?? Date.now());
  return {
    carrierId: typeof carrierId === 'string' && carrierId ? carrierId : makeCarrierId(randomFn),
    source: source === 'contagion' ? 'contagion' : 'anti-life',
    grantedAt: now,
    expiresAt: now + DECAY_DURATION_MS,
  };
}

export function isCarrierActive(state, nowMs = Date.now()) {
  if (!state || typeof state !== 'object') return false;
  return Number(nowMs) < Number(state.expiresAt);
}

export function remainingMs(state, nowMs = Date.now()) {
  if (!state || typeof state !== 'object') return 0;
  return Math.max(0, Number(state.expiresAt) - Number(nowMs));
}

/** 0 at grant, 1 when the timer dies — drives the overlay. */
export function elapsedFraction(state, nowMs = Date.now()) {
  if (!state || typeof state !== 'object') return 0;
  const total = Number(state.expiresAt) - Number(state.grantedAt);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(nowMs) - Number(state.grantedAt)) / total));
}

export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function serializeCarrier(state) {
  if (!state || typeof state !== 'object') return null;
  try {
    return JSON.stringify({
      carrierId: state.carrierId,
      source: state.source,
      grantedAt: state.grantedAt,
      expiresAt: state.expiresAt,
    });
  } catch {
    return null;
  }
}

/** Defensive parse: garbage in storage never becomes a carrier. */
export function parseCarrier(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (typeof o.carrierId !== 'string' || !o.carrierId) return null;
  if (!Number.isFinite(Number(o.grantedAt)) || !Number.isFinite(Number(o.expiresAt))) return null;
  if (Number(o.expiresAt) <= Number(o.grantedAt)) return null;
  return {
    carrierId: o.carrierId,
    source: o.source === 'contagion' ? 'contagion' : 'anti-life',
    grantedAt: Number(o.grantedAt),
    expiresAt: Number(o.expiresAt),
  };
}

/** Load the stored carrier; an expired one is cleared and forgotten
 *  (re-acquisition is by returning to Anti-Life, or a new infection
 *  from a live spot — never by the stored row renewing itself). */
export function loadCarrier(store, nowMs = Date.now()) {
  try {
    const raw = store && typeof store.getItem === 'function' ? store.getItem(STORAGE_KEY) : null;
    const state = parseCarrier(raw);
    if (!state) return null;
    if (!isCarrierActive(state, nowMs)) {
      try {
        if (store && typeof store.removeItem === 'function') store.removeItem(STORAGE_KEY);
      } catch { /* noop */ }
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function saveCarrier(store, state) {
  try {
    const raw = serializeCarrier(state);
    if (raw && store && typeof store.setItem === 'function') store.setItem(STORAGE_KEY, raw);
  } catch { /* storage unavailable — the in-memory state still works */ }
}

export function clearCarrier(store) {
  try {
    if (store && typeof store.removeItem === 'function') store.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

/** Grant a FRESH 10 minutes. Every visit re-grants; an infection
 *  re-grants. Nothing here ever extends an existing timer — a grant
 *  is always a new one, so the chain can only die out, never renew
 *  itself. Returns the new state. */
export function grantCarrier(store, source, nowMs = Date.now(), prevCarrierId) {
  const state = createCarrierState({ source, nowMs, carrierId: prevCarrierId });
  saveCarrier(store, state);
  return state;
}

// ---------------------------------------------------------------------------
// Decayed spots — the shared, visible half of contagion. A spot is a
// place a carrier decayed: a ~50 m field around where they passed,
// live until the carrier's own timer dies. When the timer dies the
// spot dies with it, and everything there resets to normal.
// ---------------------------------------------------------------------------

/** Deterministic spot id: re-touching the same 200 m cell updates
 *  the same row instead of littering the table. */
export function spotId(carrierId, world, x, z) {
  const gx = Math.round(Number(x) / SPOT_SPACING_M);
  const gz = Math.round(Number(z) / SPOT_SPACING_M);
  return `${carrierId}:${world}:${gx}:${gz}`;
}

export function createSpot({ carrierId, world, x, y, z, expiresAt, nowMs = Date.now() }) {
  const now = Number(nowMs);
  return {
    id: spotId(carrierId, world, x, z),
    world: String(world),
    x: Number(x),
    y: Number(y ?? 0),
    z: Number(z),
    radiusM: SPOT_RADIUS_M,
    carrierId: String(carrierId),
    expiresAt: new Date(Number(expiresAt)).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export function isSpotLive(spot, nowMs = Date.now()) {
  if (!spot || typeof spot !== 'object') return false;
  const exp = new Date(spot.expiresAt ?? spot.expires_at).getTime();
  return Number.isFinite(exp) && exp > Number(nowMs);
}

/**
 * Contagion check: the nearest LIVE spot, not our own, whose ~50 m
 * field contains our position. Passing decayed ground infects —
 * the spot is the effected thing. Returns { spot, distanceM } or
 * null. Own spots share our own expiry, so they can never
 * re-infect us after our timer dies; they are excluded anyway.
 */
export function findInfection(world, pos, spots, nowMs = Date.now(), selfCarrierId = null) {
  if (!pos || !Array.isArray(spots) || spots.length === 0) return null;
  let best = null;
  let bestD = Infinity;
  for (const spot of spots) {
    if (!isSpotLive(spot, nowMs)) continue;
    if (selfCarrierId && spot.carrierId === selfCarrierId) continue;
    if (spot.carrier_id && selfCarrierId && spot.carrier_id === selfCarrierId) continue;
    const d = distanceM(world, pos, { x: spot.x, z: spot.z, y: spot.y });
    if (d == null) continue;
    const radius = Number(spot.radiusM ?? spot.radius_m ?? SPOT_RADIUS_M);
    if (d <= radius && d < bestD) {
      best = spot;
      bestD = d;
    }
  }
  return best ? { spot: best, distanceM: bestD } : null;
}

/** Write gate: a new spot only when the carrier moved at least one
 *  cell since the last write AND the write throttle elapsed. Keeps
 *  one carrier's trail to one row per 200 m cell per 2.5 s. */
export function shouldWriteSpot(lastWrite, lastPos, pos, nowMs = Date.now()) {
  if (!pos) return { ok: false, reason: 'no-position' };
  if (lastWrite && Number(nowMs) - Number(lastWrite.atMs) < DECAY_WRITE_MS) {
    return { ok: false, reason: 'throttled' };
  }
  if (lastPos && lastWrite && lastWrite.world === pos.world) {
    const d = distanceM(pos.world, lastPos, pos);
    if (d != null && d < SPOT_SPACING_M) return { ok: false, reason: 'too-close' };
  }
  return { ok: true, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// Position bus — 3D pages report the walker here (one line each);
// the global heartbeat listens and turns movement into spots and
// infection checks. Guarded: safe in Node, safe before mount.
// ---------------------------------------------------------------------------

export function reportDecayPosition(world, x, y, z) {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
    window.dispatchEvent(new CustomEvent(POSITION_EVENT, {
      detail: { world: String(world), x: Number(x), y: Number(y ?? 0), z: Number(z), atMs: Date.now() },
    }));
    return true;
  } catch {
    return false;
  }
}
