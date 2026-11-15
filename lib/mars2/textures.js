/**
 * lib/mars2/textures.js — procedural Mars 2 hardware textures (Merlin, Nov 15, 2026).
 *
 * The ARES outpost and the ARES-2 rover were plain coloured plastic:
 * flat meshStandardMaterial colours, no surface at all. This module
 * wraps them in texture — the same idiom as the planet-CGI kit
 * (lib/planet-cgi/textures.js): seeded PRNG + value noise painting
 * colour + bump maps as THREE.DataTextures, cached per kind+seed,
 * deterministic so every phone paints the same hardware. Procedural
 * only — no bought assets, no model downloads.
 *
 * What each kind reads as:
 * - domeFabric: dusty off-white habitat fabric — panel seams, rivet
 *   dots, dust streaks running down, faint rust bleed at the seams.
 * - hullOrange / hullGrey: painted metal — panel seams, scratches,
 *   dust film, rivets. The orange dome and the connector tube.
 * - solarCells: dark navy photovoltaic cells — cell grid, bus lines,
 *   per-cell brightness, a pale dust film over everything.
 * - padDeck: the landing pad — dark scuffed deck, tyre arcs, dust.
 * - roverHull: the rover body — dusty light grey, panel seams, an
 *   ARES-orange livery stripe, dust streaks, rivets.
 * - wheelTread: dark rubber with chevron grip blocks + dust.
 * - brushedMetal: mast, arms, hubs — grey with vertical brushing
 *   streaks and a dust wash.
 *
 * Maps are 256x256 like the planet kit. The tint multiplies the
 * map (white by default — the maps carry their own hues).
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';

export const HARDWARE_TEXTURE_SIZE = 256;

// Roughness + bump strength per kind. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const HARDWARE_KINDS = {
  domeFabric: { roughness: 0.85, bumpScale: 0.03, metalness: 0.05 },
  hullOrange: { roughness: 0.55, bumpScale: 0.04, metalness: 0.35 },
  hullGrey: { roughness: 0.5, bumpScale: 0.04, metalness: 0.45 },
  solarCells: { roughness: 0.3, bumpScale: 0.02, metalness: 0.65 },
  padDeck: { roughness: 0.95, bumpScale: 0.06, metalness: 0.15 },
  roverHull: { roughness: 0.5, bumpScale: 0.04, metalness: 0.55 },
  wheelTread: { roughness: 0.95, bumpScale: 0.09, metalness: 0.05 },
  brushedMetal: { roughness: 0.4, bumpScale: 0.02, metalness: 0.75 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// Panel seams: a regular grid of dark lines, slightly wobbly so
// they read as welded plates, not graph paper. Returns 0..1 of
// "how much seam" at this pixel.
function seamAmount(u, v, cols, rows, seed) {
  const wob = (fbm(u * 3, v * 3, seed) - 0.5) * 0.012;
  const fx = Math.abs(((u + wob) * cols) % 1 - 0.5);
  const fy = Math.abs(((v + wob) * rows) % 1 - 0.5);
  const sx = fx > 0.5 - 0.012 ? 1 : 0;
  const sy = fy > 0.5 - 0.012 ? 1 : 0;
  return Math.max(sx, sy);
}

// Rivet dots on the seam grid intersections.
function rivetAmount(u, v, cols, rows) {
  const cu = ((u * cols) % 1 - 0.5) * cols;
  const cv = ((v * rows) % 1 - 0.5) * rows;
  const d = Math.sqrt(cu * cu + cv * cv);
  return d < 0.16 ? 1 - d / 0.16 : 0;
}

// Dust: pale rust film, heavier near the bottom (v = 0 is the
// ground edge on most of these wraps) and in fbm drifts.
function dustAmount(u, v, seed) {
  const drift = fbm(u * 5, v * 9, seed);
  const low = 1 - v; // dust settles low
  return clamp01(drift * 0.75 + low * 0.35 - 0.25);
}

// ── per-kind generators ──────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1);
// n.seed is this texture's seed int.

const GENERATORS = {
  domeFabric(u, v, n) {
    // Off-white fabric, panelled, dust-streaked.
    const seam = seamAmount(u, v, 4, 3, n.seed);
    const rivet = rivetAmount(u, v, 4, 3);
    const dust = dustAmount(u, v, n.seed + 2);
    const streak = fbm(u * 18, v * 3, n.seed + 9); // vertical runs
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let r = 232 - seam * 46 - dust * 52 - (streak < 0.4 ? 18 : 0) + (grain - 0.5) * 14;
    let g = 222 - seam * 44 - dust * 48 - (streak < 0.4 ? 16 : 0) + (grain - 0.5) * 14;
    let b = 210 - seam * 42 - dust * 40 - (streak < 0.4 ? 12 : 0) + (grain - 0.5) * 14;
    // Rust bleed creeps out of the seams.
    const bleed = seam * (0.4 + 0.6 * fbm(u * 8, v * 8, n.seed + 4));
    r = r * (1 - bleed * 0.25) + 178 * bleed * 0.25;
    g = g * (1 - bleed * 0.25) + 110 * bleed * 0.25;
    b = b * (1 - bleed * 0.25) + 62 * bleed * 0.25;
    r -= rivet * 30; g -= rivet * 30; b -= rivet * 30;
    const bump = 128 + (grain - 0.5) * 22 - seam * 34 + rivet * 26 - dust * 10;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  hullOrange(u, v, n) {
    // ARES-orange painted metal, worn at the edges, dusted low.
    const seam = seamAmount(u, v, 5, 3, n.seed);
    const rivet = rivetAmount(u, v, 5, 3);
    const dust = dustAmount(u, v, n.seed + 2);
    const scratch = valueNoise(u * 90, v * 6, n.seed + 7) > 0.93 ? 1 : 0;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    let r = 217 - seam * 52 - dust * 58 + scratch * 40 + (grain - 0.5) * 16;
    let g = 111 - seam * 30 - dust * 34 + scratch * 30 + (grain - 0.5) * 12;
    let b = 58 - seam * 16 - dust * 18 + scratch * 22 + (grain - 0.5) * 10;
    r -= rivet * 34; g -= rivet * 22; b -= rivet * 12;
    const bump = 128 + (grain - 0.5) * 26 - seam * 40 + rivet * 30 - dust * 12;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  hullGrey(u, v, n) {
    // Warm grey painted metal — the connector tube, the dish.
    const seam = seamAmount(u, v, 6, 2, n.seed);
    const rivet = rivetAmount(u, v, 6, 2);
    const dust = dustAmount(u, v, n.seed + 2);
    const scratch = valueNoise(u * 110, v * 8, n.seed + 7) > 0.94 ? 1 : 0;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    let r = 201 - seam * 44 - dust * 56 + scratch * 34 + (grain - 0.5) * 14;
    let g = 184 - seam * 40 - dust * 50 + scratch * 30 + (grain - 0.5) * 14;
    let b = 166 - seam * 36 - dust * 42 + scratch * 26 + (grain - 0.5) * 14;
    r -= rivet * 28; g -= rivet * 26; b -= rivet * 24;
    const bump = 128 + (grain - 0.5) * 24 - seam * 38 + rivet * 28 - dust * 10;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  solarCells(u, v, n) {
    // Dark navy PV cells: 6 x 4 cells, thin silver bus lines,
    // per-cell brightness, pale dust film over everything.
    const cols = 6;
    const rows = 4;
    const cu = (u * cols) % 1;
    const cv = (v * rows) % 1;
    const bus = (cu < 0.03 || cu > 0.97 || cv < 0.03 || cv > 0.97) ? 1 : 0;
    // Per-cell brightness, precomputed once per texture (n.cellRnd)
    // so the generator stays cheap per pixel.
    const ci = Math.floor(u * cols) + Math.floor(v * rows) * cols;
    const cellRnd = n.cellRnd ? n.cellRnd[ci] : 0.5;
    const dust = dustAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 160, v * 160, n.seed);
    let r = 28 + cellRnd * 14 + bus * 150 - dust * 4 + (grain - 0.5) * 8;
    let g = 47 + cellRnd * 16 + bus * 150 - dust * 4 + (grain - 0.5) * 8;
    let b = 110 + cellRnd * 26 + bus * 140 - dust * 4 + (grain - 0.5) * 8;
    // Dust film lightens the cells towards pale rust.
    r = r * (1 - dust * 0.35) + 198 * dust * 0.35;
    g = g * (1 - dust * 0.35) + 150 * dust * 0.35;
    b = b * (1 - dust * 0.35) + 110 * dust * 0.35;
    const bump = 128 - bus * 20 + (grain - 0.5) * 14 - dust * 8;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  padDeck(u, v, n) {
    // The landing pad: dark scuffed deck, tyre arcs, dust drifts.
    const scuff = fbm(u * 7, v * 7, n.seed);
    const arc = 0.5 + 0.5 * Math.sin((Math.hypot(u - 0.5, v - 0.5) * 22) + fbm(u * 4, v * 4, n.seed + 3) * 4);
    const dust = dustAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let l = 74 + (scuff - 0.5) * 30 + (arc > 0.85 ? 26 : 0) - dust * 18 + (grain - 0.5) * 20;
    // A faded painted circle, worn where the rover parks.
    const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.32);
    if (ring < 0.015) l += 44 * (1 - dust);
    const bump = 128 + (scuff - 0.5) * 44 + (grain - 0.5) * 30 - dust * 10;
    return { r: clamp255(l * 1.02), g: clamp255(l * 0.94), b: clamp255(l * 0.88), bump: clamp255(bump) };
  },

  roverHull(u, v, n) {
    // Dusty light-grey rover body with an ARES-orange livery stripe
    // across the middle band (v 0.42..0.58) and panel seams.
    const seam = seamAmount(u, v, 4, 3, n.seed);
    const rivet = rivetAmount(u, v, 4, 3);
    const dust = dustAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 180, v * 180, n.seed);
    const stripe = (v > 0.42 && v < 0.58) ? 1 : 0;
    let r = 200 - seam * 42 - dust * 54 + (grain - 0.5) * 14;
    let g = 204 - seam * 42 - dust * 50 + (grain - 0.5) * 14;
    let b = 210 - seam * 42 - dust * 44 + (grain - 0.5) * 14;
    if (stripe) {
      r = 224 - seam * 30 - dust * 40;
      g = 120 - seam * 18 - dust * 26;
      b = 64 - seam * 10 - dust * 14;
    }
    r -= rivet * 30; g -= rivet * 30; b -= rivet * 30;
    const bump = 128 + (grain - 0.5) * 24 - seam * 36 + rivet * 28 - dust * 10 - stripe * 6;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  wheelTread(u, v, n) {
    // Dark rubber with chevron grip blocks marching across the
    // tread, worn shiny on the block tops, dust in the grooves.
    const chev = ((u * 8 + (v > 0.5 ? 0.5 : 0)) % 1);
    const block = chev > 0.12 && chev < 0.5 ? 1 : 0;
    const groove = 1 - block;
    const dust = dustAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 220, v * 220, n.seed);
    let l = 42 + block * 22 - groove * 8 - dust * 10 + (grain - 0.5) * 16;
    const bump = 128 + block * 64 - groove * 40 + (grain - 0.5) * 30;
    return { r: clamp255(l), g: clamp255(l * 0.96), b: clamp255(l * 0.9), bump: clamp255(bump) };
  },

  brushedMetal(u, v, n) {
    // Mast, arms, hubs: grey with vertical brushing streaks and
    // a dust wash low down.
    const brush = valueNoise(u * 260, v * 14, n.seed);
    const dust = dustAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let l = 138 + (brush - 0.5) * 34 - dust * 42 + (grain - 0.5) * 12;
    const bump = 128 + (brush - 0.5) * 40 - dust * 8;
    return { r: clamp255(l * 1.02), g: clamp255(l), b: clamp255(l * 0.98), bump: clamp255(bump) };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, roughness, bumpScale, metalness }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}` -> material
let textureBytes = 0;

export function hardwareTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump maps for one hardware kind, seeded so the pattern
 * is stable per world. Unknown kinds fall back to hullGrey.
 */
