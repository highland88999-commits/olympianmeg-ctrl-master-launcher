// lib/earth/kart.js — Earth 1 Mario Kart systems (Merlin, 2026-11-15:
// "Think super Mario... add orbs users can drive through, randomly
// placed throughout the planet, that give them torpedos to launch at
// other vehicles. Vehicles hit flip 3 times, explode and the user
// respawns where they blew up in their vehicle already.")
//
// Pure math + session state. No DOM, no THREE: headless-testable,
// same discipline as lib/earth/roam.js and lib/earth/boost-pads.js.
// The scene layer (components/EarthKart.jsx, EarthSupercar,
// EarthPeers, EarthConsole) reads and writes the singleton
// `kartState`; the server layer (kartServer, below) is best-effort
// fetch — it never throws, and when the migration hasn't run yet
// (Merlin's SQL green light still owed) everything stays local.
//
// THE NUMBERS (worker's choice, stated plainly):
//   ORBS — one orb per 0.5° cell: 360 lat bands x 720 lon slots
//     = 259,200 orbs, ~55 km apart at the equator (Merlin,
//     2026-11-15: "more spread out than that, reduce count if
//     need be"). A materialized list that big would still be
//     ~26 MB, so the set stays VIRTUAL: the orb in a cell is a
//     pure function of the cell key (seeded hash -> jitter +
//     colour), stable per load, never stored. Only COLLECTED
//     cells are stored (cell key -> re-arm time). Each orb wears
//     one of 6 video wraps (lib/earth/ground-video.js — the six
//     most distinct scratched metals, a rocket in the centre of
//     each video); the missile it grants wears the SAME colour,
//     so the wrap tells the driver what they picked up. One orb
//     = exactly ONE missile (Merlin, 2026-11-15). An orb re-arms
//     60 s after collection, so the planet never runs dry. The
//     orb body is 1.4 m across — clearly smaller than the
//     smallest roster vehicle (a 2.2 m bike) — floating 1.2 m up
//     so the car drives through it, with its 60 m beam marking
//     it from driving distance.
//   TORPEDO — HEAT SEEKER (Merlin, 2026-11-15, exact lock rule):
//     the missile ALWAYS tracks the CLOSEST vehicle TO THE
//     MISSILE ITSELF, re-evaluated continuously in flight. On
//     Fire it locks the closest other vehicle within 600 m (any
//     direction — no forward cone); while it flies, if another
//     vehicle passes closer to the missile than its current
//     target, the missile SWITCHES target and chases that vehicle
//     instead. It always hunts whoever is nearest to it at that
//     moment. The owner's own vehicle is never a target. Nothing
//     in range -> it flies straight 600 m and fizzles. Speed
//     300 m/s minimum, or 1.3x the target's speed when that is
//     faster (so it always catches the Aventador at boost).
//     Turns at 3 rad/s. Hits within 8 m — and like a red shell
//     it hits the FIRST vehicle it touches, target or not (it
//     ignores its owner for the first second after launch).
//   HIT — the vehicle FLIPS 3 times over 1.5 s, then EXPLODES
//     (1.2 s), then RESPAWNS exactly where it blew up, already
//     in its vehicle, speed 0, integrity restored, 3 s
//     invulnerable. No re-selection, no on-foot interlude.
//   INTEGRITY (bumper-car, Merlin 2026-11-15) — hidden meter,
//     100 max, NEVER rendered anywhere (the HUD snapshot carries
//     no integrity field — pinned in tests). A collision deals
//     both vehicles 10 + round(relative speed / 10) damage,
//     capped at 40 per hit; under 5 m/s relative speed is a
//     nudge, no damage. One hit per pair per second. At 0 the
//     vehicle goes BOOM (same flip-3-then-explode sequence) and
//     respawns at the blast spot in-vehicle.
//   RIVALS — 5 AI drivers (the "other vehicles" when no peer is
//     near; presence is still dormant, so a solo driver always
//     has someone to race). Seeded roster craft, 60% of top
//     speed, wandering headings. They collect orbs (cap 3
//     missiles each) and fire at the player inside 500 m, at
//     most once per 8 s per rival.

import { VEHICLES, getVehicle } from './vehicles.js';
import { haversineM, EARTH_RADIUS_M } from './boost-pads.js';
import { destinationPoint } from './roam.js';
import { stepFlight } from '../nova-flight.js';

// ---------------------------------------------------------------------------
// Seeded hashing (shared home: lib/earth/seeded-random.js)
// ---------------------------------------------------------------------------

import { fnv1a, mulberry32 } from './seeded-random.js';

export { fnv1a, mulberry32 };

// ---------------------------------------------------------------------------
// Orbs (virtual grid)
// ---------------------------------------------------------------------------

/** Degrees per orb cell (~55 km at the equator). */
export const ORB_CELL_DEG = 0.5;
/** Orb colours: the 6 video wraps (lib/earth/ground-video.js).
 *  Bright-gold, silver and deep-gold stay in the floor loop only. */
export const ORB_COLORS = ['magenta', 'cyan', 'blue', 'red', 'green', 'purple'];
/** Total orbs on the planet: 360 lat bands x 720 lon slots. */
export const ORB_COUNT = 360 * 720;
/** Orb body radius, metres — 1.4 m across, clearly smaller than
 *  the smallest roster vehicle (a 2.2 m bike). */
export const ORB_RADIUS_M = 0.7;
/** The orb floats this high over the street, metres (its centre),
 *  so the car drives through it. */
export const ORB_FLOAT_M = 1.2;
/** Bobbing amplitude around the float height, metres. */
export const ORB_BOB_M = 0.4;
/** Drive-through trigger radius, metres (same as the boost pads). */
export const ORB_TRIGGER_RADIUS_M = 6;
/** An orb re-arms this long after collection, milliseconds. */
export const ORB_REARM_MS = 60_000;
/** The orb sphere renders within this distance, metres. */
export const ORB_RENDER_M = 1500;
/** The orb's light beam renders within this distance, metres. */
export const ORB_BEAM_RENDER_M = 8000;
/** Jitter inside a cell, degrees (the orb never sits on the cell edge). */
export const ORB_JITTER_DEG = 0.03;

