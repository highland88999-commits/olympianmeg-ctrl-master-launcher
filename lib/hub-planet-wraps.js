/**
 * lib/hub-planet-wraps.js — invented planet wraps for the hub's god
 * constellation (Merlin, Nov 18, 2026 — "Invent planet wraps for them").
 *
 * The 14 nether-realm planets (UTILITIES, HADES, HELHEIM, YOMI, ANNWN,
 * DUAT, MICTLAN, XIBALBA, HELL, NARAKA, DIYU, KUR, NAV, ORUN) have no
 * banner art (texture: null in lib/god-menus.js), so their hulls fell
 * back to a flat god colour — a uniformly lit sphere that reads as a
 * flat disc from hub distance. These wraps replace the banner-or-
 * nothing system entirely: EVERY planet gets its own invented
 * surface, unique per god, in its god colour. No network fetch, no
 * load-failure mode, no generic library texture.
 *
 * Same treatment as lib/planet-cgi/textures.js (the house standard):
 * seeded PRNG + value-noise generators that paint colour + bump maps
 * as THREE.DataTextures — node-safe (no DOM canvas), cached per god,
 * deterministic so every phone paints the same planet.
 *
 * 12 pattern families cycle by god index, so neighbouring planets
 * never share a look; the god colour carries the identity (base +
 * derived light/dark shades of the same hue). The maps are 256x128
 * equirectangular; the noise wraps in U so the sphere seam is
 * invisible.
 *
 * Rings: the orbit ring + equatorial accent ring in
 * components/GodOrbitRings.jsx already wear band.color — and every
 * wrap is generated FROM band.color, so ring + planet share the
 * colour and read as one thing (Merlin, Nov 18 ~20:58).
 */

import * as THREE from 'three';
import { hashString, mulberry32 } from './earth4/creature-textures.js';

