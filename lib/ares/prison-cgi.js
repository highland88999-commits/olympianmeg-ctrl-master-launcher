/**
 * lib/ares/prison-cgi.js — the ARES Prison CGI makeover (Merlin, Nov 15, 2026).
 *
 * The hall was flat coloured plastic: every wall, floor, ceiling and
 * cell face a single meshStandardMaterial colour, no surface at all.
 * This module dresses it the way the house CGI kit does
 * (lib/planet-cgi/textures.js, lib/mars2/textures.js): seeded PRNG +
 * value noise painting colour + bump maps as THREE.DataTextures,
 * cached per kind+seed, deterministic so every phone paints the
 * same hall. Procedural only — no bought assets, no downloads.
 *
 * What each kind reads as:
 * - prisonConcrete: cold poured concrete — formwork panel seams,
 *   hairline cracks, damp streaks running down, grime low. The
 *   hall shell and the cell back walls' base.
 * - prisonSteel: worn dark gunmetal — panel seams, scratches,
 *   rivets, rust bleed at the seams. Ceiling and level separators.
 * - prisonDeck: the walkway deck — dark scuffed steel plates,
 *   a worn lane down the middle where the keeper walks, tyre-like
 *   scuff arcs, dust in the grooves.
 * - prisonCellBack: the inside of a cell — stained concrete with
 *   vertical grime streaks and faint tally scratches, so an
 *   occupied cell reads as lived-in, not painted.
 *
 * WHAT THIS MODULE NEVER TOUCHES (standing law + the concurrent
 * silver-wraps worker): the cell front frames — bars and top/bottom
 * rails stay exactly as world3d.jsx builds them (red emissive),
 * the one-way glass stays one-way (lib/ares/prison.js
 * PRISON_ONE_WAY), the prisoner figures stay as they are, and NO
 * new real lights are added anywhere: the light budget stays
 * 8 + 4 per grown level (PRISON_LIGHT_BUDGET), and the mood comes
 * from emissive fixture diffusers + the existing red point
 * lights. The fixtures flicker on the real clock (prisonFlicker,
 * pure function of nowMs like lightningFlash in
 * lib/planet-cgi/motion.js) — a cold fluorescent stutter, never
 * a blackout.
 *
 * THE WARDEN'S DAIS: the Warden's post at the far end of the hall
 * (x = +length/2, against the end wall) — a low platform, a
 * console desk, an emissive red sigil strip. It stands OUTSIDE
 * the walker clamp (|x| <= 23): its front face sits at
 * length/2 - 0.85, so the keeper can walk right up to it and
 * never through it. Pure geometry spec here (wardenDaisFor);
 * the component in app/ares/prison/cgi.jsx renders it.
 *
 * Node-safe (THREE + lib/planet-cgi only, no DOM): the node test
 * suite pins every helper. Maps are 256x256 like the planet kit.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';
import { PLANET_CGI_EPOCH_MS, makeDustField } from '../planet-cgi/motion.js';
import { PRISON_RED, PRISON_HALL } from './prison.js';

export const PRISON_CGI_TEXTURE_SIZE = 256;

// Roughness + bump strength + metalness per kind. bumpScale is in
// texture space — tuned by eye; the phone check is the real verdict.
export const PRISON_CGI_KINDS = {
  prisonConcrete: { roughness: 0.95, bumpScale: 0.07, metalness: 0.05 },
  prisonSteel: { roughness: 0.5, bumpScale: 0.04, metalness: 0.6 },
  prisonDeck: { roughness: 0.85, bumpScale: 0.06, metalness: 0.35 },
  prisonCellBack: { roughness: 0.95, bumpScale: 0.08, metalness: 0.05 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// Panel seams: a regular grid of dark lines, slightly wobbly so
// they read as welded / poured plates, not graph paper.
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

// Grime: heavier near the bottom (v = 0 is the ground edge on most
// of these wraps) and in fbm drifts.
function grimeAmount(u, v, seed) {
  const drift = fbm(u * 5, v * 9, seed);
  const low = 1 - v;
  return clamp01(drift * 0.7 + low * 0.4 - 0.25);
}

// ── per-kind generators ──────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1);
// n.seed is this texture's seed int.

const GENERATORS = {
  prisonConcrete(u, v, n) {
    // Cold poured concrete: formwork panels, damp streaks running
    // down (v), hairline cracks, grime settling low.
    const seam = seamAmount(u, v, 4, 2, n.seed);
    const streak = fbm(u * 16, v * 3, n.seed + 9); // vertical runs
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const mottle = fbm(u * 6, v * 6, n.seed + 4);
    const grime = grimeAmount(u, v, n.seed + 2);
    let l = 96 + (mottle - 0.5) * 30 - seam * 26 - grime * 34
      - (streak < 0.38 ? 16 : 0) + (grain - 0.5) * 18;
    // Warm red cast, like the hall's light.
    const bump = 128 + (grain - 0.5) * 34 + (mottle - 0.5) * 30 - seam * 36 - grime * 12;
    return { r: clamp255(l * 1.08), g: clamp255(l * 0.98), b: clamp255(l * 0.94), bump: clamp255(bump) };
  },

  prisonSteel(u, v, n) {
    // Worn dark gunmetal: panel seams, scratches, rivets, rust
    // bleed creeping out of the seams.
    const seam = seamAmount(u, v, 6, 3, n.seed);
    const rivet = rivetAmount(u, v, 6, 3);
    const grime = grimeAmount(u, v, n.seed + 2);
    const scratch = valueNoise(u * 110, v * 8, n.seed + 7) > 0.94 ? 1 : 0;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    let l = 74 - seam * 22 - grime * 22 + scratch * 30 + (grain - 0.5) * 14;
    const bleed = seam * (0.4 + 0.6 * fbm(u * 8, v * 8, n.seed + 4));
    let r = l * 1.0 + bleed * 22;
    let g = l * 1.02 + bleed * 6;
    let b = l * 1.12;
    r -= rivet * 18; g -= rivet * 18; b -= rivet * 16;
    const bump = 128 + (grain - 0.5) * 26 - seam * 40 + rivet * 28 - grime * 10;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  prisonDeck(u, v, n) {
    // The walkway deck: dark scuffed plates, a worn lane down the
    // middle (u ~ 0.5 is the walker's line), scuff arcs, dust in
    // the grooves, a faint painted centre line worn almost away.
    const seam = seamAmount(u, v, 8, 2, n.seed);
    const scuff = fbm(u * 7, v * 7, n.seed);
    const arc = 0.5 + 0.5 * Math.sin((Math.hypot(u - 0.5, v - 0.5) * 22) + fbm(u * 4, v * 4, n.seed + 3) * 4);
    const grime = grimeAmount(u, v, n.seed + 2);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const lane = Math.exp(-Math.pow((u - 0.5) * 4.2, 2)); // worn middle
    let l = 62 + (scuff - 0.5) * 26 + (arc > 0.85 ? 20 : 0) - grime * 14
      + lane * 16 + (grain - 0.5) * 18 - seam * 18;
    // The centre line: a faded red guide stripe, mostly worn off.
    const centreLine = Math.abs(u - 0.5) < 0.012 ? 1 : 0;
    const bump = 128 + (scuff - 0.5) * 40 + (grain - 0.5) * 30 - seam * 30 - grime * 8;
    let r = l * 1.1 + centreLine * 26;
    let g = l * 1.0;
    let b = l * 0.96;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  prisonCellBack(u, v, n) {
    // Inside a cell: stained concrete, vertical grime streaks,
    // faint tally scratches — a cell that has held things.
    const streak = fbm(u * 18, v * 3, n.seed + 9);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const mottle = fbm(u * 6, v * 6, n.seed + 4);
    const grime = grimeAmount(u, v, n.seed + 2);
    // Tally scratches: short vertical marks, seeded per texture.
    let tally = 0;
    if (n.tallies) {
      for (let i = 0; i < n.tallies.length; i++) {
        const t = n.tallies[i];
        const du = Math.abs(u - t.u);
        const dv = Math.abs(v - t.v);
        if (du < 0.006 && dv < 0.05) tally = Math.max(tally, 1 - du / 0.006);
      }
    }
    let l = 74 + (mottle - 0.5) * 26 - grime * 30
      - (streak < 0.38 ? 18 : 0) + (grain - 0.5) * 16 + tally * 22;
    const bump = 128 + (grain - 0.5) * 32 + (mottle - 0.5) * 28 - grime * 12 + tally * 30;
    return { r: clamp255(l * 0.92), g: clamp255(l * 0.97), b: clamp255(l * 1.1), bump: clamp255(bump) };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, roughness, bumpScale, metalness }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}|${rx}x${ry}` -> material
let textureBytes = 0;

export function prisonCgiTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump maps for one prison kind, seeded so the pattern is
 * stable per hall. Unknown kinds fall back to prisonConcrete.
 * The returned maps are the SHARED originals (repeat 1,1) — call
 * prisonMaterial for a tiled material; it clones the maps per
 * repeat so one surface's tiling never moves another's.
 */