/** Cell indices + key for a lat/lon. */
export function orbCellFor(lat, lon) {
  const latIdx = Math.max(0, Math.min(359, Math.floor((lat + 90) / ORB_CELL_DEG)));
  const lonIdx = Math.max(0, Math.min(719, Math.floor((lon + 180) / ORB_CELL_DEG)));
  return { latIdx, lonIdx, key: `${latIdx}:${lonIdx}` };
}

/** The orb in a cell: deterministic from the cell key alone. */
export function orbForCell(latIdx, lonIdx) {
  const key = `${latIdx}:${lonIdx}`;
  const rand = mulberry32(fnv1a(`earth1-orb:${key}`));
  const lat = -90 + (latIdx + 0.5 + (rand() - 0.5) * 2 * (ORB_JITTER_DEG / ORB_CELL_DEG)) * ORB_CELL_DEG;
  const lon = -180 + (lonIdx + 0.5 + (rand() - 0.5) * 2 * (ORB_JITTER_DEG / ORB_CELL_DEG)) * ORB_CELL_DEG;
  const colorIndex = Math.floor(rand() * ORB_COLORS.length);
  return { id: `orb-${key}`, cellKey: key, lat, lon, color: ORB_COLORS[colorIndex], colorIndex };
}

/** Orbs whose cells overlap a radius around a lat/lon (virtual —
 *  computed, never a stored list). */
