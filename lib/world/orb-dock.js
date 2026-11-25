// lib/world/orb-dock.js — the ONE shared free-floating draggable orb
// dock (Merlin, Nov 16 ~02:30 Hollow Earth; ~02:35 mirror order for
// Jupiter 2). Moved here from app/hollow-earth/orb-dock.js so both
// worlds use the same mechanism — do not fork this file per realm.
// Hollow Earth drags ONE cluster (four orbs, one stored spot);
// Jupiter 2 drags its orbs individually (one stored spot per orb in
// a map under the same key pattern). Both shapes run on the same
// pure functions below: fractions, 8 px tap-vs-drag, grab offset,
// live clamp, localStorage instantly + /api/ui-state debounced.
//
// THE SHARED MECHANISM: every function takes the storage key / box
// size / home spot as a parameter, with the Hollow Earth values as
// the default — callers pass their own key/size/home instead of
// copying the code. The key pattern is one key per world:
// `olympus:<world>:orb-dock:v1` (device copy) and the /api/ui-state
// key `<world>_orb_dock` with hyphens stripped (account copy).
// `hollow_earth_orb_dock` and `jupiter2_orb_dock` are NOT whitelisted
// in app/api/ui-state/route.js yet — until whitelisted, the server
// copy is ignored and the device copy stands alone (flagged in the
// build reports, not done here: the route is outside both workers'
// regions).
//
// PATTERN — the backpack icon's (lib/backpack/icon.js, the
// Concourse-Orb model), reused exactly:
//   - the position is FRACTIONS {x, y} in [0, 1] of the free span
//     (viewport — or, for Jupiter 2, the stage — minus the dock's
//     box), so one stored spot lands sensibly on any screen size
//     and survives resize/rotation;
//   - press-and-move past an 8 px threshold turns the press into a
//     drag — no hold-to-lift timer; a press that never crosses the
//     threshold stays a TAP, so the orb still fires and a drag never
//     fires it (the page also swallows the click for 500 ms after a
//     drag, the backpack pattern);
//   - the grab offset is kept (the cluster never jumps to centre
//     itself under the finger) and the top-left is clamped live so
//     the whole cluster stays on screen with an 8 px margin;
//   - persistence: localStorage instantly, /api/ui-state debounced
//     when signed in, the account copy winning on login. The route
//     only accepts whitelisted keys (app/api/ui-state/route.js) —
//     see the key pattern note at the top of this file.
//   - never dragged = no stored fractions = the page renders the
//     CSS home slot (left 142, bottom BOTTOM_CLEAR, bottom-aligned
//     with the joystick), so the default tracks the safe-area
//     exactly; the defaultOrbDockFractions helper below is the same
//     spot in fraction form, for tests and for any caller that needs
//     a concrete default.
//
// Pure functions only — no DOM, no React, no THREE — node tests
// drive this module directly (tests/orb-dock.test.mjs).

import {
  DRAG_THRESHOLD_PX,
  EDGE_MARGIN,
  clampFractions,
  isDrag,
  sanitizeFractions,
} from '../muse-fab.js';

/** localStorage key for the device copy of the dock position. */
export const ORB_DOCK_STORAGE_KEY = 'olympus:hollow-earth:orb-dock:v1';
/** The /api/ui-state preferences key for the account copy. */
export const ORB_DOCK_UI_STATE_KEY = 'hollow_earth_orb_dock';

/**
 * The key pattern, one key per world — the same shape for every
 * world, so a second world never invents its own scheme.
 * Hollow Earth: orbDockStorageKeyFor('hollow-earth') ===
 * ORB_DOCK_STORAGE_KEY; Jupiter 2: 'olympus:jupiter-2:orb-dock:v1'.
 */
export function orbDockStorageKeyFor(world) {
  return `olympus:${world}:orb-dock:v1`;
}

/**
 * The /api/ui-state preferences key for a world ('jupiter-2' ->
 * 'jupiter2_orb_dock'). Hollow Earth predates this helper and keeps
 * its own ORB_DOCK_UI_STATE_KEY ('hollow_earth_orb_dock') — same
 * shape, different spelling, unchanged.
 */
export function orbDockUiStateKeyFor(world) {
  return `${String(world).replace(/-/g, '')}_orb_dock`;
}