export function prisonMaps(kind, seed) {
  const k = PRISON_CGI_KINDS[kind] ? kind : 'prisonConcrete';
  const key = `${k}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`ares-prison:${k}:${seed}`);
  const W = PRISON_CGI_TEXTURE_SIZE;
  const H = PRISON_CGI_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  if (k === 'prisonCellBack') {
    const rnd = mulberry32(seedInt + 77);
    n.tallies = Array.from({ length: 14 }, () => ({
      u: 0.15 + rnd() * 0.7,
      v: 0.25 + rnd() * 0.55,
    }));
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
  const style = PRISON_CGI_KINDS[k];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, metalness: style.metalness };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A MeshStandardMaterial for one (kind, seed, tint, repeat): the
 * pattern maps are cloned from the shared originals so each
 * surface tiles at its own repeat (a clone shares the image data,
 * so tiling is cheap). The tint multiplies the map (white by
 * default — the maps carry their own hues). Shared materials are
 * never disposed by callers.
 */
export function prisonMaterial(kind, seed, tint = '#ffffff', opts = {}) {
  const k = PRISON_CGI_KINDS[kind] ? kind : 'prisonConcrete';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const rx = Number(opts.repeatX ?? 1) || 1;
  const ry = Number(opts.repeatY ?? 1) || 1;
  const key = `${k}|${seed}|${hex}|${rx}x${ry}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = prisonMaps(k, seed);
  const map = maps.map.clone();
  map.repeat.set(rx, ry);
  map.needsUpdate = true;
  const bumpMap = maps.bumpMap.clone();
  bumpMap.repeat.set(rx, ry);
  bumpMap.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: maps.metalness,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}