export function orbsNear(lat, lon, radiusM) {
  const latDeg = radiusM / 111320;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonDeg = radiusM / (111320 * cosLat);
  const lat0 = Math.max(0, Math.floor((lat - latDeg - ORB_CELL_DEG + 90) / ORB_CELL_DEG));
  const lat1 = Math.min(359, Math.floor((lat + latDeg + ORB_CELL_DEG + 90) / ORB_CELL_DEG));
  const lon0 = Math.max(0, Math.floor((lon - lonDeg - ORB_CELL_DEG + 180) / ORB_CELL_DEG));
  const lon1 = Math.min(719, Math.floor((lon + lonDeg + ORB_CELL_DEG + 180) / ORB_CELL_DEG));
  const out = [];
  for (let la = lat0; la <= lat1; la++) {
    for (let lo = lon0; lo <= lon1; lo++) {
      const orb = orbForCell(la, lo);
      if (haversineM(lat, lon, orb.lat, orb.lon) <= radiusM) out.push(orb);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 111320;

/** Great-circle bearing from one lat/lon to another, degrees. */
export function bearingTo(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLam) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLam);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/** Smallest signed angle from a to b, degrees (-180..180). */
export function angleDiffDeg(a, b) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return d;
}

/**
 * Closest approach of the segment (lat1,lon1)->(lat2,lon2) to a
 * point, in metres — the boost pads' sweep (lib/earth/boost-pads.js
 * segmentHitsPad), generalized so orbs share it. A fast driver
 * cannot jump over a pickup between frames.
 */
export function segmentHitsPoint(lat1, lon1, lat2, lon2, pointLat, pointLon, radiusM) {
  const cosLat = Math.cos((pointLat * Math.PI) / 180);
  const toXY = (la, lo) => ({
    x: (lo - pointLon) * cosLat * M_PER_DEG_LAT,
    y: (la - pointLat) * M_PER_DEG_LAT,
  });
  const a = toXY(lat1, lon1);
  const b = toXY(lat2, lon2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let cx;
  let cy;
  if (len2 <= 0) {
    cx = a.x;
    cy = a.y;
  } else {
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    cx = a.x + t * dx;
    cy = a.y + t * dy;
  }
  return Math.hypot(cx, cy) <= radiusM;
}

// ---------------------------------------------------------------------------
// Kart session state
// ---------------------------------------------------------------------------

/** Torpedo range, metres. */
export const TORPEDO_RANGE_M = 600;
/** Torpedo floor speed, m/s (always catches the fastest craft). */
export const TORPEDO_MIN_SPEED_MPS = 300;
/** Torpedo speed is this x the target's speed when that is faster. */
export const TORPEDO_SPEED_FACTOR = 1.3;
/** Torpedo steering rate, rad/s. */
export const TORPEDO_TURN_RAD_S = 3;
/** Torpedo hit radius, metres. */
export const TORPEDO_HIT_RADIUS_M = 8;
/** A fresh torpedo ignores its owner this long, milliseconds
 *  (the hit check — the owner is never a TARGET: targeting
 *  excludes the owner's vehicle outright, so the missile can
 *  never lock onto the driver who fired it). */
export const TORPEDO_ARM_MS = 1000;

/** Flips per torpedo / collision hit. */
export const FLIP_TURNS = 3;
/** Flip duration, milliseconds. */
export const FLIP_MS = 1500;
/** Explosion duration, milliseconds. */
export const EXPLODE_MS = 1200;
/** Invulnerability after respawn, milliseconds. */
export const INVULN_MS = 3000;

/** Hidden integrity meter max (never rendered — see kartHud). */
export const INTEGRITY_MAX = 100;
/** Below this relative speed a bump is a nudge, no damage. */
export const COLLISION_MIN_REL_MPS = 5;
/** Base collision damage per hit. */
export const COLLISION_BASE_DMG = 10;
/** +1 damage per 10 m/s of relative speed. */
export const COLLISION_DMG_CAP = 40;
/** One damage hit per vehicle pair per this long, milliseconds. */
export const COLLISION_PAIR_COOLDOWN_MS = 1000;

/** AI rival drivers on the planet. */
export const RIVAL_COUNT = 5;
/** Rivals drive at this fraction of their craft's top speed. */
export const RIVAL_SPEED_FACTOR = 0.6;
/** Missiles a rival can hold. */
export const RIVAL_ORB_CAP = 3;
/** A rival fires at the player inside this range, metres. */
export const RIVAL_FIRE_RANGE_M = 500;
/** Per-rival fire cooldown, milliseconds. */
export const RIVAL_FIRE_COOLDOWN_MS = 8000;
/** Rival spawn ring around the player, metres. */
export const RIVAL_SPAWN_MIN_M = 800;
export const RIVAL_SPAWN_MAX_M = 1500;
/** NO OVERLAPPING SPAWNS (Merlin, 2026-11-15): no two vehicles
 *  ever spawn on top of each other — player, AI rivals, peers.
 *  25 m clears the longest roster vehicle (7 m hauler) several
 *  times over and is nothing on a planet scale. Enforced at
 *  spawn (buildRivals, below) and at peer render
 *  (components/EarthPeers.jsx — a peer's real position is never
 *  moved, only its rendered body is pushed apart). */
export const SPAWN_MIN_SEPARATION_M = 25;
/** True when a lat/lon is at least minSeparationM from every
 *  point in `others` ([{ lat, lon }]). Pure — pinned in
 *  tests/earth1-round2. */
export function spawnPointClearOf(lat, lon, others, minSeparationM = SPAWN_MIN_SEPARATION_M) {
  for (const o of others || []) {
    if (o == null || o.lat == null || o.lon == null) continue;
    if (haversineM(lat, lon, o.lat, o.lon) < minSeparationM) return false;
  }
  return true;
}

/** The tapped spawn point, separation-checked (round 3): a
 *  re-spawn never lands on top of a vehicle that is already
 *  there. Returns the tap itself when it clears every point in
 *  `others` by minSeparationM; otherwise walks outward from the
 *  tap — 8 compass bearings, radii 25 / 50 / 75 / 100 m — and
 *  returns the first clear point. Falls back to 25 m north of
 *  the nearest other vehicle, so a point is always returned.
 *  Pure — pinned in tests/earth1-kart. */
export function clearSpawnPoint(lat, lon, others, minSeparationM = SPAWN_MIN_SEPARATION_M) {
  if (spawnPointClearOf(lat, lon, others, minSeparationM)) return { lat, lon };
  const radii = [minSeparationM, minSeparationM * 2, minSeparationM * 3, minSeparationM * 4];
  for (const r of radii) {
    for (let b = 0; b < 8; b++) {
      const at = destinationPoint(lat, lon, b * 45, r / EARTH_RADIUS_M);
      if (spawnPointClearOf(at.lat, at.lon, others, minSeparationM)) return at;
    }
  }
  let nearest = null;
  let nearestD = Infinity;
  for (const o of others || []) {
    if (o == null || o.lat == null || o.lon == null) continue;
    const d = haversineM(lat, lon, o.lat, o.lon);
    if (d < nearestD) { nearestD = d; nearest = o; }
  }
  if (!nearest) return { lat, lon };
  return destinationPoint(nearest.lat, nearest.lon,
    bearingTo(nearest.lat, nearest.lon, lat, lon), minSeparationM / EARTH_RADIUS_M);
}

/** The gap two vehicles must keep: their half-lengths summed
 *  plus 1 m — the same threshold the bumper collision uses to
 *  detect a contact, so a contact never means interpenetration.
 *  Pure — pinned in tests/earth1-kart. */
export function vehicleGapM(lenA, lenB) {
  return (Number(lenA) + Number(lenB)) / 2 + 1;
}

/** Push `b` away from `a` until the two sit exactly the gap
 *  apart, along the bearing a -> b. Returns b's new position
 *  (b itself is NOT mutated — the caller writes it back). When
 *  the two already clear, b comes back unchanged; when they sit
 *  exactly on top of each other the bearing reads 0 and b is
 *  pushed due north of a. Pure — pinned in tests/earth1-kart. */
export function separateFrom(a, b, lenA, lenB) {
  const gap = vehicleGapM(lenA, lenB);
  const d = haversineM(a.lat, a.lon, b.lat, b.lon);
  if (d >= gap) return { lat: b.lat, lon: b.lon };
  return destinationPoint(a.lat, a.lon, bearingTo(a.lat, a.lon, b.lat, b.lon), gap / EARTH_RADIUS_M);
}

/** Continuous separation (round 3): the bumper code only deals
 *  damage — it never moves a vehicle — so a rival that drives
 *  into the player, or a respawn that lands on one, would
 *  interpenetrate and stay there. This pass runs every frame
 *  (components/EarthKart.jsx, right after the bumper loop) and
 *  pushes any two vehicles inside the gap back out to it.
 *  `vehicles` is [{ lat, lon, fixed }] — a fixed vehicle is
 *  never moved (the player is the camera anchor); when both
 *  vehicles in a pair can move, the later entry moves; a pair
 *  of fixed vehicles is left alone. `lengthOf(v)` returns the
 *  vehicle's length in metres. Mutates lat/lon in place (like
 *  stepRivals mutates state.rivals) and returns how many
 *  vehicles were moved. The pair sweep repeats (up to 4
 *  sweeps) because pushing one vehicle out of another can push
 *  it into a third — the pass only returns once a whole sweep
 *  moves nothing, so the gap holds for every pair at the end.
 *  Pure apart from the mutation — pinned in tests/earth1-kart. */
export function separateVehicles(vehicles, lengthOf) {
  let moved = 0;
  const list = vehicles || [];
  for (let sweep = 0; sweep < 4; sweep++) {
    let sweepMoved = 0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a || !b || a.lat == null || b.lat == null) continue;
        if (a.fixed && b.fixed) continue;
        const gap = vehicleGapM(lengthOf(a), lengthOf(b));
        if (haversineM(a.lat, a.lon, b.lat, b.lon) >= gap) continue;
        const mover = a.fixed ? b : a;
        const anchor = mover === a ? b : a;
        const at = separateFrom(anchor, mover, lengthOf(anchor), lengthOf(mover));
        mover.lat = at.lat;
        mover.lon = at.lon;
        sweepMoved += 1;
      }
    }
    moved += sweepMoved;
    if (sweepMoved === 0) break;
  }
  return moved;
}
/** Rival heading wander: new heading every 6-14 s, +/-60 deg. */
export const RIVAL_TURN_MIN_S = 6;
export const RIVAL_TURN_MAX_S = 14;
export const RIVAL_TURN_SPREAD_DEG = 60;

