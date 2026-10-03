// lib/realm-surface.js — shared "realm/game view" surface treatment.
//
// Merlin (2026-10-03): the iOS long-press callout (Copy | Look Up) must be
// disabled across ALL realms, implemented ONCE in the shared layer — never
// hand-edited per realm. <RealmCalloutGuard> (mounted once in
// app/layout.jsx) applies this; the CSS lives in app/globals.css.
//
// A "realm/game view" is recognized structurally: an immersive realm
// renders a canvas covering most of the viewport (react-three-fiber / 2D
// game canvases). Chat, forms, stores, and other text UI don't — selection
// keeps working there. Realms without a full-viewport canvas can opt in
// explicitly with className="realm-surface".
//
// Scoping law: inputs, textareas, selects, contenteditable regions, and
// anything marked [data-selectable] ALWAYS keep native selection and the
// callout, even inside a realm. Drag/touch gestures, tilt steering, gyro
// look, and the iOS first-tap motion-permission listener are pointer /
// deviceorientation events — unaffected by selection suppression.

export const REALM_SURFACE_CLASS = 'realm-surface';

/** Minimum viewport coverage for a canvas to mark its page as a realm. */
export const REALM_CANVAS_COVERAGE = 0.7;

/** Selectors that always keep native selection/callout, even in a realm. */
export const REALM_SELECTABLE_SELECTORS =
  'input, textarea, select, [contenteditable], [data-selectable]';

/**
 * canvasCoversViewport(rects, vw, vh, coverage) -> bool.
 * Pure/headless-testable. rects are {width, height} pairs (e.g. from
 * getBoundingClientRect). True when any canvas covers >= coverage of the
 * viewport area.
 */
export function canvasCoversViewport(rects, vw, vh, coverage = REALM_CANVAS_COVERAGE) {
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) return false;
  if (!Array.isArray(rects)) return false;
  const need = vw * vh * coverage;
  return rects.some((r) => {
    const w = r && r.width;
    const h = r && r.height;
    return Number.isFinite(w) && Number.isFinite(h) && w * h >= need;
  });
}

/**
 * isSelectableTarget(target) -> bool.
 * True when the event target lives inside an element that must keep native
 * selection (inputs, chat text marked [data-selectable], ...). Never throws
 * on odd targets.
 */
export function isSelectableTarget(target) {
  try {
    return !!(
      target &&
      typeof target.closest === 'function' &&
      target.closest(REALM_SELECTABLE_SELECTORS)
    );
  } catch {
    return false;
  }
}