// ── mood ───────────────────────────────────────────────────────────
// The hall's mood language: TRON Ares red, same red as the lights.
// Fixture diffusers glow this red; the Warden's sigil strip glows
// it brighter. Emissive only — no new real lights, ever.
export const PRISON_CGI_MOOD = {
  red: PRISON_RED.light, // 0xFF2D20 — the real light colour
  redCss: PRISON_RED.flame, // '#FF3524' — emissive robot/bar colour
  fixtureEmissiveIntensity: 1.6,
  sigilEmissiveIntensity: 2.2,
  // The fixture flicker never drops below this: a stutter, never
  // a blackout — the keeper always sees the hall.
  flickerFloor: 0.55,
};

// ── fixture flicker ────────────────────────────────────────────────
// Cold fluorescent stutter for the light-fixture diffusers, a pure
// function of the device clock like lightningFlash: the same instant
// always flickers the same way on every phone. Most 120 ms slices
// sit at full brightness (1); ~3% dip briefly toward the floor and
// recover inside the slice. `fixtureIndex` seeds each fixture so
// the row never stutters in lockstep.
export function prisonFlicker(nowMs = Date.now(), fixtureIndex = 0) {
  const t = Number(nowMs) - PLANET_CGI_EPOCH_MS;
  const slot = Math.floor(t / 120);
  const h = hashString(`ares-prison:flicker:${fixtureIndex}:${slot}`) / 4294967296;
  if (h > 0.97) {
    const within = (t % 120) / 120;
    const dip = 1 - within * 1.6; // sharp dip, partial recovery
    const depth = 1 - PRISON_CGI_MOOD.flickerFloor;
    return Math.max(
      PRISON_CGI_MOOD.flickerFloor,
      1 - Math.max(0, dip) * depth,
    );
  }
  return 1;
}