export const HUB_WRAP_SIZE = { w: 256, h: 128 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const smooth = (t) => t * t * (3 - 2 * t);

// ── periodic value noise (wraps in x) ─────────────────────────────────
// Lattice hash; x indices wrap mod `period` (cells across the width),
// so a pattern sampled at u and u+1 is identical — no sphere seam.

function h2(ix, iy, seed) {
  let h = (seed | 0) ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoiseU(x, y, seed, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const a = h2(x0, iy, seed);
  const b = h2(x1, iy, seed);
  const c = h2(x0, iy + 1, seed);
  const d = h2(x1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbmU(u, v, seed, cells, octaves = 3) {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const period = Math.max(1, Math.round(cells * f));
    sum += amp * vnoiseU(u * period, v * (period / 2), seed + o * 101, period);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// Distance in u with wrap-around (a sphere's seam must not cut a
// feature in half).
function duWrapped(u, cu) {
  const d = Math.abs(u - cu);
  return Math.min(d, 1 - d);
}

// ── colour helpers ────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function shadeOf(hex, dLight, dSat = 0) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, clamp01(s + dSat), clamp01(l + dLight));
}

function mix(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** God colour → palette of the same hue: base + light/dark shades. */
export function godPlanetPalette(colorHex) {
  return {
    base: hexToRgb(colorHex),
    light: shadeOf(colorHex, 0.2),
    pale: shadeOf(colorHex, 0.36, -0.08),
    dark: shadeOf(colorHex, -0.16),
    deep: shadeOf(colorHex, -0.3, 0.06),
  };
}

// ── pattern families ──────────────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1).
// n = { seed, pal, craters } — craters precomputed so colour and
// bump agree exactly.

function craterField(seed, count, rMin, rMax) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ u: rnd(), v: rnd(), r: rMin + rnd() * (rMax - rMin) });
  }
  return out;
}

const GENERATORS = {
  bands(u, v, n) {
    const wob = (fbmU(u, v, n.seed, 8) - 0.5) * 0.06;
    const lat = v + wob;
    const stops = [n.pal.deep, n.pal.dark, n.pal.base, n.pal.light];
    const band = Math.floor(lat * 9);
    const t = smooth(lat * 9 - band);
    const cA = stops[((band % 4) + 4) % 4];
    const cB = stops[((band + 1) % 4 + 4) % 4];
    const c = mix(cA, cB, t);
    const streak = vnoiseU(u * 48, v * 120, n.seed, 48);
    const k = 0.92 + streak * 0.16;
    const turb = fbmU(u, v, n.seed + 7, 12);
    // Relief follows the bands themselves: the mix factor t runs 0→1
    // across every band, so the bump ridges at each band's heart and
    // dips at its edges — plus turbulence and jet streaks.
    const bump = 128 + (t - 0.5) * 70 + (turb - 0.5) * 46 + (streak - 0.5) * 30;
    return {
      r: clamp255(c[0] * k),
      g: clamp255(c[1] * k),
      b: clamp255(c[2] * k),
      bump: clamp255(bump),
    };
  },

  craters(u, v, n) {
    const m = fbmU(u, v, n.seed, 6);
    let c = mix(n.pal.dark, n.pal.base, m);
    let bump = 128 + (m - 0.5) * 50;
    for (let i = 0; i < n.craters.length; i++) {
      const cr = n.craters[i];
      const dx = duWrapped(u, cr.u) * 2; // u spans twice the v range
      const dy = (v - cr.v) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= cr.r) continue;
      const t = d / cr.r;
      const rim = Math.exp(-Math.pow((t - 0.8) * 5, 2));
      const bowl = 1 - t;
      c = mix(c, n.pal.deep, bowl * 0.55);
      c = mix(c, n.pal.light, rim * 0.5);
      bump -= bowl * 80;
      bump += rim * 60;
    }
    return { r: clamp255(c[0]), g: clamp255(c[1]), b: clamp255(c[2]), bump: clamp255(bump) };
  },

  storm(u, v, n) {
    const cx = 0.5;
    const cy = 0.45;
    let sx = u - cx;
    if (sx > 0.5) sx -= 1;
    if (sx < -0.5) sx += 1;
    const dy = (v - cy) * 0.5;
    const r = Math.sqrt(sx * sx + dy * dy);
    // Spiral arms from the radial phase warped by periodic noise —
    // no atan2, so nothing jumps across the U seam.
    const swirl = fbmU(u, v, n.seed, 6);
    const arms = 0.5 + 0.5 * Math.sin(r * 16 - swirl * 7);
    const core = Math.max(0, 1 - r * 3.2);
    let c = mix(n.pal.dark, n.pal.base, 0.35 + arms * 0.4);
    c = mix(c, n.pal.light, arms * core * 0.7);
    c = mix(c, n.pal.pale, Math.max(0, core - 0.6) * 0.8);
    const streak = vnoiseU(u * 60, v * 30, n.seed, 60);
    const k = 0.9 + streak * 0.2;
    return {
      r: clamp255(c[0] * k),
      g: clamp255(c[1] * k),
      b: clamp255(c[2] * k),
      bump: clamp255(128 + (arms - 0.5) * 60),
    };
  },

  streaks(u, v, n) {
    const s = vnoiseU(u * 90, v * 4, n.seed, 90);
    const fine = vnoiseU(u * 200, v * 12, n.seed + 5, 200);
    let c = mix(n.pal.dark, n.pal.light, s);
    c = mix(c, n.pal.base, 0.35);
    const k = 0.94 + (fine - 0.5) * 0.14;
    return {
      r: clamp255(c[0] * k),
      g: clamp255(c[1] * k),
      b: clamp255(c[2] * k),
      bump: clamp255(128 + (s - 0.5) * 84),
    };
  },

  plates(u, v, n) {
    const cols = 10;
    const rows = 5;
    // Half a cell offset in u: otherwise a plate border falls exactly
    // on the sphere seam (u=0/1) and the two straddling columns sit at
    // different distances from that border — a dark step no other
    // border has. Offset, the seam falls mid-plate like anywhere else.
    const uu = u + 0.5 / cols;
    const cx = ((Math.floor(uu * cols) % cols) + cols) % cols;
    const cy = Math.floor(v * rows);
    const fx = uu * cols - Math.floor(uu * cols);
    const fy = v * rows - Math.floor(v * rows);
    // Cell shade from a U-periodic noise field (sampled at the cell
    // centre, 4 periods across) — a per-cell hash would step at the
    // seam, because the left edge of cell 0 meets the right edge of
    // the last cell with a different shade.
    const shade = vnoiseU(((cx + 0.5) / cols) * 4, ((cy + 0.5) / rows) * 2, n.seed, 4);
    let c = mix(n.pal.dark, n.pal.light, shade);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    if (edge < 0.09) c = mix(c, n.pal.deep, 0.75 * (1 - edge / 0.09));
    const grain = vnoiseU(u * 120, v * 60, n.seed, 120);
    const k = 0.94 + (grain - 0.5) * 0.12;
    return {
      r: clamp255(c[0] * k),
      g: clamp255(c[1] * k),
      b: clamp255(c[2] * k),
      bump: clamp255(edge < 0.09 ? 70 : 128 + (shade - 0.5) * 50),
    };
  },

  marble(u, v, n) {
    const w = fbmU(u, v, n.seed, 6);
    const warp = fbmU(u + w * 0.9, v + w * 0.6, n.seed + 3, 6);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 5 + warp * 3) * Math.PI)), 8);
    let c = mix(n.pal.deep, n.pal.base, 0.35 + warp * 0.5);
    c = mix(c, n.pal.pale, vein * 0.85);
    return {
      r: clamp255(c[0]),
      g: clamp255(c[1]),
      b: clamp255(c[2]),
      // Relief follows the warp field itself (the veins are thin, so
      // they alone can't carry the bump).
      bump: clamp255(128 + (warp - 0.5) * 96 + vein * 28),
    };
  },

  dunes(u, v, n) {
    const d = fbmU(u, v, n.seed, 6);
    const t = v * 10 + u * 3 + (d - 0.5) * 3;
    const ridge = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const s = smooth(ridge);
    let c = mix(n.pal.dark, n.pal.light, s);
    c = mix(c, n.pal.base, 0.3);
    const grain = vnoiseU(u * 160, v * 80, n.seed, 160);
    const k = 0.95 + (grain - 0.5) * 0.1;
    return {
      r: clamp255(c[0] * k),
      g: clamp255(c[1] * k),
      b: clamp255(c[2] * k),
      bump: clamp255(128 + (ridge - 0.5) * 90),
    };
  },

  cracks(u, v, n) {
    const r = 1 - Math.abs(2 * fbmU(u, v, n.seed, 7) - 1);
    const crack = smooth((r - 0.86) / 0.11);
    let c = mix(n.pal.deep, n.pal.dark, fbmU(u, v, n.seed + 9, 5));
    c = mix(c, n.pal.pale, crack * 0.9);
    c = mix(c, n.pal.light, crack * 0.4);
    return {
      r: clamp255(c[0]),
      g: clamp255(c[1]),
      b: clamp255(c[2]),
      bump: clamp255(128 - crack * 70 + (r - 0.5) * 30),
    };
  },

  clouds(u, v, n) {
    const c = fbmU(u, v, n.seed, 5);
    const billow = smooth((c - 0.45) / 0.17);
    let col = mix(n.pal.dark, n.pal.base, 0.4 + c * 0.4);
    col = mix(col, n.pal.pale, billow * 0.8);
    return {
      r: clamp255(col[0]),
      g: clamp255(col[1]),
      b: clamp255(col[2]),
      bump: clamp255(128 + (billow - 0.5) * 44),
    };
  },

  scales(u, v, n) {
    const rows = 10;
    const cols = 8;
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const off = (row % 2) * 0.5;
    const cu = ((((u + off) * cols) % cols) + cols) % cols;
    const col = Math.floor(cu);
    const fx = cu - col;
    const dx = fx - 0.5;
    const dy = (fy - 0.5) * 1.4;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Scale shade from a U-periodic noise field at the scale centre
    // (same seam reason as plates: a per-cell hash steps at u=0/1).
    const shade = vnoiseU(((col + 0.5) / cols) * 4, ((row + 0.5) / rows) * 2, n.seed, 4);
    let c = mix(n.pal.dark, n.pal.light, shade * 0.7);
    if (d > 0.42) c = mix(c, n.pal.deep, 0.6);
    else c = mix(c, n.pal.pale, Math.max(0, 0.42 - d) * 0.9);
    return {
      r: clamp255(c[0]),
      g: clamp255(c[1]),
      b: clamp255(c[2]),
      bump: clamp255(128 + (0.42 - d) * 120),
    };
  },

  rings(u, v, n) {
    const lat = Math.abs(v - 0.5) * 2;
    const wob = (fbmU(u, v, n.seed, 6) - 0.5) * 0.08;
    const ring = 0.5 + 0.5 * Math.sin((lat + wob) * 22);
    let c = mix(n.pal.dark, n.pal.light, ring);
    c = mix(c, n.pal.base, 0.35);
    const eq = Math.max(0, 1 - Math.abs(v - 0.5) * 8);
    c = mix(c, n.pal.pale, eq * 0.35);
    return {
      r: clamp255(c[0]),
      g: clamp255(c[1]),
      b: clamp255(c[2]),
      bump: clamp255(128 + (ring - 0.5) * 50),
    };
  },

  speckle(u, v, n) {
    const m = fbmU(u, v, n.seed, 5);
    const s = vnoiseU(u * 160, v * 80, n.seed, 160);
    let c = mix(n.pal.deep, n.pal.dark, m);
    if (s > 0.86) c = mix(c, n.pal.pale, (s - 0.86) * 6);
    return {
      r: clamp255(c[0]),
      g: clamp255(c[1]),
      b: clamp255(c[2]),
      bump: clamp255(s > 0.86 ? 185 : 128 + (m - 0.5) * 64),
    };
  },
};

