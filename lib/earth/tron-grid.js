// lib/earth/tron-grid.js — the TRON-like grid that glows through
// cracks across the whole Earth (Merlin, 2026-10-26 video orders).
//
// Pure values + the color cycle, headless-testable. The rendering
// lives in components/earth/EarthTronGrid.jsx (one shader plane
// at street level + one shader sphere over the orbit globe —
// never per-frame geometry rebuilds, so phones stay smooth).
//
// COLOR RULE (his words): the glow is a subtle light source and
// it "slowly change[s] color… like fade into new color every 10
// seconds". So each palette color HOLDS for 7.5 s, then fades
// smoothly into the next over 2.5 s, and the cycle loops back to
// the start. tronGridColorAt() is the single source of truth:
// the street shader, the orbit shader and the glow light all
// read it from the same clock, so the whole Earth changes color
// together.

/** Grid line spacing at street level, in display units
 *  (0.016 u = 1 m, so 0.8 u = 50 m — spaced out, city-block
 *  scale, not a dense mesh). */
export const TRON_GRID_SPACING_UNITS = 0.8;
/** Street grid plane size, display units (48 u ≈ 3,000 m across
 *  — far past the visible ground; the shader fades it out well
 *  before the edge, so the plane's rim is never seen). */
export const TRON_GRID_PLANE_UNITS = 48;
/** Full glow inside this radius (display units) from the player. */
export const TRON_GRID_FADE_IN_UNITS = 12;
/** Fully faded out by this radius (display units). */
export const TRON_GRID_FADE_OUT_UNITS = 18;
/** Height of the grid plane above the drawn ground, display
 *  units (≈ 9 cm — above the photo ground and the street patch,
 *  below everything that drives or walks, so it never slices a
 *  vehicle body; the glow lines crossing a tire bottom read as
 *  light through cracks, which is the point). */
export const TRON_GRID_LIFT_UNITS = 0.0015;
/** Orbit overlay sphere radius factor over the 55-unit globe. */
export const TRON_ORBIT_RADIUS_FACTOR = 1.004;
/** Orbit grid spacing: one line every 15° of latitude/longitude. */
export const TRON_ORBIT_SPACING_DEG = 15;
/** Seconds one palette color holds before its fade begins. */
export const TRON_COLOR_HOLD_SECONDS = 7.5;
/** Seconds each color fade takes. Hold + fade = 10 s per color. */
export const TRON_COLOR_FADE_SECONDS = 2.5;
/** Glow light intensity — mirrors the street lantern's scale
 *  (StreetFillLight: 0.0009, gentle at the feet). Subtle, never
 *  garish: it tints the ground near the traveler, nothing more. */
export const TRON_GLOW_INTENSITY = 0.0006;
/** Glow light reach, display units (≈ 125 m). */
export const TRON_GLOW_DISTANCE = 2.0;

/** Palette — a pleasant hue progression around the wheel. */
export const TRON_GRID_PALETTE = [
  '#22d3ee', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#e879f9', // magenta
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // amber
  '#4ade80', // green
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Grid glow color at a clock time (milliseconds). Returns
 *  { r, g, b } in 0–1. Holds each palette color for
 *  TRON_COLOR_HOLD_SECONDS, fades to the next over
 *  TRON_COLOR_FADE_SECONDS, loops forever. */
export function tronGridColorAt(timeMs) {
  const t = (Number(timeMs) || 0) / 1000;
  const step = TRON_COLOR_HOLD_SECONDS + TRON_COLOR_FADE_SECONDS;
  const seg = Math.floor(t / step) % TRON_GRID_PALETTE.length;
  const next = (seg + 1) % TRON_GRID_PALETTE.length;
  const f = smoothstep(0, 1, (t % step - TRON_COLOR_HOLD_SECONDS) / TRON_COLOR_FADE_SECONDS);
  const a = hexToRgb(TRON_GRID_PALETTE[seg]);
  const b = hexToRgb(TRON_GRID_PALETTE[next]);
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  };
}

/** Same color as a CSS hex string (for UI/labels, if ever needed). */
export function tronGridColorCss(timeMs) {
  const c = tronGridColorAt(timeMs);
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}
