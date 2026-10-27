// lib/earth/earth-cracks.js — jagged, world-locked cracks across
// the whole Earth (Merlin, 2026-10-26 late-night video orders).
//
// This REPLACES lib/earth/tron-grid.js. The old build drew a
// clean geometric TRON grid from player-relative world vectors,
// so the lines traveled with the car. That is gone. What is
// here instead:
//
//   - WORLD-LOCKED: the crack pattern is a pure function of the
//     fragment's PLANET-FIXED direction (spin-group space, never
//     player position, never camera). Same spot on Earth, same
//     cracks, forever — driving over them, the car moves over
//     the cracks, never the other way around. The shader reads
//     uGroupPos/uGroupQuat (the grid group's planet-local
//     transform); there is no player-relative origin anywhere.
//   - JAGGED, NOT TRON: domain-warped ridged noise makes
//     irregular, branching fracture lines like real cracks.
//     No straight lines, no uniform spacing, no grid.
//   - STATIC: the crack pattern takes NO time input. Merlin's
//     correction is explicit — the cracks do NOT eat, spread,
//     grow, consume or move. The Earth is cracked and WAITING
//     for Oblivion, nothing more. Only the glow COLOR cycles.
//   - GLOW, VERY SUBTLE BUT CLEARLY VISIBLE: low-brightness
//     light seeping through the cracks — a thin, sharp-edged
//     core (legible contrast against dark ground) with only a
//     whisper of halo, plus a faint scene light far dimmer
//     than the street lantern. Never garish, never a washout,
//     never dimmed into invisibility.
//
// The rendering lives in components/earth/EarthCracks.jsx (one
// shader plane at street level + one shader sphere over the
// orbit globe — never per-frame geometry rebuilds, so phones
// stay smooth). The color cycle below is the single source of
// truth: street shader, orbit shader and glow light all read
// it from the same clock, so the whole Earth changes color
// together.
//
// HEADLESS MIRROR: crackValueAt()/crackFieldFromDirection()
// implement the same algorithm shape as the GLSL (domain-
// warped ridged fbm) in plain JS, so tests can pin the
// properties — determinism, irregularity, world-locking by
// construction — without a GPU. The JS and GLSL hashes differ,
// so exact VALUES differ between the two; the properties are
// what both guarantee.

/** Street crack plane size, display units (48 u ≈ 3,000 m
 *  across — far past the visible ground; the shader fades it
 *  out well before the edge, so the plane's rim is never seen). */
export const CRACK_PLANE_UNITS = 48;
/** Full crack glow inside this radius (display units) from the player. */
export const CRACK_FADE_IN_UNITS = 12;
/** Fully faded out by this radius (display units). */
export const CRACK_FADE_OUT_UNITS = 18;
/** Height of the crack plane above the drawn ground, display
 *  units (≈ 9 cm — above the photo ground and the street patch,
 *  below everything that drives or walks, so it never slices a
 *  vehicle body; the glow lines crossing a tire bottom read as
 *  light through cracks, which is the point). */
export const CRACK_LIFT_UNITS = 0.0015;
/** Orbit overlay sphere radius factor over the 55-unit globe. */
export const CRACK_ORBIT_RADIUS_FACTOR = 1.004;
/** Seconds one palette color holds before its fade begins. */
export const CRACK_COLOR_HOLD_SECONDS = 7.5;
/** Seconds each color fade takes. Hold + fade = 10 s per color. */
export const CRACK_COLOR_FADE_SECONDS = 2.5;

/** Crack-field frequency in direction space. 120 gives main
 *  fractures roughly 20–40 m apart at street level, with finer
 *  branching detail from the higher octaves. */
export const CRACK_FREQ = 120;
/** Domain-warp strength (noise units) — the jagged wobble that
 *  breaks every straight line and makes the ridges branch. */
export const CRACK_WARP = 1.5;
/** Crack core half-width in ridge-field units — narrow, so the
 *  core edge is SHARP (legible contrast), not a soft smear.
 *  0.05 (widened 2026-10-27, Merlin's "perfect glow" order: the
 *  0.02 core read as hairlines that vanished on a phone screen)
 *  keeps the lines thin but readable at arm's length — clearly
 *  cracked earth, never a web. */
export const CRACK_CORE_WIDTH = 0.05;
/** Halo falloff width in ridge-field units — a tight hug around
 *  each line, not a regional tint. */
export const CRACK_HALO_WIDTH = 0.10;
/** Street crack core peak alpha — clearly visible (0.65) with a
 *  hard-edged core, so the cracks read at a glance against dark
 *  ground and still tint photo tiles without ever glaring. */