/** The dock's box: 68 px wide (the widest orb, Weapon), 240 px tall
 * (44 Map + 8 + 68 Weapon + 8 + 44 Spawn + 8 + 60 Strike, top to
 * bottom Map, Weapon, Spawn, Strike — see the page's dock comment
 * for why Map and Strike sit at opposite ends). These MUST match
 * the page's orb sizes (Nov 24 dive round): the clamp below uses
 * them, so a stale box lets the dock park half off-screen. */
export const ORB_DOCK_WIDTH = 68;
export const ORB_DOCK_HEIGHT = 240;
/** Gap between orbs in the dock column. */
export const ORB_DOCK_GAP = 8;
/** Tap vs drag: 8 px of pointer travel (the backpack threshold). */
export const ORB_DOCK_DRAG_THRESHOLD_PX = DRAG_THRESHOLD_PX;
/** Minimum px clearance from every viewport edge, while dragging. */
export const ORB_DOCK_EDGE_MARGIN = EDGE_MARGIN;
/** Default home spot, px: left 142 (= 12 + 118 px joystick + 12 gap),
 * bottom 24 (= BOTTOM_CLEAR's 1.5 rem floor). */
export const ORB_DOCK_HOME_LEFT_PX = 142;
export const ORB_DOCK_HOME_BOTTOM_PX = 24;

/** Validate a stored position. Returns {x, y} fractions or null. */
export function sanitizeOrbDockPosition(v) {
  return sanitizeFractions(v);
}

/** True when pointer travel turns a press into a drag (not a tap). */
export function isOrbDockDrag(dx, dy, threshold = ORB_DOCK_DRAG_THRESHOLD_PX) {
  return isDrag(dx, dy, threshold);
}

/**
 * Restore precedence — account copy (server) beats the device cache
 * (localStorage), which beats the caller's default. Anything
 * malformed is skipped, never trusted. No fallback means null when
 * nothing is stored (the page then renders its CSS home slot).
 */
export function resolveOrbDockPosition({ server, local, fallback } = {}) {
  return sanitizeFractions(server) || sanitizeFractions(local) || sanitizeFractions(fallback) || null;
}

/**
 * Load the saved dock position from a storage (defaults to global
 * localStorage when present). Corrupt or missing saves return null
 * (never-dragged), never throw.
 */
export function loadOrbDockPosition(storage, key = ORB_DOCK_STORAGE_KEY) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return null;
    const raw = store.getItem(key);
    if (!raw) return null;
    return sanitizeFractions(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Save the dock position to a storage (defaults to global localStorage). Never throws. */
export function saveOrbDockPosition(frac, storage, key = ORB_DOCK_STORAGE_KEY) {
  try {
    const sane = sanitizeFractions(frac);
    if (!sane) return false;
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    store.setItem(key, JSON.stringify(sane));
    return true;
  } catch {
    return false;
  }
}

/** Viewport fractions -> the dock's top-left pixel position. */
export function orbDockFracToPx(frac, vw, vh, w = ORB_DOCK_WIDTH, h = ORB_DOCK_HEIGHT) {
  return { x: frac.x * (vw - w), y: frac.y * (vh - h) };
}

/** Top-left pixel position -> viewport fractions, clamped to [0, 1]. */
export function orbDockPxToFrac(px, vw, vh, w = ORB_DOCK_WIDTH, h = ORB_DOCK_HEIGHT) {
  const spanX = vw - w;
  const spanY = vh - h;
  return clampFractions(
    spanX > 0 ? px.x / spanX : 0,
    spanY > 0 ? px.y / spanY : 0,
  );
}

/**
 * Clamp a top-left pixel position so the whole dock box stays on
 * screen, keeping ORB_DOCK_EDGE_MARGIN clear of every edge.
 * Degenerate viewport: centre the box rather than NaN (the
 * muse-fab clampPixels rule).
 */
export function clampOrbDockPx(px, vw, vh, w = ORB_DOCK_WIDTH, h = ORB_DOCK_HEIGHT) {
  const m = EDGE_MARGIN;
  let minX = m;
  let maxX = vw - w - m;
  let minY = m;
  let maxY = vh - h - m;
  if (maxX < minX) {
    minX = Math.max(0, (vw - w) / 2);
    maxX = minX;
  }
  if (maxY < minY) {
    minY = Math.max(0, (vh - h) / 2);
    maxY = minY;
  }
  return {
    x: Math.min(maxX, Math.max(minX, px.x)),
    y: Math.min(maxY, Math.max(minY, px.y)),
  };
}

/**
 * Where the dock's top-left belongs mid-drag: the grab point keeps
 * its offset (the dock never jumps to centre itself under the
 * finger), clamped fully on screen with the edge margin.
 */
export function dragOrbDockTopLeft(origPx, startClient, client, vw, vh, w = ORB_DOCK_WIDTH, h = ORB_DOCK_HEIGHT) {
  return clampOrbDockPx(
    {
      x: origPx.x + (client.x - startClient.x),
      y: origPx.y + (client.y - startClient.y),
    },
    vw,
    vh,
    w,
    h,
  );
}

/**
 * Default spot as fractions: the home slot (left 142, bottom 24 px)
 * for a viewport of vw x vh. Used by tests and by any caller that
 * needs a concrete default; the page itself renders the same spot
 * in CSS while never dragged, so it tracks the safe-area exactly.
 */
export function defaultOrbDockFractions(vw, vh, home = { x: ORB_DOCK_HOME_LEFT_PX, y: vh - ORB_DOCK_HOME_BOTTOM_PX - ORB_DOCK_HEIGHT }) {
  return orbDockPxToFrac(home, vw, vh);
}

// ── Per-orb maps (Jupiter 2) ──────────────────────────────────────
// Hollow Earth stores ONE spot (its cluster) under its key; Jupiter 2
// stores one spot PER ORB — a map { orbId: {x, y} } — under the same
// key pattern (orbDockStorageKeyFor(world)). Same fractions, same
// sanitize-never-trust rule, same never-throw load/save. Malformed
// entries are dropped, never trusted; a corrupt or missing save is
// an empty map (every orb renders its CSS home slot).

/** Validate a per-orb map. Returns a fresh { [id]: {x, y} } or {} — never null. */
export function sanitizeOrbDockMap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {};
  for (const [id, frac] of Object.entries(v)) {
    const sane = sanitizeFractions(frac);
    if (sane) out[id] = sane;
  }
  return out;
}

