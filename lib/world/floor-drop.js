// lib/world/floor-drop.js — THE SHARED FLOOR-DROP MECHANISM (WS-C, Merlin, Nov 16, 2026).
//
// ONE implementation for every realm, mirroring the Anti-Life floor
// portal (lib/afterlife/anti-life-portal.js) exactly: one disc
// constant + one `isOn…` position test + one CameraRig guard pattern
// (own once-per-entry state, 1500 ms re-arm) + one page callback.
// The Hades lava drop (lib/nether-realm/world.js nearestLavaPool) is
// the same shape with a different trigger.
//
// HONEST STATEMENT ABOUT THE FLOOR (audit §1.2/§1.3, verified in
// code): NO floor mesh is cut in any realm. Every floor is one flat
// r400 disc (circleGeometry [400, 64] at y = 0), and every "fall" in
// the game today is a position trigger on top of the floor plus
// travel — never a hole in the geometry. The Land of the Dead opening
// is the same kind of thing: a visible disc drawn on the floor (the
// Anti-Life shape: ashen core + coloured rim at y 0.1/0.12) + a
// position test in the CameraRig + a gravity-timed fall. Nothing here
// claims a cut mesh. Cutting one would mean replacing Ground() in
// all 24 world3d.js files — not done, not claimed.
//
// THE DROP (what the trigger starts):
// - The trapdoor beat: closed → opening → open → dropping (the state
//   machine below). The disc is the visible opening; the fall is a
//   real gravity integration (depth = 1/2 g t^2, g = 9.81) driving the
//   shaft-descent overlay, then the user arrives in the Land of the
//   Dead. Not a teleport, not a fade.
// - The way back is a portal in the Land of the Dead's floor, and it
//   returns the user to the realm they dropped from (Merlin,
//   Nov 16 ~04:04 — DECIDED). See ORIGIN TRACKING below.
//
// THE SPOTS (audit §6 — the (-70, 110) Anti-Life disc is TAKEN in
// all 13 nether realms, FREE in all 11 heaven realms):
// - Nether realms: the mirror spot (+70, 110) r8 — same clearance
//   logic as the Anti-Life spot (clear of spawn (0,160), Gates
//   (0,70), river z ±18, plaza/arches around (0,-130), all three
//   region discs, and — in Hades — Medusa's Lair (-260,120)).
// - Heaven realms: the Anti-Life spot itself (-70, 110) r8 — free
//   there, since no heaven realm has an Anti-Life disc.
//
// ORIGIN TRACKING (Merlin's decided return rule — the drop MUST
// remember where the user came from):
// - The origin realm key travels in TWO places at once, so the drop
//   survives a full page navigation to /land-of-the-dead:
//   (1) the destination URL itself: /land-of-the-dead?from=<key>;
//   (2) sessionStorage under FLOOR_DROP_STORAGE_KEY, written the
//   moment the drop starts. The return reads the URL first (it
//   survives a reload and a shared link), then sessionStorage.
// - The return CONSUMES the stored origin (single-use): once the
//   user is back, a stale origin cannot send a later visitor to the
//   wrong realm.
// - MISSING ORIGIN: the return falls back to the portal room
//   (/portal-room) — the user is never stranded, and the orb says so
//   ("Back to the Portal Room") instead of pretending it knows.
//
// Pure: no DOM, no React — node tests drive this module directly.
// The only browser touch is the optional `storage` argument, which
// callers pass as window.sessionStorage (tests pass a fake).

import { PORTAL_REALMS, portalRealmByKey } from '../portal/realms.js';

/** The destination realm of every drop. */
export const FLOOR_DROP_ROUTE = '/land-of-the-dead';

/** What the disc's floating label names. */
export const FLOOR_DROP_PORTAL_NAME = 'Land of the Dead';

/** Where the drop origin is kept for the return trip. */
export const FLOOR_DROP_STORAGE_KEY = 'lotd-drop-origin';

/** Where the return goes when no origin survived the drop. */
export const FLOOR_DROP_FALLBACK_ROUTE = '/portal-room';

/** Earth gravity, m/s^2 — the fall is a real integration, not a timer. */
export const FLOOR_DROP_GRAVITY = 9.81;

/** How far the shaft drops before the Land of the Dead (metres). */
export const FLOOR_DROP_DEPTH = 25;

