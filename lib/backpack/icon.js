// lib/backpack/icon.js — position engine for the backpack circle
// icon (item 9b, Merlin 2026-10-26: the backpack trigger becomes a
// small, modular CIRCLE, draggable by every user to wherever they
// want it on screen, exactly like the Concourse Orb).
//
// This mirrors the Concourse pattern (lib/concourse-icon.js, the
// Muse FAB model in lib/muse-fab.js) exactly:
//   - press and move: travel past an 8px threshold turns the press
//     into a drag — no hold-to-lift timer; a press that never
//     crosses the threshold stays a TAP, so the icon still opens
//     the backpack and a drag never opens it;
//   - the position is stored as viewport FRACTIONS {x, y} in [0, 1]
//     of the free span (viewport minus icon size), so one stored
//     spot lands sensibly on any screen size, and fractions render
//     back inside the viewport at every size (resize/rotation safe);
//   - while dragging, the top-left is clamped so the whole icon
//     stays on screen with an 8px margin, and the grab offset is
//     kept (the icon never jumps to center itself under the
//     finger);
//   - persistence has NO expiry: the component writes localStorage
//     instantly and /api/ui-state (key `backpack_icon`) debounced;
//     the account copy wins on login, so the spot follows the user
//     across devices. Signed out, the device copy stands alone.
//
// SERVER NOTE (outstanding, outside this module's scope): the
// /api/ui-state route (app/api/ui-state/route.js) does not yet
// accept the `backpack_icon` key — it only whitelists known keys
// and ignores the rest, so a POST carrying only `backpack_icon`
// answers 400 "Nothing to save." until the coordinator adds the
// same three-line block the route already has for `concourse_orb`
// (sanitizeFractions + patch.backpack_icon). The component in
// components/backpack/BackpackHud.jsx already sends and reads
// `backpack_icon`, so per-account persistence switches on the
// moment that block lands, with no further change here; until
// then the position persists per device via localStorage and the
// failed POST is swallowed (localStorage already holds it, and
// the next drag retries).
//
// Pure functions only — unit tested in
// tests/backpack-icon.test.mjs. No DOM here.

import {
  DRAG_THRESHOLD_PX,
  EDGE_MARGIN,
  clampFractions,
  clampPixels,
  fractionsToPixels,
  isDrag,
  pixelsToFractions,
  sanitizeFractions,
} from '../muse-fab.js';

export const BACKPACK_ICON_SIZE = 56; // same size as the Concourse Orb
export const BACKPACK_ICON_DRAG_THRESHOLD_PX = DRAG_THRESHOLD_PX; // tap vs drag: 8px
export const BACKPACK_ICON_EDGE_MARGIN = EDGE_MARGIN; // min px clearance from viewport edges: 8

/** The /api/ui-state preferences key for the icon position. */
export const BACKPACK_ICON_UI_STATE_KEY = 'backpack_icon';
/** The localStorage key for the device copy of the icon position. */
export const BACKPACK_ICON_STORAGE_KEY = 'olympus:backpack-icon:v1';
/** Debounce for the /api/ui-state write after a drop (ms). */
export const BACKPACK_ICON_SAVE_DEBOUNCE_MS = 800;

/** True when pointer travel turns a press into a drag (not a tap). */
export function isBackpackIconDrag(dx, dy, threshold = BACKPACK_ICON_DRAG_THRESHOLD_PX) {
  return isDrag(dx, dy, threshold);
}

/** Validate a stored position. Returns {x, y} fractions or null. */
export function sanitizeBackpackIconPosition(v) {
  return sanitizeFractions(v);
}

/**
 * Restore precedence — account copy (server) beats the device cache
 * (localStorage), which beats the caller's default. Anything
 * malformed is skipped, never trusted.
 */
export function resolveBackpackIconPosition({ server, local, fallback } = {}) {
  return sanitizeFractions(server) || sanitizeFractions(local) || sanitizeFractions(fallback);
}

/** Viewport fractions -> the icon's top-left pixel position. */
export function backpackIconFracToPx(frac, vw, vh, size = BACKPACK_ICON_SIZE) {
  return fractionsToPixels(frac.x, frac.y, vw, vh, size);
}

/** Top-left pixel position -> viewport fractions, clamped to [0, 1]. */
export function backpackIconPxToFrac(px, vw, vh, size = BACKPACK_ICON_SIZE) {
  const f = pixelsToFractions(px.x, px.y, vw, vh, size);
  return clampFractions(f.x, f.y);
}

/**
 * Clamp a top-left pixel position so the whole icon stays on
 * screen, keeping BACKPACK_ICON_EDGE_MARGIN clear of every edge.
 */
export function clampBackpackIconPx(px, vw, vh, size = BACKPACK_ICON_SIZE) {
  return clampPixels(px.x, px.y, vw, vh, size, null);
}

/**
 * Where the icon's top-left belongs mid-drag: the grab point keeps
 * its offset (the icon never jumps to center itself under the
 * finger), clamped fully on screen with the edge margin.
 */
export function dragBackpackIconTopLeft(origPx, startClient, client, vw, vh, size = BACKPACK_ICON_SIZE) {
  return clampBackpackIconPx(
    {
      x: origPx.x + (client.x - startClient.x),
      y: origPx.y + (client.y - startClient.y),
    },
    vw,
    vh,
    size
  );
}

/**
 * Default spot: bottom-LEFT, 16px clear of the left and bottom
 * edges — deliberately clear of the Concourse Orb's bottom-right
 * default, so the two draggable icons never start stacked. (The
 * old backpack button rode in each realm's HUD row; the circle
 * is a free-floating control instead, so its default is a screen
 * corner, not a row slot.)
 */
export function defaultBackpackIconFractions(vw, vh, size = BACKPACK_ICON_SIZE) {
  return backpackIconPxToFrac({ x: 16, y: vh - size - 16 }, vw, vh, size);
}
