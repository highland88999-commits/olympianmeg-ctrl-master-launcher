// lib/muse-fab.js — position math for the draggable Muse FAB.
//
// The button's position is stored as viewport fractions {x, y} in [0, 1]:
//   px = x * (vw - size)      (top-left corner)
// Fractions adapt across phone/desktop sizes; the component clamps to the
// viewport (with safe-area insets) on load and on resize/orientation change.
//
// Pure functions — unit tested in tests/muse-fab.test.js. No DOM here.

export const FAB_SIZE = 48; // h-12 w-12 in px
export const DRAG_THRESHOLD_PX = 8; // tap vs drag disambiguation
export const EDGE_MARGIN = 8; // min px clearance from viewport edges

/**
 * Fractions -> top-left pixel position.
 */
export function fractionsToPixels(fx, fy, vw, vh, size = FAB_SIZE) {
  return { x: fx * (vw - size), y: fy * (vh - size) };
}

/**
 * Top-left pixel position -> fractions.
 */
export function pixelsToFractions(px, py, vw, vh, size = FAB_SIZE) {
  const spanX = vw - size;
  const spanY = vh - size;
  return {
    x: spanX > 0 ? px / spanX : 0,
    y: spanY > 0 ? py / spanY : 0,
  };
}

/** Clamp fractions into [0, 1]. */
export function clampFractions(fx, fy) {
  const c = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return { x: c(fx), y: c(fy) };
}

/**
 * Clamp a top-left pixel position so the whole button stays on screen,
 * honoring safe-area insets. insets = {top, right, bottom, left} in px.
 * Returns clamped {x, y}.
 */
export function clampPixels(px, py, vw, vh, size = FAB_SIZE, insets = null) {
  const ins = insets || { top: 0, right: 0, bottom: 0, left: 0 };
  const m = EDGE_MARGIN;
  let minX = (ins.left || 0) + m;
  let maxX = vw - size - (ins.right || 0) - m;
  let minY = (ins.top || 0) + m;
  let maxY = vh - size - (ins.bottom || 0) - m;
  // Degenerate viewport: center the button rather than NaN.
  if (maxX < minX) {
    minX = Math.max(0, (vw - size) / 2);
    maxX = minX;
  }
  if (maxY < minY) {
    minY = Math.max(0, (vh - size) / 2);
    maxY = minY;
  }
  return {
    x: Math.min(maxX, Math.max(minX, px)),
    y: Math.min(maxY, Math.max(minY, py)),
  };
}

/**
 * Default spot: bottom-right, matching the original CSS
 * (right: 12px, bottom: calc(7rem + safe-area-inset-bottom)).
 * Returns fractions.
 */
export function defaultFractions(vw, vh, size = FAB_SIZE, insetRight = 0, insetBottom = 0) {
  const px = vw - size - 12 - insetRight;
  const py = vh - size - 112 - insetBottom;
  return pixelsToFractions(px, py, vw, vh, size);
}

/**
 * Validate a stored value. Returns {x, y} fractions or null.
 */
export function sanitizeFractions(v) {
  if (!v || typeof v !== 'object') return null;
  const { x, y } = v;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** True when pointer travel exceeds the tap-vs-drag threshold. */
export function isDrag(dx, dy, threshold = DRAG_THRESHOLD_PX) {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Resolve the effective position for a viewport: take stored fractions,
 * fall back to default, clamp to the viewport. Returns {x, y} fractions.
 */
export function resolveFractions(stored, vw, vh, size = FAB_SIZE, insets = null) {
  const sane = sanitizeFractions(stored);
  const base = sane || defaultFractions(vw, vh, size, (insets && insets.right) || 0, (insets && insets.bottom) || 0);
  const clamped = clampFractions(base.x, base.y);
  const px = fractionsToPixels(clamped.x, clamped.y, vw, vh, size);
  const cpx = clampPixels(px.x, px.y, vw, vh, size, insets);
  return pixelsToFractions(cpx.x, cpx.y, vw, vh, size);
}