/** How long the floor takes to give way after the disc fires (ms). */
export const FLOOR_DROP_OPEN_MS = 700;

/** Pause with the floor open before the fall begins (ms). */
export const FLOOR_DROP_OPEN_PAUSE_MS = 300;

/** Radius of the return portal in the Land of the Dead (metres). */
export const FLOOR_DROP_RETURN_RADIUS = 2.2;

/** The four phases of one drop. */
export const FLOOR_DROP_PHASES = ['closed', 'opening', 'open', 'dropping'];

/** Plain-English line for the HUD hint, mirroring ANTI_LIFE_HINT. */
export const FLOOR_DROP_HINT = 'step onto the dark floor disc to drop to the Land of the Dead';

// --- the discs: one per side, mirroring ANTI_LIFE_PORTAL --------------

/**
 * The one disc, in every nether realm: the mirror of the Anti-Life
 * spot, (+70, 110) r8. The (-70, 110) disc there is the Anti-Life
 * fall — this one must not collide with it.
 */
export const FLOOR_DROP_DISC_NETHER = {
  key: 'floor-drop',
  name: 'Land of the Dead',
  x: 70,
  z: 110,
  r: 8,
};

/**
 * The one disc, in every heaven realm: the Anti-Life spot itself,
 * (-70, 110) r8 — free there, since no heaven realm has an
 * Anti-Life disc.
 */
export const FLOOR_DROP_DISC_HEAVEN = {
  key: 'floor-drop',
  name: 'Land of the Dead',
  x: -70,
  z: 110,
  r: 8,
};

/** The disc for a side ('nether' | 'heaven'). */
export function floorDropDiscForSide(side) {
  return side === 'heaven' ? FLOOR_DROP_DISC_HEAVEN : FLOOR_DROP_DISC_NETHER;
}

/**
 * True when (x, z) is standing on the floor-drop disc. The trigger
 * is the disc's own radius, exactly like the Anti-Life disc and the
 * lava drop: stepping onto the disc is the fall. A walker standing
 * exactly on the rim is not yet in.
 */
export function isOnFloorDropDisc(x, z, disc) {
  if (!disc || typeof disc.x !== 'number' || typeof disc.z !== 'number' || typeof disc.r !== 'number') return false;
  const dx = Number(x) - disc.x;
  const dz = Number(z) - disc.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  return dx * dx + dz * dz < disc.r * disc.r;
}

// --- the guard: once per entry, 1500 ms re-arm, mirroring the rigs ----

/** How long after a firing the guard stays deaf (ms) — the arches' 1500. */
export const FLOOR_DROP_GUARD_REARM_MS = 1500;

/**
 * Fresh guard state. Each CameraRig holds its OWN guard object (one
 * `useRef(createFloorDropGuard())` per rig, beside the arch and
 * Anti-Life guards) — the state is per-rig, the logic is shared.
 */
export function createFloorDropGuard() {
  return { lastMs: 0, traveling: false };
}

/**
 * The once-per-entry guard, mirroring the Anti-Life guard in every
 * nether CameraRig (and the arch guard everywhere): fires true the
 * first frame the walker is on the disc, then stays silent while
 * they stand on it, and re-arms only after they step back out AND
 * FLOOR_DROP_GUARD_REARM_MS have passed since the last firing.
 * `nowMs` is the rig clock in ms (state.clock.elapsedTime * 1000).
 * Returns false for a missing guard/disc or a non-finite clock.
 */
export function floorDropGuardShouldFire(guard, x, z, disc, nowMs) {
  if (!guard || !disc || !Number.isFinite(nowMs)) return false;
  if (!isOnFloorDropDisc(x, z, disc)) {
    guard.traveling = false;
    return false;
  }
  if (guard.traveling) return false;
  if (nowMs - guard.lastMs <= FLOOR_DROP_GUARD_REARM_MS) return false;
  guard.traveling = true;
  guard.lastMs = nowMs;
  return true;
}

/** Is this a realm key the portals know (i.e. a valid drop origin)? */
export function isKnownRealmKey(key) {
  return typeof key === 'string' && portalRealmByKey(key) !== null;
}

/** The route a realm key drops from / returns to (null when unknown). */
export function routeForRealmKey(key) {
  const realm = typeof key === 'string' ? portalRealmByKey(key) : null;
  return realm ? realm.route : null;
}