export function hardwareMaps(kind, seed) {
  const k = HARDWARE_KINDS[kind] ? kind : 'hullGrey';
  const key = `${k}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`mars2-hardware:${k}:${seed}`);
  const W = HARDWARE_TEXTURE_SIZE;
  const H = HARDWARE_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  if (k === 'solarCells') {
    // One brightness value per cell (6 x 4), rolled once.
    const cellRnd = mulberry32(seedInt + 101);
    n.cellRnd = Array.from({ length: 24 }, () => cellRnd());
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const px = gen(u, v, n);
      const i = (y * W + x) * 4;
      color[i] = px.r;
      color[i + 1] = px.g;
      color[i + 2] = px.b;
      color[i + 3] = 255;
      bump[y * W + x] = Math.max(0, Math.min(255, px.bump));
    }
  }
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const style = HARDWARE_KINDS[k];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, metalness: style.metalness };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A shared MeshStandardMaterial for one (kind, seed, tint): the
 * pattern maps are shared per kind+seed, the tint multiplies the
 * map (white by default — the maps carry their own hues).
 * `opts.side` covers open geometry (the rover dish) that must
 * read from both faces. Shared materials are never disposed by
 * callers.
 */
export function materialForHardware(kind, seed, tint = '#ffffff', opts = {}) {
  const k = HARDWARE_KINDS[kind] ? kind : 'hullGrey';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const side = opts.side || THREE.FrontSide;
  const key = `${k}|${seed}|${hex}|${side === THREE.DoubleSide ? 'double' : 'front'}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = hardwareMaps(k, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: maps.metalness,
    side,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}