/** Server event poll cadence, milliseconds. */
export const KART_SERVER_POLL_MS = 5000;

/** A fresh kart session. `orbs` maps collected cell keys to
 *  { readyAtMs }; `missileColors` is the FIFO queue of granted
 *  missile colours (one per collected orb — the missile wears
 *  the colour of the orb that granted it). */
export function createKartState() {
  return {
    missiles: 0,
    missileColors: [],
    lastOrbColor: 'red',
    orbs: new Map(),
    torpedoes: [],
    rivals: [],
    playerHit: { phase: 'none', startedMs: 0, lat: 0, lon: 0 },
    lastBlast: null, // { id, lat, lon, startedMs } — the explosion visual reads this
    integrity: INTEGRITY_MAX,
    invulnUntilMs: 0,
    collisionCooldowns: new Map(),
    processedNonces: new Set(),
    torpedoSeq: 0,
  };
}

/** The one session singleton the scene layer shares. */
export const kartState = createKartState();

export function resetKartStateForTests() {
  kartState.missiles = 0;
  kartState.missileColors = [];
  kartState.lastOrbColor = 'red';
  kartState.orbs = new Map();
  kartState.torpedoes = [];
  kartState.rivals = [];
  kartState.playerHit = { phase: 'none', startedMs: 0, lat: 0, lon: 0 };
  kartState.lastBlast = null;
  kartState.integrity = INTEGRITY_MAX;
  kartState.invulnUntilMs = 0;
  kartState.collisionCooldowns = new Map();
  kartState.processedNonces = new Set();
  kartState.torpedoSeq = 0;
}

// ---------------------------------------------------------------------------
// Peer hits (visual on the shooter's screen — EarthPeers animates
// the flip/explode on the peer's group from this map; the server
// event (kartServerReport) lets the victim's own client play it
// too once the migration runs)
// ---------------------------------------------------------------------------

/** peerId -> hit object (same shape as createHit()). */
export const peerHitStates = new Map();

export function startPeerHit(id, { lat, lon, nowMs }) {
  const hit = createHit();
  startHit(hit, { lat, lon, nowMs });
  peerHitStates.set(id, hit);
  return hit;
}

export function advancePeerHit(id, nowMs) {
  const hit = peerHitStates.get(id);
  if (!hit) return { phase: 'none', respawn: null };
  const out = advanceHit(hit, nowMs);
  if (out.phase === 'done') peerHitStates.delete(id);
  return out;
}

// ---------------------------------------------------------------------------
// HUD snapshot (what the in-drive HUD may show — integrity is
// deliberately ABSENT: the meter is hidden, never a visible bar)
// ---------------------------------------------------------------------------

export const kartHud = {
  speedMps: 0,
  speedKmh: 0,
  boostActive: false,
  missiles: 0,
  hitPhase: 'none',
  notice: '',
  noticeUntilMs: 0,
};

export function setKartNotice(text, nowMs, ttlMs = 2000) {
  kartHud.notice = text;
  kartHud.noticeUntilMs = nowMs + ttlMs;
  return kartHud.notice;
}

export function readKartNotice(nowMs) {
  return nowMs < kartHud.noticeUntilMs ? kartHud.notice : '';
}

// ---------------------------------------------------------------------------
// Shared peer vehicles (written by EarthPeers each frame, read by
// EarthKart for targeting + collision). Entries:
// { id, lat, lon, yawDeg, craftId, speedMps, label }
// ---------------------------------------------------------------------------

export const sharedPeerVehicles = [];

export function setSharedPeerVehicles(list) {
  sharedPeerVehicles.splice(0, sharedPeerVehicles.length, ...(list || []));
  return sharedPeerVehicles;
}

// ---------------------------------------------------------------------------
// This client's combat id (signed-in user id, else the presence
// session id — set by EarthKart on mount; peers address hits to it)
// ---------------------------------------------------------------------------

export const kartClientId = { id: null };

export function setKartClientId(id) {
  kartClientId.id = id || null;
  return kartClientId.id;
}

// ---------------------------------------------------------------------------
// Orb collection (one orb = exactly one missile)
// ---------------------------------------------------------------------------

/** True when an orb cell is ready to collect. */
export function orbReady(state, orb, nowMs) {
  const rec = state.orbs.get(orb.cellKey);
  return !rec || nowMs >= rec.readyAtMs;
}

/**
 * Drive-through collection. input: { lat, lon, prevLat, prevLon,
 * driving, nowMs }. onCollect(orb) is called per orb granted
 * (the player path increments the missile count; rivals use
 * their own sink). Returns { collected: [orb, ...] }.
 */
export function collectOrbs(state, input, onCollect) {
  const { lat, lon, driving, nowMs } = input || {};
  const collected = [];
  if (!driving || lat == null || lon == null) return { collected };
  let prevLat = input.prevLat != null ? input.prevLat : lat;
  let prevLon = input.prevLon != null ? input.prevLon : lon;
  if (haversineM(prevLat, prevLon, lat, lon) > 100) {
    prevLat = lat;
    prevLon = lon;
  }
  const candidates = orbsNear(lat, lon, 50,);
  for (const orb of candidates) {
    if (!orbReady(state, orb, nowMs)) continue;
    if (!segmentHitsPoint(prevLat, prevLon, lat, lon, orb.lat, orb.lon, ORB_TRIGGER_RADIUS_M)) continue;
    state.orbs.set(orb.cellKey, { readyAtMs: nowMs + ORB_REARM_MS });
    collected.push(orb);
    if (typeof onCollect === 'function') onCollect(orb);
  }
  return { collected };
}