/** The label of a realm key (for the return orb). */
export function labelForRealmKey(key) {
  const realm = typeof key === 'string' ? portalRealmByKey(key) : null;
  return realm ? realm.label : null;
}

// --- the drop state machine ----------------------------------------------

/** Fresh drop state for a realm: the door starts closed. */
export function createFloorDropState(origin) {
  return { phase: 'closed', origin: isKnownRealmKey(origin) ? origin : null };
}

/**
 * One pure transition. Events: 'open' (closed -> opening),
 * 'opened' (opening -> open), 'drop' (open -> dropping),
 * 'reset' (any -> closed). Anything else leaves the state untouched,
 * so a double-tap or a stray event can never re-fire the drop.
 */
export function floorDropNext(state, event) {
  if (!state || typeof state.phase !== 'string') return createFloorDropState(null);
  if (event === 'reset') return { phase: 'closed', origin: state.origin };
  if (event === 'open' && state.phase === 'closed') return { phase: 'opening', origin: state.origin };
  if (event === 'opened' && state.phase === 'opening') return { phase: 'open', origin: state.origin };
  if (event === 'drop' && state.phase === 'open') return { phase: 'dropping', origin: state.origin };
  return state;
}

/** The drop destination for an origin: the Land of the Dead, carrying `from`. */
export function dropDestination(origin) {
  if (isKnownRealmKey(origin)) return `${FLOOR_DROP_ROUTE}?from=${encodeURIComponent(origin)}`;
  return FLOOR_DROP_ROUTE;
}

// --- gravity: the fall is an integration, not a timer ---------------------

/** Metres fallen after t seconds of free fall from rest: 1/2 g t^2. */
export function fallDistanceAtTime(tSeconds) {
  const t = Math.max(0, tSeconds);
  return 0.5 * FLOOR_DROP_GRAVITY * t * t;
}

/** Seconds of free fall to cover `depth` metres from rest. */
export function fallTimeForDepth(depth) {
  return Math.sqrt((2 * Math.max(0, depth)) / FLOOR_DROP_GRAVITY);
}

/** Downward speed (m/s) after t seconds of free fall from rest. */
export function fallVelocityAtTime(tSeconds) {
  return FLOOR_DROP_GRAVITY * Math.max(0, tSeconds);
}

/** How long the whole fall lasts for the shaft depth (seconds). */
export function floorDropFallSeconds() {
  return fallTimeForDepth(FLOOR_DROP_DEPTH);
}

// --- origin storage: how the return knows where the user came from ------

/** Remember the origin for the return trip (call when the drop starts). */
export function storeDropOrigin(origin, storage) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  if (!isKnownRealmKey(origin)) return false;
  try {
    storage.setItem(FLOOR_DROP_STORAGE_KEY, origin);
    return true;
  } catch {
    return false;
  }
}

/** Read a stored origin (null when nothing was stored or it is unknown). */
export function readStoredDropOrigin(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(FLOOR_DROP_STORAGE_KEY);
    return isKnownRealmKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Forget the stored origin — the return consumes it (single-use). */
export function clearDropOrigin(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return false;
  try {
    storage.removeItem(FLOOR_DROP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The `from` value of a "?from=<key>" query string (null when absent
 * or not a realm the portals know). Accepts a full search string
 * ("?from=helheim") or a bare query ("from=helheim").
 */
export function dropOriginFromSearch(search) {
  if (typeof search !== 'string' || !search) return null;
  const query = search.startsWith('?') ? search.slice(1) : search;
  try {
    const params = new URLSearchParams(query);
    const from = params.get('from');
    return isKnownRealmKey(from) ? from : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the drop origin on arrival in the Land of the Dead.
 * URL first (survives reloads and shared links), then sessionStorage
 * (survives the navigation even if the URL is ever stripped).
 */
export function resolveDropOrigin(search, storage) {
  return dropOriginFromSearch(search) || readStoredDropOrigin(storage);
}

/**
 * Where the floor portal in the Land of the Dead returns the user:
 * the route of the realm they dropped from — or the portal room
 * when no origin survived the drop.
 */
export function returnRouteForOrigin(origin) {
  return routeForRealmKey(origin) || FLOOR_DROP_FALLBACK_ROUTE;
}

/** Every realm the floor drop is wired into (the portal registry — one list, no copies). */
export function floorDropRealmKeys() {
  return PORTAL_REALMS.map((r) => r.key);
}
