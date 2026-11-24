// lib/sun-base.js — THE SUN BASE (Merlin, Nov 13, 2026).
//
// A base for each user inside the sun. Entry (his design, same
// concept as the Heaven portal): pass through the sun to enter, or
// click/tap it — and clicking PULLS the user into the sun: the
// camera is visibly drawn toward and into it (a pull/suck motion,
// like the portal gun's "sucks the user into place"), then the
// transition, then they arrive inside their base.
//
// THE SUN already exists in the hub (components/HomeScene.jsx
// SunBackground, at SUN_CENTER below, radius 67.5, solid collider
// 68) — this module does NOT move it. The sun base wires entry onto
// that sun: click + fly-through, both landing on /sun-base.
//
// THE BASE: one interior per user, picked from the 3 RESERVED
// interiors (lib/earth2/fittings.js RESERVED_SUN_BASE_INTERIORS —
// the farmhouse, the barn, the windmill, held back from Earth 2
// for exactly this). The pick persists device-local in localStorage
// (the portal progress pattern, lib/portal/progress.js — the
// /api/ui-state whitelist has no sun-base key either, so there is
// no server mirror until Merlin rules on that gap). Default when
// no pick is stored: the farmhouse (most livable).
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly. The interior spec resolution lives in
// lib/sun-base-spec.js (it imports the Earth 2 fittings data, which
// stays out of the hub bundle).

import { SUN_CENTER, SUN_RADIUS } from './omega-arch.js';
import { RESERVED_SUN_BASE_INTERIORS } from './earth2/fittings.js';

export { SUN_CENTER, SUN_RADIUS };

/** The sun-base route — the user's own base, inside the sun. */
export const SUN_BASE_ROUTE = '/sun-base';

/**
 * THE SHRINK (Merlin, Nov 13, 2026 — "I want the room to be huge
 * for them"): inside the sun base the user is ONE-FIFTH their
 * normal size, so the same room reads FIVE TIMES bigger. The
 * farmhouse (9 m) reads as a 45 m hall, the windmill (10 m) as
 * 50 m, the barn (12 m) as a 60 m hall — ceilings included. The
 * shrink is not subtle on purpose: the room should feel vast.
 * Everything about the user's SIZE scales with them — eye height
 * and how close they can step to a wall — but the STRIDE does
 * not: Merlin, Nov 14, 2026 — "Match motion speed when in
 * miniature mode ... as you'd have at normal size." The room
 * reads huge because the eye is small; the user still crosses it
 * at their normal walking pace.
 */
export const SUN_BASE_USER_SCALE = 0.2;

/** Eye height inside the base: the 1.7 m eye × the 0.2 scale. */
export const SUN_BASE_EYE_HEIGHT_M = 0.34;

/** Walk speed inside the base: the NORMAL-SIZE 3.2 m/s stride,
 *  unscaled (Merlin, Nov 14, 2026 — motion speed in miniature
 *  mode matches normal size). The eye stays 0.34 m, so the room
 *  still reads five times bigger — only the crossing time is
 *  normal: the farmhouse reads as a 45 m hall you can still walk
 *  across at your usual pace. */
export const SUN_BASE_WALK_SPEED_MPS = 3.2;

/** How close the walker may step to a wall: 0.7 m × the 0.2 scale. */
export const SUN_BASE_WALL_MARGIN_M = 0.14;

/** How far out from the doorway wall the exit trigger reaches:
 *  0.5 m. The walker is clamped 0.14 m from the wall and the
 *  light-spill plane sits 0.05 m inside it, so the trigger fires
 *  as the walker steps INTO the doorway mouth — the glow filling
 *  the view — and the hub arrives before the flat-yellow dead
 *  end the phone video showed. (Merlin, Nov 24, 2026: walking
 *  through the doorway exits to the hub.) */
export const SUN_BASE_DOORWAY_TRIGGER_DEPTH_M = 0.5;