/** The player-path collector: +1 missile, colour queued. */
export function collectPlayerMissile(state, orb) {
  state.missiles += 1;
  state.missileColors.push(orb.color);
  state.lastOrbColor = orb.color;
}

// ---------------------------------------------------------------------------
// Torpedoes
// ---------------------------------------------------------------------------

/**
 * Nearest other vehicle to a point, within range — the heat-
 * seeker lock (Merlin, 2026-11-15, exact rule): the missile
 * always tracks the CLOSEST vehicle TO THE MISSILE ITSELF, any
 * direction, re-evaluated continuously. vehicles:
 * [{ kind: 'player'|'rival'|'peer', id, lat, lon, speedMps }].
 * excludeKind/excludeId is the owner — a missile never locks
 * onto the vehicle that fired it. Returns the target or null.
 * Nothing in range means the torpedo flies straight and
 * fizzles at range — no fake homing onto a distant vehicle.
 */
export function nearestTarget({ lat, lon, vehicles, excludeKind, excludeId, rangeM = TORPEDO_RANGE_M }) {
  let best = null;
  let bestDist = Infinity;
  for (const v of vehicles || []) {
    if (v == null || v.lat == null || v.lon == null) continue;
    if (excludeKind != null && v.kind === excludeKind && (excludeId == null || v.id === excludeId)) continue;
    const dist = haversineM(lat, lon, v.lat, v.lon);
    if (dist > rangeM) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = { kind: v.kind, id: v.id, lat: v.lat, lon: v.lon, speedMps: v.speedMps || 0, distM: dist };
    }
  }
  return best;
}

/**
 * Fire one missile. Returns the torpedo, or null when the count
 * is 0 (the HUD disables the button at 0, so this is the guard
 * behind it). The missile wears the colour of the orb that
 * granted it (FIFO queue); server-synced missiles with no colour
 * history default to the last collected colour, else red.
 */
export function fireTorpedo(state, { lat, lon, yawDeg, nowMs, vehicles }) {
  if (!state || state.missiles <= 0) return null;
  const color = state.missileColors.length > 0 ? state.missileColors.shift() : (state.lastOrbColor || 'red');
  state.missiles -= 1;
  // Heat-seeker lock: the closest OTHER vehicle to the launch
  // point (the owner's own vehicle is never a target).
  const target = nearestTarget({ lat, lon, vehicles, excludeKind: 'player', excludeId: kartClientId.id });
  const speedMps = target
    ? Math.max(TORPEDO_MIN_SPEED_MPS, (target.speedMps || 0) * TORPEDO_SPEED_FACTOR)
    : TORPEDO_MIN_SPEED_MPS;
  state.torpedoSeq += 1;
  const torpedo = {
    id: `torp-${state.torpedoSeq}`,
    color,
    lat,
    lon,
    yawDeg: ((yawDeg % 360) + 360) % 360,
    speedMps,
    targetKind: target ? target.kind : null,
    targetId: target ? target.id : null,
    targetLat: target ? target.lat : null,
    targetLon: target ? target.lon : null,
    bornMs: nowMs,
    armedAtMs: nowMs + TORPEDO_ARM_MS,
    travelledM: 0,
    ownerKind: 'player',
    ownerId: kartClientId.id,
  };
  state.torpedoes.push(torpedo);
  return torpedo;
}

/** A rival's torpedo (same shape, owner = the rival). Locks the
 *  closest other vehicle to the rival at launch when a vehicles
 *  list is given; with only the player known (stepRivals) that
 *  is the player. In flight, stepTorpedoes re-evaluates the lock
 *  continuously, like every other missile. */
export function fireRivalTorpedo(state, rival, { nowMs, player, vehicles }) {
  if (!rival || rival.missiles <= 0) return null;
  const color = rival.missileColors.length > 0 ? rival.missileColors.shift() : (rival.lastOrbColor || 'red');
  rival.missiles -= 1;
  const target = vehicles
    ? nearestTarget({ lat: rival.lat, lon: rival.lon, vehicles, excludeKind: 'rival', excludeId: rival.id })
    : (player ? { kind: 'player', id: 'player', lat: player.lat, lon: player.lon, speedMps: player.speedMps || 0 } : null);
  const speedMps = target
    ? Math.max(TORPEDO_MIN_SPEED_MPS, (target.speedMps || 0) * TORPEDO_SPEED_FACTOR)
    : TORPEDO_MIN_SPEED_MPS;
  state.torpedoSeq += 1;
  const torpedo = {
    id: `torp-${state.torpedoSeq}`,
    color,
    lat: rival.lat,
    lon: rival.lon,
    yawDeg: ((rival.yawDeg % 360) + 360) % 360,
    speedMps,
    targetKind: target ? target.kind : null,
    targetId: target ? target.id : null,
    targetLat: target ? target.lat : null,
    targetLon: target ? target.lon : null,
    bornMs: nowMs,
    armedAtMs: nowMs + TORPEDO_ARM_MS,
    travelledM: 0,
    ownerKind: 'rival',
    ownerId: rival.id,
  };
  state.torpedoes.push(torpedo);
  return torpedo;
}