// ── warm dust ──────────────────────────────────────────────────────
// Warm red-grey motes drifting down the walkway, like the Earth 3
// garden motes but warm: one field over the whole hall volume.
// Drift with updateDustField(field, Date.now()) once per frame.
export function makePrisonDust() {
  return makeDustField({
    count: 160,
    width: PRISON_HALL.lengthM - 2,
    height: PRISON_HALL.heightM - 1,
    depth: PRISON_HALL.walkwayHalfM * 2,
    yBase: 0.2,
    seed: 'prison-motes',
    color: '#e0a89e',
    size: 0.07,
    opacity: 0.4,
    sprite: 'glow',
  });
}

// ── the robot's mirror ─────────────────────────────────────────────
// The reflective hovering robots need something to reflect: a small
// procedural equirect environment, painted on a canvas — the red hall
// itself (dark, with red neon strips where the walkway lights run).
// No asset, no download; one texture shared by every robot's metal.
// Browser-only: returns null on the server / in node tests (the scene
// only calls it inside the Canvas). Cached — the canvas is painted once.
let prisonEnvTexture = null;
export function getPrisonEnvTexture() {
  if (prisonEnvTexture) return prisonEnvTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Near-black hall.
  ctx.fillStyle = '#0a0505';
  ctx.fillRect(0, 0, 512, 256);
  // Red neon strips — the walkway lights, high and low.
  const strip = (y, h, alpha) => {
    const g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, 'rgba(255,45,32,0)');
    g.addColorStop(0.5, `rgba(255,45,32,${alpha})`);
    g.addColorStop(1, 'rgba(255,45,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h, 512, h * 2);
  };
  strip(48, 26, 0.95); // the overhead row
  strip(208, 18, 0.55); // the floor strips, dimmer
  // One hot core, dead ahead — the brightest thing in the hall.
  const core = ctx.createRadialGradient(256, 128, 4, 256, 128, 90);
  core.addColorStop(0, 'rgba(255,224,219,0.9)');
  core.addColorStop(0.4, 'rgba(255,53,36,0.55)');
  core.addColorStop(1, 'rgba(255,53,36,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  prisonEnvTexture = tex;
  return tex;
}

// ── the Warden's dais ──────────────────────────────────────────────
// Pure geometry spec for the Warden's post at the far end of the
// hall (+x end wall). The footprint never moves with growth — only
// the hall height does — so the dais is a pure function of the
// hall length. Its front face sits 0.15 m clear of the walker
// clamp (|x| <= walkwayEndM): the keeper walks right up to it and
// never through it. Platform 0.35 m high, console desk on top,
// emissive sigil strip on the desk's walkway face.
export function wardenDaisFor(hall = PRISON_HALL) {
  const endX = hall.lengthM / 2; // 24 — the end wall centre
  const frontX = hall.walkwayEndM + 0.15; // 23.15 — clear of the clamp
  const depthM = endX - 0.15 - frontX; // 0.7 — to the wall's inner face
  return {
    frontX,
    centreX: frontX + depthM / 2,
    depthM,
    widthM: 4.4, // z -2.2 .. 2.2, the walkway's width
    platformHeightM: 0.35,
    deskHeightM: 1.05,
    deskDepthM: 0.5,
    deskWidthM: 3.2,
    sigilY: 0.95,
    // The dais is outside the walker clamp by construction.
    clearOfClampM: Math.round((frontX - hall.walkwayEndM) * 100) / 100, // 0.15
  };
}
