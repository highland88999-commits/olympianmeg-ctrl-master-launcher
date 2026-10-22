// lib/concourse-icon.js — position engine for the Concourse icon
// (the Orb, Layer 1 of the Concourse).
//
// Merlin, 2026-10-22: the icon must be movable by ANY user to ANY
// place on the screen, "like the old Muse button", and it must
// remember where every user leaves it last — INDEFINITELY.
//
// So the icon uses the exact Muse FAB model (lib/muse-fab.js):
//   - press and move: travel past an 8px threshold turns the press
//     into a drag — no hold-to-lift timer (the Orb's old 2-second
//     hold was undiscoverable; a plain press-and-move did nothing);
//   - a press that never crosses the threshold stays a TAP, so the
//     icon still opens the Concourse and a drag never opens it;
//   - the position is stored as viewport FRACTIONS {x, y} in [0, 1]
//     of the free span (viewport minus icon size), so one stored
//     spot lands sensibly on any screen size, and fractions render
//     back inside the viewport at every size (resize/rotation safe);
//   - while dragging, the top-left is clamped so the whole icon
//     stays on screen with an 8px margin;
//   - persistence has NO expiry: the component writes localStorage
//     instantly and /api/ui-state (concourse_orb) debounced; the
//     server row is plain jsonb with no TTL — the spot survives
//     until the user drags the icon somewhere else.
//
// Pure functions only — unit tested in
// tests/concourse-icon-position.test.mjs. No DOM here.

import {
  DRAG_THRESHOLD_PX,
  EDGE_MARGIN,
  clampFractions,
  clampPixels,
  fractionsToPixels,
  isDrag,
  pixelsToFractions,
  sanitizeFractions,
} from './muse-fab.js';

export const CONCOURSE_ICON_SIZE = 56; // matches SIZE in components/Concourse.jsx
export const ICON_DRAG_THRESHOLD_PX = DRAG_THRESHOLD_PX; // tap vs drag: 8px
export const ICON_EDGE_MARGIN = EDGE_MARGIN; // min px clearance from viewport edges: 8

/** True when pointer travel turns a press into a drag (not a tap). */
export function isIconDrag(dx, dy, threshold = ICON_DRAG_THRESHOLD_PX) {
  return isDrag(dx, dy, threshold);
}

/** Validate a stored position. Returns {x, y} fractions or null. */
export function sanitizeIconPosition(v) {
  return sanitizeFractions(v);
}

/**
 * Restore precedence — account copy (server) beats the device cache
 * (localStorage), which beats the caller's default. Anything
 * malformed is skipped, never trusted.
 */
export function resolveIconPosition({ server, local, fallback } = {}) {
  return sanitizeFractions(server) || sanitizeFractions(local) || sanitizeFractions(fallback);
}

/** Viewport fractions -> the icon's top-left pixel position. */
export function iconFracToPx(frac, vw, vh, size = CONCOURSE_ICON_SIZE) {
  return fractionsToPixels(frac.x, frac.y, vw, vh, size);
}

/** Top-left pixel position -> viewport fractions, clamped to [0, 1]. */
export function iconPxToFrac(px, vw, vh, size = CONCOURSE_ICON_SIZE) {
  const f = pixelsToFractions(px.x, px.y, vw, vh, size);
  return clampFractions(f.x, f.y);
}

/**
 * Clamp a top-left pixel position so the whole icon stays on
 * screen, keeping ICON_EDGE_MARGIN clear of every edge.
 */
export function clampIconPx(px, vw, vh, size = CONCOURSE_ICON_SIZE) {
  return clampPixels(px.x, px.y, vw, vh, size, null);
}

/**
 * Where the icon's top-left belongs mid-drag: the grab point keeps
 * its offset (the icon never jumps to center itself under the
 * finger), clamped fully on screen with the edge margin.
 */
export function dragIconTopLeft(origPx, startClient, client, vw, vh, size = CONCOURSE_ICON_SIZE) {
  return clampIconPx(
    {
      x: origPx.x + (client.x - startClient.x),
      y: origPx.y + (client.y - startClient.y),
    },
    vw,
    vh,
    size
  );
}