/**
 * Step every torpedo one frame. vehicles: the live list —
 * [{ kind: 'player'|'rival'|'peer', id, lat, lon, speedMps,
 * invulnUntilMs }] — so a torpedo steers at its target's CURRENT
 * position and hits the FIRST vehicle it touches (red-shell law).
 * Returns events: { type: 'hit', torpedoId, targetKind, targetId,
 * lat, lon } | { type: 'fizzle', torpedoId, lat, lon }.
 * Invulnerable vehicles are passed through, never hit.
 *
 * HEAT-SEEKER RE-EVALUATION (Merlin, 2026-11-15): before
 * steering, the lock is re-computed from the missile's CURRENT
 * position — the closest other vehicle to the missile itself.
 * If another vehicle has passed closer than the current target,
 * the missile SWITCHES target and chases that vehicle instead.
 * It always hunts whoever is nearest to it at that moment.
 */
export function stepTorpedoes(state, { dt, nowMs, vehicles }) {
  const events = [];
  const remaining = [];
  for (const t of state.torpedoes) {
    // Current target's live position (the player is unique by
    // kind — there is only one local driver; rivals and peers
    // match by kind + id).
    let target = null;
    if (t.targetKind && t.targetId) {
      target = (vehicles || []).find((v) => (
        t.targetKind === 'player' ? v.kind === 'player'
          : (v.kind === t.targetKind && v.id === t.targetId)
      )) || null;
    }
    // Re-evaluate the lock from the missile's current position:
    // whoever is nearest to the missile right now wins. A
    // closer passer-by steals the lock from the current target.
    const nearest = nearestTarget({ lat: t.lat, lon: t.lon, vehicles, excludeKind: t.ownerKind, excludeId: t.ownerId });
    if (nearest && (!target
      || (nearest.kind !== target.kind || nearest.id !== target.id)
      && nearest.distM < haversineM(t.lat, t.lon, target.lat, target.lon))) {
      t.targetKind = nearest.kind;
      t.targetId = nearest.id;
      target = nearest;
    }
    if (target) {
      t.targetLat = target.lat;
      t.targetLon = target.lon;
    }
    const aimLat = target ? target.lat : t.targetLat;
    const aimLon = target ? target.lon : t.targetLon;
    if (aimLat != null && aimLon != null) {
      const want = bearingTo(t.lat, t.lon, aimLat, aimLon);
      const diff = angleDiffDeg(t.yawDeg, want);
      const maxTurn = TORPEDO_TURN_RAD_S * dt * (180 / Math.PI);
      t.yawDeg = ((t.yawDeg + Math.max(-maxTurn, Math.min(maxTurn, diff))) % 360 + 360) % 360;
    }
    const distM = t.speedMps * dt;
    const at = destinationPoint(t.lat, t.lon, t.yawDeg, distM / EARTH_RADIUS_M);
    t.lat = at.lat;
    t.lon = at.lon;
    t.travelledM += distM;

    // Hit: the first vehicle within the hit radius — except the
    // owner while the torpedo is still arming (an owner id of
    // null — guest, id not resolved yet — still counts as the
    // owner by kind), and except anyone invulnerable (fresh
    // respawn).
    let hit = null;
    for (const v of vehicles || []) {
      if (!v || v.lat == null) continue;
      const isOwner = v.kind === t.ownerKind && (t.ownerId == null || v.id === t.ownerId);
      if (isOwner && nowMs < t.armedAtMs) continue;
      if (v.invulnUntilMs && nowMs < v.invulnUntilMs) continue;
      if (haversineM(t.lat, t.lon, v.lat, v.lon) <= TORPEDO_HIT_RADIUS_M) {
        hit = v;
        break;
      }
    }
    if (hit) {
      events.push({ type: 'hit', torpedoId: t.id, targetKind: hit.kind, targetId: hit.id, lat: hit.lat, lon: hit.lon });
      continue;
    }
    if (t.travelledM >= TORPEDO_RANGE_M) {
      events.push({ type: 'fizzle', torpedoId: t.id, lat: t.lat, lon: t.lon });
      continue;
    }
    remaining.push(t);
  }
  state.torpedoes = remaining;
  return events;
}

// ---------------------------------------------------------------------------
// Hit sequence: flip 3x -> explode -> respawn at the blast spot
// ---------------------------------------------------------------------------

export function createHit() {
  return { phase: 'none', startedMs: 0, lat: 0, lon: 0 };
}

export function startHit(hit, { lat, lon, nowMs }) {
  hit.phase = 'flipping';
  hit.startedMs = nowMs;
  hit.lat = lat;
  hit.lon = lon;
  return hit;
}

/**
 * Advance a hit. Returns { phase, respawn } — respawn is
 * { lat, lon } (the blast spot) exactly when the sequence ends,
 * else null. The caller applies the respawn: same vehicle, same
 * craft, speed 0, integrity restored, 3 s invulnerable.
 * `others` (optional, [{ lat, lon }]) separation-checks the
 * spot (round 3): when another vehicle sits on the blast spot
 * the respawn walks to the nearest clear point 25 m out, so no
 * vehicle ever respawns on top of another. With no `others`
 * the spot is the blast spot exactly, as Merlin ordered
 * ("respawns where they blew up").
 */
export function advanceHit(hit, nowMs, others = null) {
  if (!hit || hit.phase === 'none' || hit.phase === 'done') {
    return { phase: hit ? hit.phase : 'none', respawn: null };
  }
  const elapsed = nowMs - hit.startedMs;
  if (hit.phase === 'flipping' && elapsed >= FLIP_MS) {
    hit.phase = 'exploding';
    return { phase: 'exploding', respawn: null };
  }
  if (hit.phase === 'exploding' && elapsed >= FLIP_MS + EXPLODE_MS) {
    hit.phase = 'done';
    const spot = others && others.length
      ? clearSpawnPoint(hit.lat, hit.lon, others)
      : { lat: hit.lat, lon: hit.lon };
    return { phase: 'done', respawn: spot };
  }
  return { phase: hit.phase, respawn: null };
}

/** Roll angle for the flip animation, radians (0..3 turns). */
export function flipRollAngle(hit, nowMs) {
  if (!hit || hit.phase !== 'flipping') return 0;
  const p = Math.max(0, Math.min(1, (nowMs - hit.startedMs) / FLIP_MS));
  return p * FLIP_TURNS * Math.PI * 2;
}

