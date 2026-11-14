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
 * Everything the user does scales with them — eye height, stride,
 * how close they can step to a wall — so movement, the door view
 * and building all stay usable at the small scale.
 */
export const SUN_BASE_USER_SCALE = 0.2;

/** Eye height inside the base: the 1.7 m eye × the 0.2 scale. */
export const SUN_BASE_EYE_HEIGHT_M = 0.34;

/** Walk speed inside the base: the 3.2 m/s stride × the 0.2
 *  scale — the stride scales with the walker, so crossing the
 *  room takes five times longer: the room feels vast because to
 *  them it IS vast. */
export const SUN_BASE_WALK_SPEED_MPS = 0.64;

/** How close the walker may step to a wall: 0.7 m × the 0.2 scale. */
export const SUN_BASE_WALL_MARGIN_M = 0.14;

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