export const HUB_WRAP_FAMILIES = Object.keys(GENERATORS);

export const HUB_WRAP_FAMILY_STYLE = {
  bands: { roughness: 0.6, bumpScale: 0.02 },
  craters: { roughness: 0.95, bumpScale: 0.09 },
  storm: { roughness: 0.55, bumpScale: 0.02 },
  streaks: { roughness: 0.6, bumpScale: 0.03 },
  plates: { roughness: 0.85, bumpScale: 0.07 },
  marble: { roughness: 0.5, bumpScale: 0.04 },
  dunes: { roughness: 0.95, bumpScale: 0.08 },
  cracks: { roughness: 0.9, bumpScale: 0.1 },
  clouds: { roughness: 0.7, bumpScale: 0.03 },
  scales: { roughness: 0.45, bumpScale: 0.06 },
  rings: { roughness: 0.6, bumpScale: 0.03 },
  speckle: { roughness: 0.9, bumpScale: 0.05 },
};

/** Pattern family for a god by its index — neighbours never share a look. */
export function wrapFamilyForIndex(index) {
  return HUB_WRAP_FAMILIES[((index % HUB_WRAP_FAMILIES.length) + HUB_WRAP_FAMILIES.length) % HUB_WRAP_FAMILIES.length];
}

// ── generation ────────────────────────────────────────────────────────