/** The respawn rule, as data: blast spot, in-vehicle, speed 0,
 *  integrity restored, invulnerable 3 s. `others` (optional,
 *  [{ lat, lon }]) separation-checks the spot (round 3) the same
 *  way advanceHit does — the blast spot stands when it is
 *  clear, and walks to the nearest clear point 25 m out when
 *  another vehicle sits on it. */
export function respawnFor(blastLat, blastLon, nowMs, others = null) {
  const spot = others && others.length
    ? clearSpawnPoint(blastLat, blastLon, others)
    : { lat: blastLat, lon: blastLon };
  return {
    lat: spot.lat,
    lon: spot.lon,
    speed: 0,
    integrity: INTEGRITY_MAX,
    invulnUntilMs: nowMs + INVULN_MS,
  };
}

// ---------------------------------------------------------------------------
// Bumper-car collision damage (hidden integrity meter)
// ---------------------------------------------------------------------------

/** Damage for a hit at a relative speed, m/s. 0 below the nudge floor. */
export function collisionDamageFor(relSpeedMps) {
  const rel = Number(relSpeedMps) || 0;
  if (rel < COLLISION_MIN_REL_MPS) return 0;
  return Math.min(COLLISION_DMG_CAP, COLLISION_BASE_DMG + Math.round(rel / 10));
}

/**
 * Apply a bumper-car contact between two vehicles.
 * a, b: { kind: 'player'|'rival'|'peer', id }.
 * Returns [{ target, dmg, boom }] — boom when that vehicle's
 * integrity hits 0 (the caller starts its hit sequence).
 * Both vehicles take the SAME damage (bumper-car law).
 * One hit per pair per second, so a single contact never
 * multi-hits across frames.
 */