export const CRACK_CORE_ALPHA_STREET = 0.65;
/** Orbit crack core peak alpha — the whole globe is visible at
 *  once, so it stays below the street value, but strong enough
 *  to read against bright day-side oceans. */
export const CRACK_CORE_ALPHA_ORBIT = 0.5;
/** Halo peak alpha — a whisper hugging each line, nothing more. */
export const CRACK_HALO_ALPHA = 0.08;
/** Orbit crack-field frequency in direction space. The street
 *  frequency (120) wrapped on the whole globe reads as sub-pixel
 *  mush — 14 gives main fractures that survive globe zoom, the
 *  same jagged field at a scale the eye can follow from orbit. */
export const CRACK_ORBIT_FREQ = 14;
/** Orbit crack core half-width — wider than street, because an
 *  orbit line crosses far fewer screen pixels; 0.07 at frequency
 *  14 reads as a fine fracture from orbit, not a scratch. */
export const CRACK_ORBIT_CORE_WIDTH = 0.07;
/** Glow light intensity — barely-there seep, 1/3 of the old
 *  TRON glow (0.0006) and ~1/4 of the street lantern (0.0009).
 *  It tints the ground near the traveler, nothing more. */
export const CRACK_GLOW_INTENSITY = 0.0002;
/** Glow light reach, display units (≈ 125 m). */
export const CRACK_GLOW_DISTANCE = 2.0;

/** Palette — a pleasant hue progression around the wheel. */
export const CRACK_PALETTE = [
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

/** Crack glow color at a clock time (milliseconds). Returns
 *  { r, g, b } in 0–1. Holds each palette color for
 *  CRACK_COLOR_HOLD_SECONDS, fades to the next over
 *  CRACK_COLOR_FADE_SECONDS, loops forever. */
export function crackColorAt(timeMs) {
  const t = (Number(timeMs) || 0) / 1000;
  const step = CRACK_COLOR_HOLD_SECONDS + CRACK_COLOR_FADE_SECONDS;
  const seg = Math.floor(t / step) % CRACK_PALETTE.length;
  const next = (seg + 1) % CRACK_PALETTE.length;
  const f = smoothstep(0, 1, (t % step - CRACK_COLOR_HOLD_SECONDS) / CRACK_COLOR_FADE_SECONDS);
  const a = hexToRgb(CRACK_PALETTE[seg]);
  const b = hexToRgb(CRACK_PALETTE[next]);
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  };
}

/** Same color as a CSS hex string (for UI/labels, if ever needed). */
export function crackColorCss(timeMs) {
  const c = crackColorAt(timeMs);
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

// ---- Headless mirror of the GLSL crack field ----
// Deterministic integer hash in [0, 1). Lattice coords are
// small ints (direction * CRACK_FREQ, floored), so 32-bit
// integer math stays exact.
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function vnoise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  );
}

function fbm(x, y, z, octaves) {
  let amp = 0.5;
  let sum = 0;
  let value = 0;
  for (let k = 0; k < octaves; k++) {
    value += amp * vnoise3(x, y, z);
    sum += amp;
    x = x * 2.03 + 11.3;
    y = y * 2.03 + 7.7;
    z = z * 2.03 + 5.1;
    amp *= 0.5;
  }
  return value / sum;
}

/** Crack ridge value for a planet-fixed direction (unit vector
 *  not required — it is normalized here). 1 on a crack ridge,
 *  0 far from any crack. Pure function of direction: no player
 *  position, no camera, no time. That is the world lock. */
export function crackFieldFromDirection(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  const F = CRACK_FREQ;
  const wx = fbm(nx * F, ny * F, nz * F, 2);
  const wy = fbm(nx * F + 5.2, ny * F + 9.1, nz * F + 3.7, 2);
  const qx = (wx - 0.5) * CRACK_WARP;
  const qy = (wy - 0.5) * CRACK_WARP;
  const f = fbm(nx * F + qx, ny * F + qy, nz * F, 3);
  return 1 - Math.abs(f * 2 - 1);
}

/** Crack ridge value at a geographic position. Same convention
 *  as latLonToVec3 (prime meridian at +X, +Y polar). Takes
 *  ONLY the fragment's own lat/lon — there is deliberately no
 *  player position or time argument, because the cracks do not
 *  depend on either. */
export function crackValueAt(lat, lon) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -(Math.sin(phi) * Math.cos(theta));
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  return crackFieldFromDirection(x, y, z);
}