/**
 * Raw pixel buffers for one god's wrap — the node-testable core.
 * Returns { color: Uint8Array RGBA, bump: Uint8Array, width, height, family }.
 */
export function generateWrapPixels(god, colorHex, index) {
  const family = wrapFamilyForIndex(index);
  const gen = GENERATORS[family];
  const seed = hashString(`hub-planet:${god}`);
  const pal = godPlanetPalette(colorHex);
  const { w: W, h: H } = HUB_WRAP_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed, pal, craters: null };
  if (family === 'craters') n.craters = craterField(seed, 70, 0.03, 0.15);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = gen(x / W, y / H, n);
      const i = (y * W + x) * 4;
      color[i] = px.r;
      color[i + 1] = px.g;
      color[i + 2] = px.b;
      color[i + 3] = 255;
      bump[y * W + x] = px.bump;
    }
  }
  return { color, bump, width: W, height: H, family };
}

const wrapCache = new Map(); // `${god}|${colorHex}|${index}` -> { map, bumpMap, roughness, bumpScale, family, god }

/**
 * Colour + bump DataTextures for one god's planet, cached so a god
 * costs one texture pair no matter how many times it renders.
 * Unknown colours fall back to the god's band colour as given — the
 * caller always passes GOD_BANDS[i].color, so there is no default.
 */
export function godPlanetWrap(god, colorHex, index) {
  const key = `${god}|${colorHex}|${index}`;
  if (wrapCache.has(key)) return wrapCache.get(key);
  const { color, bump, width: W, height: H, family } = generateWrapPixels(god, colorHex, index);
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const style = HUB_WRAP_FAMILY_STYLE[family];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, family, god };
  wrapCache.set(key, out);
  return out;
}

export function hubWrapCacheSize() {
  return wrapCache.size;
}