export function applyCollisionDamage(state, { a, b, relSpeedMps, nowMs }) {
  const dmg = collisionDamageFor(relSpeedMps);
  if (dmg <= 0) return [];
  const pairKey = [a.id, b.id].sort().join('<>');
  const readyAt = state.collisionCooldowns.get(pairKey) || 0;
  if (nowMs < readyAt) return [];
  state.collisionCooldowns.set(pairKey, nowMs + COLLISION_PAIR_COOLDOWN_MS);
  const out = [];
  for (const v of [a, b]) {
    if (v.kind === 'player') {
      state.integrity = Math.max(0, state.integrity - dmg);
      out.push({ target: v, dmg, boom: state.integrity <= 0 });
    } else if (v.kind === 'rival') {
      const rival = state.rivals.find((r) => r.id === v.id);
      if (rival) {
        rival.integrity = Math.max(0, rival.integrity - dmg);
        out.push({ target: v, dmg, boom: rival.integrity <= 0 });
      }
    } else {
      // Peers: their integrity lives on THEIR client — the hit is
      // reported to the server (reportEvent) so their client can
      // apply it. Locally we record the damage dealt, no boom.
      out.push({ target: v, dmg, boom: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI rivals
// ---------------------------------------------------------------------------

/** Build the 5 rival drivers around the player's spawn.
 *  NO OVERLAPPING SPAWNS: each rival's spot is rejection-
 *  sampled until it clears the player AND every rival placed
 *  before it by SPAWN_MIN_SEPARATION_M (25 m); after 40 tries
 *  the best (farthest-clearing) draw wins, so a spawn never
 *  lands on top of another vehicle. Deterministic per seed. */
export function buildRivals({ playerLat, playerLon, playerCraftId, seed = 20261115 }) {
  const rand = mulberry32(fnv1a(`earth1-rivals:${seed}:${playerLat.toFixed(3)},${playerLon.toFixed(3)}`));
  const pool = VEHICLES.filter((v) => v.id !== playerCraftId);
  const rivals = [];
  const placed = [{ lat: playerLat, lon: playerLon }];
  for (let i = 0; i < RIVAL_COUNT; i++) {
    const craft = pool[Math.floor(rand() * pool.length)];
    let best = null;
    let bestClear = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const bearing = rand() * 360;
      const distM = RIVAL_SPAWN_MIN_M + rand() * (RIVAL_SPAWN_MAX_M - RIVAL_SPAWN_MIN_M);
      const at = destinationPoint(playerLat, playerLon, bearing, distM / EARTH_RADIUS_M);
      let clear = Infinity;
      for (const o of placed) clear = Math.min(clear, haversineM(at.lat, at.lon, o.lat, o.lon));
      if (clear >= SPAWN_MIN_SEPARATION_M) { best = at; break; }
      if (clear > bestClear) { bestClear = clear; best = at; }
    }
    const at = best;
    rivals.push({
      id: `rival-${i + 1}`,
      craftId: craft.id,
      lat: at.lat,
      lon: at.lon,
      yawDeg: rand() * 360,
      speed: 0, // flight units; ramps up in stepRivals
      missiles: 0,
      missileColors: [],
      lastOrbColor: 'red',
      integrity: INTEGRITY_MAX,
      hit: createHit(),
      lastFireMs: 0,
      nextTurnMs: 0,
      targetYawDeg: null,
      lastLat: at.lat,
      lastLon: at.lon,
    });
    placed.push({ lat: at.lat, lon: at.lon });
  }
  return rivals;
}

/**
 * Step all rivals one frame. input: { dt, nowMs, player } where
 * player = { lat, lon, speedMps }. Moves each rival (stepFlight
 * for speed/yaw + great-circle step, same x3 globe factor as the
 * player's car), wanders headings, collects orbs it drives
 * through, and fires at the player inside 500 m. Returns
 * { fired: [torpedo, ...] }. Rivals never leave lat +/-85.
 */
export function stepRivals(state, { dt, nowMs, player }) {
  const fired = [];
  for (const rival of state.rivals) {
    const craft = getVehicle(rival.craftId);
    const tuning = (craft && craft.tuning) || { maxSpeed: 45, accel: 38, turnRate: 2.9, boostMult: 1.6, brakeRate: 45 };
    // A hit rival does not drive — the hit sequence owns it.
    if (rival.hit.phase === 'flipping' || rival.hit.phase === 'exploding') continue;
    // Wander: pick a new heading every 6-14 s, +/-60 deg.
    if (nowMs >= rival.nextTurnMs) {
      const span = RIVAL_TURN_MAX_S - RIVAL_TURN_MIN_S;
      rival.nextTurnMs = nowMs + (RIVAL_TURN_MIN_S + Math.random() * span) * 1000;
      rival.targetYawDeg = ((rival.yawDeg + (Math.random() - 0.5) * 2 * RIVAL_TURN_SPREAD_DEG) % 360 + 360) % 360;
    }
    const wantTurn = rival.targetYawDeg == null
      ? 0
      : Math.max(-1, Math.min(1, angleDiffDeg(rival.yawDeg, rival.targetYawDeg) / 30));
    const f = { pos: { x: 0, y: 0, z: 0 }, yaw: (rival.yawDeg * Math.PI) / 180, pitch: 0, speed: rival.speed };
    const targetSpeed = tuning.maxSpeed * RIVAL_SPEED_FACTOR;
    const next = stepFlight(f, { thrust: 1, turn: wantTurn, pitch: 0, boost: false, brake: false }, dt, {
      ...tuning,
      maxSpeed: targetSpeed,
    });
    rival.speed = next.speed;
    rival.yawDeg = ((next.yaw * 180) / Math.PI % 360 + 360) % 360;
    const distM = next.speed * dt * 3;
    const at = destinationPoint(rival.lat, rival.lon, rival.yawDeg, distM / EARTH_RADIUS_M);
    const prevLat = rival.lat;
    const prevLon = rival.lon;
    rival.lat = Math.max(-85, Math.min(85, at.lat));
    let lo = at.lon;
    while (lo > 180) lo -= 360;
    while (lo < -180) lo += 360;
    rival.lon = lo;
    // Orbs: a rival that drives through one banks it (cap 3).
    collectOrbs(state, { lat: rival.lat, lon: rival.lon, prevLat, prevLon, driving: true, nowMs }, (orb) => {
      if (rival.missiles < RIVAL_ORB_CAP) {
        rival.missiles += 1;
        rival.missileColors.push(orb.color);
        rival.lastOrbColor = orb.color;
      }
    });
    rival.lastLat = prevLat;
    rival.lastLon = prevLon;
    // Fire at the player inside 500 m, at most once per 8 s.
    if (player && rival.missiles > 0 && nowMs - rival.lastFireMs >= RIVAL_FIRE_COOLDOWN_MS) {
      const dist = haversineM(rival.lat, rival.lon, player.lat, player.lon);
      if (dist <= RIVAL_FIRE_RANGE_M) {
        const torp = fireRivalTorpedo(state, rival, { nowMs, player });
        if (torp) {
          rival.lastFireMs = nowMs;
          fired.push(torp);
        }
      }
    }
  }
  return { fired };
}

// ---------------------------------------------------------------------------
// Server layer (best-effort — the missile inventory + combat events
// live in Supabase once supabase/earth1-kart.sql runs; until then
// every call resolves to "unavailable" and the session stays
// local. Nothing here ever throws.)
// ---------------------------------------------------------------------------

const KART_API = '/api/earth1/kart';

export const kartServer = {
  available: null, // null = unknown, true/false = probed
  missiles: null,
};

async function kartFetch(body) {
  try {
    if (typeof fetch === 'undefined') return null;
    const res = await fetch(KART_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res || !res.ok) {
      if (res && res.status === 503) kartServer.available = false;
      return null;
    }
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Probe + sync: the server count wins when it answers. */
export async function kartServerSync(state) {
  try {
    if (typeof fetch === 'undefined') return false;
    const res = await fetch(`${KART_API}?action=count`);
    if (!res || !res.ok) {
      if (res && res.status === 503) kartServer.available = false;
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data.missiles !== 'number') return false;
    kartServer.available = true;
    kartServer.missiles = data.missiles;
    if (state) {
      state.missiles = data.missiles;
      if (state.missiles === 0) state.missileColors = [];
    }
    return true;
  } catch {
    return false;
  }
}

/** Orb collected: +1 missile, server-side. Returns the count or null.
 *  The server is the persistent RECORD — the local session count
 *  stays the session truth (a grant response never overwrites it:
 *  two grants in flight could otherwise land out of order and
 *  knock the count backward). Only the load-time sync overwrites. */
export async function kartServerGrant(state) {
  const data = await kartFetch({ action: 'grant' });
  if (!data || typeof data.missiles !== 'number') return null;
  kartServer.available = true;
  kartServer.missiles = data.missiles;
  return data.missiles;
}

/** Fire pressed: spend 1 missile, server-side. Returns { ok, missiles } or null.
 *  Same record-only semantics as the grant (see above). */
export async function kartServerSpend(state) {
  const data = await kartFetch({ action: 'spend' });
  if (!data || typeof data.missiles !== 'number') return null;
  kartServer.available = true;
  kartServer.missiles = data.missiles;
  return { ok: !!data.ok, missiles: data.missiles };
}

/** Report a combat event (torpedo / collision hit on a peer) so
 *  the victim's client can play it. Fire-and-forget. */
export async function kartServerReport(event) {
  if (!event || !event.targetId) return false;
  const data = await kartFetch({ action: 'report', event });
  return !!(data && data.ok);
}

/** Poll recent combat events addressed to this client. Returns
 *  the event list (possibly empty) or null when unavailable. */
export async function kartServerPoll() {
  const data = await kartFetch({ action: 'poll' });
  if (!data || !Array.isArray(data.events)) return null;
  kartServer.available = true;
  return data.events;
}