/**
 * How big one of the base's rooms reads to the shrunken user:
 * every dimension divided by the user scale. The room itself
 * never moves — only the user shrinks.
 */
export function sunBaseRoomReadsM(spec) {
  if (!spec) return null;
  const s = SUN_BASE_USER_SCALE;
  return {
    widthM: spec.widthM / s,
    depthM: spec.depthM / s,
    heightM: spec.heightM / s,
  };
}

/** Device-local pick storage (portal-progress pattern). */
export const SUN_BASE_STORAGE_KEY = 'olympus:sun-base:v1';

/**
 * THE PULL — how long the click pull takes, camera to sun. 1400 ms:
 * long enough to read as a real draw-in (the camera visibly travels
 * into the sun, the sun flares as you close), short enough not to
 * feel like a loading screen. Ease-in cubic: it accelerates, like
 * being sucked in — it never crawls at a constant speed.
 */
export const SUN_BASE_PULL_MS = 1400;

/**
 * FLY-THROUGH TRIGGER — how close the camera must get to the sun's
 * centre to count as passing through it. The sun's solid collider
 * (radius 68) rests a free-fly camera at ~69.2 (68 + 1.2 rider) and
 * a bike at ~71 (68 + 3); the trigger sits just outside both
 * resting distances, so pressing into the sun enters, while a
 * fly-by more than ~3.5 units off the surface does not.
 */
export const SUN_BASE_TRIGGER_RADIUS = SUN_RADIUS + 4;

/** The three interiors a user may pick for their base. */
export const SUN_BASE_OPTIONS = RESERVED_SUN_BASE_INTERIORS.map((r) => ({
  assetId: r.assetId,
  class: r.class,
  why: r.why,
}));

/** Human labels for the three options (the class labels are the
 *  Earth 1 interior names; the base shows the building's own name). */
export const SUN_BASE_OPTION_LABELS = {
  'e023-prairie-farmhouse': 'Farmhouse',
  'e021-red-gambrel-barn': 'Barn',
  'e024-farm-windmill': 'Windmill',
};

/** The default interior when no pick is stored: the farmhouse. */
export function defaultSunBaseAssetId() {
  return 'e023-prairie-farmhouse';
}

/** The option record for an assetId, or null when it is not one of the three. */
export function sunBaseOptionFor(assetId) {
  return SUN_BASE_OPTIONS.find((o) => o.assetId === assetId) || null;
}

/**
 * Coerce anything into a stored pick: a reserved assetId, or null
 * (no pick stored / garbage stored — the picker shows instead of
 * forcing a room the user never chose).
 */
export function sanitizeSunBasePick(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const assetId = typeof raw.assetId === 'string' ? raw.assetId : null;
  return assetId && sunBaseOptionFor(assetId) ? assetId : null;
}