/** Load a per-orb map from a storage (defaults to global localStorage). Never throws. */
export function loadOrbDockMap(storage, key) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store || !key) return {};
    const raw = store.getItem(key);
    if (!raw) return {};
    return sanitizeOrbDockMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Save a per-orb map to a storage (defaults to global localStorage). Never throws. */
export function saveOrbDockMap(map, storage, key) {
  try {
    const sane = sanitizeOrbDockMap(map);
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store || !key) return false;
    store.setItem(key, JSON.stringify(sane));
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore precedence for a per-orb map — the account copy (server)
 * beats the device cache (localStorage), which beats the caller's
 * default. Anything malformed is skipped, never trusted.
 */
export function resolveOrbDockMap({ server, local, fallback } = {}) {
  const pick = (v) => {
    const sane = sanitizeOrbDockMap(v);
    return Object.keys(sane).length > 0 ? sane : null;
  };
  return pick(server) || pick(local) || pick(fallback) || {};
}

// ── Exclusions (Merlin, Nov 16 — J2 overlap fix) ────────────────────
// A draggable orb must never park on top of another control, or half
// off the screen. The dock's live drag clamp already keeps an orb
// fully on screen, but it knows nothing about the OTHER controls —
// on Jupiter 2, SUMMON and DISMOUNT were both found parked on the
// backpack's fixed home slot (right 12, bottom 176), each sitting on
// top of the backpack circle. An exclusion is a stage-px rect
// {x, y, w, h} a dock orb may never cover; the caller passes its
// fixed slots (J2 passes the backpack home, badge + clearance
// included — lib/jupiter2/hud-layout.js). The rect itself carries
// the clearance, so the checks below use gap 0. Callers that pass
// no exclusions keep today's behaviour exactly.

/** The px rect an orb at a stored fraction covers on a vw x vh stage. */
export function orbDockFracRect(frac, vw, vh, s = ORB_DOCK_WIDTH) {
  const p = orbDockFracToPx(frac, vw, vh, s, s);
  return { x: p.x, y: p.y, w: s, h: s };
}

/** True when two px rects overlap (gap widens both sides). */
export function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap
    && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * Whether an exclusion rect applies to one orb (Merlin, Nov 24 —
 * J2 riding overlap fix). An exclusion may carry `owner`: the orb
 * id (or array of ids) that OWNS the slot the rect is — Jupiter 2's
 * dock-home rects wear one (lib/jupiter2/hud-layout.js), so an orb
 * can always be dragged back onto its own home. A rect with no
 * owner (a fixed control's slot, or a slot shared by two orbs)
 * applies to every orb. Callers that pass plain rects keep today's
 * behaviour exactly.
 */
export function exclusionAppliesTo(ex, id) {
  if (!ex || ex.owner === undefined || ex.owner === null) return true;
  if (Array.isArray(ex.owner)) return !ex.owner.includes(id);
  return ex.owner !== id;
}

/**
 * Push a dragged rect out of every exclusion, smallest shift first
 * (left / right / up / down — whichever clears with the least
 * travel), then clamp fully on screen. The orb slides along the
 * exclusion's edge while dragging instead of parking on top of it.
 * Returns the adjusted top-left {x, y}. `exceptOwner` is the orb
 * being dragged: its own home slot never pushes it (see
 * exclusionAppliesTo) — without it, an orb dragged back to its own
 * home would jump off it the moment the drag started.
 *
 * Each move is SCORED, not just shortest: among the four shifts off
 * the exclusion under the rect, the one that leaves the fewest
 * exclusions overlapped wins, and the shortest travel breaks ties.
 * Shortest-only can oscillate between two neighbouring exclusions
 * in a crowded corner (Jupiter 2's top-left column: DISMOUNT's slot,
 * SUMMON's home and the ARMED orb's slot all touch) and end parked
 * on one of them; the score always prefers a move that actually
 * clears. The single-exclusion cases behave exactly as before —
 * the shortest clearing shift still wins.
 */
export function pushRectOutOfExclusions(rect, exclusions, vw, vh, exceptOwner = null) {
  let { x, y } = rect;
  const list = Array.isArray(exclusions) ? exclusions : [];
  const hitsAt = (px, py) => list.filter(
    (ex) => exclusionAppliesTo(ex, exceptOwner) && rectsOverlap({ x: px, y: py, w: rect.w, h: rect.h }, ex, 0),
  ).length;
  for (let i = 0; i < 8; i++) {
    const hit = list.find((ex) => exclusionAppliesTo(ex, exceptOwner) && rectsOverlap({ x, y, w: rect.w, h: rect.h }, ex, 0));
    if (!hit) break;
    const shifts = [
      { dx: hit.x - rect.w - x, dy: 0 }, // move left of it
      { dx: hit.x + hit.w - x, dy: 0 }, // move right of it
      { dx: 0, dy: hit.y - rect.h - y }, // move above it
      { dx: 0, dy: hit.y + hit.h - y }, // move below it
    ];
    // Score each candidate after clamping it on screen: fewest
    // exclusions overlapped wins, shortest travel breaks ties.
    // The clamp is scored too, so a shift that would run off the
    // screen edge (and be clamped back onto the exclusion) never
    // wins over a shift that actually clears.
    let best = null;
    for (const s of shifts) {
      const c = clampOrbDockPx({ x: x + s.dx, y: y + s.dy }, vw, vh, rect.w, rect.h);
      const n = hitsAt(c.x, c.y);
      const travel = Math.abs(s.dx) + Math.abs(s.dy);
      if (!best || n < best.n || (n === best.n && travel < best.travel)) {
        best = { x: c.x, y: c.y, n, travel };
      }
    }
    x = best.x;
    y = best.y;
  }
  const clamped = clampOrbDockPx({ x, y }, vw, vh, rect.w, rect.h);
  return { x: clamped.x, y: clamped.y };
}

/**
 * Drop every stored orb whose rect overlaps an exclusion — a bad
 * saved spot is corrected, not kept: the orb falls back to its CSS
 * home slot on the next render. Returns a fresh map (the input is
 * never mutated).
 */
export function pruneOrbDockMap(map, exclusions, vw, vh, sizes = {}) {
  const sane = sanitizeOrbDockMap(map);
  const list = Array.isArray(exclusions) ? exclusions : [];
  if (list.length === 0) return sane;
  const out = {};
  for (const [id, frac] of Object.entries(sane)) {
    const s = (sizes && sizes[id]) || ORB_DOCK_WIDTH;
    const rect = orbDockFracRect(frac, vw, vh, s);
    if (list.some((ex) => exclusionAppliesTo(ex, id) && rectsOverlap(rect, ex, 0))) continue;
    out[id] = frac;
  }
  return out;
}