/** Load the stored pick (null when nothing is stored — node has no localStorage). */
export function loadSunBasePick() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return sanitizeSunBasePick(JSON.parse(localStorage.getItem(SUN_BASE_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

/** Persist the pick. Unknown assetIds are never stored. */
export function saveSunBasePick(assetId) {
  if (!sunBaseOptionFor(assetId)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SUN_BASE_STORAGE_KEY, JSON.stringify({ v: 1, assetId }));
    return true;
  } catch {
    return false;
  }
}

/** True when a camera point is close enough to the sun to count as passing through it. */
export function isSunTriggerPoint(pos) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') return false;
  const dx = pos.x - SUN_CENTER.x;
  const dy = pos.y - SUN_CENTER.y;
  const dz = pos.z - SUN_CENTER.z;
  const r = SUN_BASE_TRIGGER_RADIUS;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/**
 * Pull progress 0..1 for elapsed milliseconds since the pull
 * started. Ease-in cubic — the draw-in accelerates, like being
 * sucked into the sun. Clamped: 0 before the pull, 1 once it lands.
 */
export function pullEasedProgress(elapsedMs) {
  const t = Math.min(1, Math.max(0, (elapsedMs || 0) / SUN_BASE_PULL_MS));
  return t * t * t;
}

/**
 * THE SUN-BASE EXIT SPAWN (Merlin, Nov 24, 2026 — "spawn right
 * outside the sun looking forwards, towards where they entered
 * from"): leaving the base lands the user just outside the sun
 * on the hub side, facing the hub — never at the far default
 * spawn (ORBIT_CENTER, ~753 units away). The spawn sits this far
 * from the sun's centre along the line to the hub centre: 7.5 m
 * clear of the 67.5 surface, 3.5 m clear of the 71.5 fly-through
 * re-entry trigger (so the hub does not suck the user straight
 * back in on arrival), and 5.8 m clear of the 69.2 collider rest.
 * "Not so far" — close enough that the sun fills the view
 * behind them.
 */
export const SUN_BASE_EXIT_DISTANCE_M = 75;

/** Where the reverse transition starts: deep inside the sun's
 *  glare, 18 units off the centre — the entry pull's own target
 *  (SequenceController stops the pull 18 short of the centre), so
 *  the exit starts exactly where the entry ended. */
export const SUN_BASE_EXIT_INNER_M = 18;

/**
 * Exit spawn for a sun-base return: { inner, position, lookAt }
 * as [x, y, z] triples. `inner` is where the reverse transition
 * starts (inside the glare); `position` is the spawn, just
 * outside the sun on the line to `hubCenter`; `lookAt` is the
 * hub centre itself — the user faces the hub, toward where they
 * entered from. `hubCenter` defaults to ORBIT_CENTER
 * (lib/god-orbits.js: { x: 0, y: 35, z: -80 }); the hub call
 * site passes it explicitly.
 */
export function sunBaseExitSpawn(hubCenter) {
  const h = hubCenter || { x: 0, y: 35, z: -80 };
  const dx = h.x - SUN_CENTER.x;
  const dy = h.y - SUN_CENTER.y;
  const dz = h.z - SUN_CENTER.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const at = (d) => [SUN_CENTER.x + ux * d, SUN_CENTER.y + uy * d, SUN_CENTER.z + uz * d];
  return {
    inner: at(SUN_BASE_EXIT_INNER_M),
    position: at(SUN_BASE_EXIT_DISTANCE_M),
    lookAt: [h.x, h.y, h.z],
  };
}

/**
 * Exit progress 0..1 for elapsed milliseconds since the exit
 * started. Ease-OUT cubic — the exact reverse of the pull's
 * ease-in: the user emerges fast out of the glare and settles
 * gently onto the spawn. Same SUN_BASE_PULL_MS duration as the
 * pull: the same transition, in reverse. (Mirror property:
 * exitEasedProgress(t) = 1 - pullEasedProgress(SUN_BASE_PULL_MS
 * - t) — the exit plays the pull's curve backwards.)
 */
export function exitEasedProgress(elapsedMs) {
  const t = Math.min(1, Math.max(0, (elapsedMs || 0) / SUN_BASE_PULL_MS));
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * One-shot exit flag (sessionStorage, tab-scoped): set by the
 * sun-base page on a hub-bound exit, read once by the hub page
 * on mount. Tab-scoped so a reload after the exit spawns
 * normally; removed on read so it never leaks into a later
 * visit. The pattern is the codebase's own (ARES unlock,
 * oblivion collapse-seen).
 */
export const SUN_BASE_EXIT_KEY = 'olympus:sun-base-exit:v1';

/** Mark that the next hub arrival is a sun-base exit. */
export function markSunBaseExit() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(SUN_BASE_EXIT_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** Read + clear the exit flag: true once per hub-bound exit. */
export function consumeSunBaseExit() {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    if (sessionStorage.getItem(SUN_BASE_EXIT_KEY) !== '1') return false;
    sessionStorage.removeItem(SUN_BASE_EXIT_KEY);
    return true;
  } catch {
    return false;
  }
}
