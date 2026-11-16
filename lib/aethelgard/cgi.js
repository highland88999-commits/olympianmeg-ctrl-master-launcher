/**
 * lib/aethelgard/cgi.js — AETHELGARD procedural CGI kit (Merlin, Nov 15, 2026).
 *
 * The CGI pass for the pocket rainforest. Same house idiom as
 * lib/planet-cgi (textures.js + motion.js), lib/mars2/weather.js and
 * app/star-wars/cgi.js: seeded PRNG + value-noise painters that make
 * colour + bump DataTextures (node-safe, no canvas, no network,
 * cached per seed, deterministic so every phone paints the same
 * forest), and motion that is a pure function of the device clock —
 * same place + same time = the same sway, the same falling leaf, the
 * same drifting mist on every phone. No stored state, no server
 * tick, no new real lights (everything that glows is emissive /
 * additive basic material, never a light).
 *
 * What lives here:
 *   1. FOREST FLOOR — leaf-litter + damp-moss colour + bump maps.
 *   2. LEAF CLUSTER — an RGBA leaf-card texture for the mid-canopy
 *      leaf layer (cutout alpha, no sorting cost).
 *   3. CANOPY BREEZE — the rainforest wind (Thule-wind rhythm:
 *      47 s gusts, 4 min veer) + canopySway() for crowns, leaf
 *      cards and ferns.
 *   4. DAPPLED LIGHT — sun patches that drift across the floor.
 *   5. FALLING LEAVES — seeded leaf-fall cycles, canopy to floor.
 *   6. MIST BANKS — slow ground mist that thickens with fogMul.
 *   7. RIPPLES — expanding rings on the waterfall plunge pool.
 *
 * Worker's-choice numbers (Merlin gave no numbers — flag if he
 * wants them tuned): breeze base 2.4 m/s, gusts 0.8–6 m/s on a
 * 47 s cycle, veer ±20° over 4 minutes, prevailing from 300°
 * (north-west, down the valley toward the falls); crown sway
 * caps at ~0.45 m; 26 dapple patches; 60 falling leaves on a
 * 12–18 s fall; 6 mist banks; 3 pool ripples on a 4 s cycle.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';
import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';

export const AETHELGARD_FLOOR_SIZE = 256; // texture px, same as lib/planet-cgi
export const AETHELGARD_LEAF_SIZE = 128; // leaf-cluster texture px
export const AETHELGARD_DAPPLE_COUNT = 26;
export const AETHELGARD_LEAF_FALL_COUNT = 60;
export const AETHELGARD_MIST_BANK_COUNT = 6;
export const AETHELGARD_RIPPLE_COUNT = 3;
export const AETHELGARD_LEAF_CARD_COUNT = 260;
export const AETHELGARD_SPORE_COUNT = 240;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

/* ------------------------------------------------------------------ */
/* Canopy breeze — the rainforest wind (Thule-wind rhythm).            */
/* ------------------------------------------------------------------ */

export const AETHELGARD_WIND = {
  name: 'Canopy breeze',
  bearingDeg: 300, // prevailing FROM the north-west, down the valley
  veerDeg: 20, // slow veer either side of prevailing
  veerPeriodS: 240, // one full veer cycle, 4 minutes
  baseMps: 2.4, // a rainforest breeze, not a gale
  gustMinMps: 0.8, // the lull between gusts
  gustMaxMps: 6.0, // a proper canopy gust
  gustPeriodS: 47, // one gust cycle, same rhythm as the Thule wind
};

/** 8-point compass label for a bearing in degrees. */
export function windCompass(bearingDeg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const b = (((bearingDeg % 360) + 360) % 360);
  return names[Math.round(b / 45) % 8];
}

/** Travel unit vector (x, z) for a wind FROM `bearingDeg`. */
export function windVector(bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), z: Math.cos(rad) };
}

/**
 * The canopy breeze at `nowMs`: { speed, bearingDeg, dirX, dirZ, gust }.
 * Speed rides a gust envelope (two slow sines, 47 s cycle) around the
 * 2.4 m/s base, clamped to the 0.8–6 m/s gust range; the bearing veers
 * slowly ±20° around the 300° prevailing. `gust` is 0..1 — 0 in the
 * lull, 1 at the top of a gust — for sway amplitude. Pure function
 * of the clock: deterministic, node-testable.
 */
export function aethelgardWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / AETHELGARD_WIND.gustPeriodS) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    AETHELGARD_WIND.gustMinMps,
    Math.min(
      AETHELGARD_WIND.gustMaxMps,
      AETHELGARD_WIND.baseMps + gustWave * 2.6,
    ),
  );
  const bearingDeg = AETHELGARD_WIND.bearingDeg
    + AETHELGARD_WIND.veerDeg * Math.sin((t / AETHELGARD_WIND.veerPeriodS) * Math.PI * 2 + 0.7);
  const dir = windVector(bearingDeg);
  return {
    speed,
    bearingDeg,
    dirX: dir.x,
    dirZ: dir.z,
    gust: (speed - AETHELGARD_WIND.gustMinMps)
      / (AETHELGARD_WIND.gustMaxMps - AETHELGARD_WIND.gustMinMps),
  };
}

/**
 * Crown / leaf-card / fern sway at `nowMs` for one plant on `phase`
 * (its own 0..2π so the forest never moves as one sheet).
 * Returns { x, z } metres of lateral offset, capped at ~0.45 m at
 * the top of a gust. `heightFrac` 0..1 scales the sway by how high
 * the swaying part sits (crowns move, trunks don't). Pure function
 * of the clock + wind: deterministic, node-testable.
 */
export function canopySway(phase, nowMs = Date.now(), wind = null, heightFrac = 1) {
  const w = wind || aethelgardWindAt(nowMs);
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const amp = 0.06 + 0.39 * clamp01(w.gust); // 0.06 m breathing, 0.45 m in a gust
  const sway = amp * clamp01(heightFrac);
  // Two slow sines, one per axis, so the motion wanders instead of
  // ticking back and forth on a single line.
  return {
    x: w.dirX * sway * Math.sin(t * 0.9 + phase)
      + 0.35 * sway * Math.sin(t * 0.53 + phase * 1.7),
    z: w.dirZ * sway * Math.sin(t * 0.9 + phase + 1.1)
      + 0.35 * sway * Math.cos(t * 0.47 + phase * 1.3),
  };
}

/* ------------------------------------------------------------------ */
/* Forest floor maps — leaf litter + damp moss, colour + bump.         */
/* ------------------------------------------------------------------ */

const floorCache = new Map(); // seed -> { map, bumpMap }

export function forestFloorMaps(seed = 'aethelgard-floor') {
  const key = String(seed);
  if (floorCache.has(key)) return floorCache.get(key);
  const seedInt = hashString(`aethelgard:floor:${key}`);
  const W = AETHELGARD_FLOOR_SIZE;
  const H = AETHELGARD_FLOOR_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // Broad damp-moss variation + fine leaf-litter speckle.
      const moss = fbm(u * 5, v * 5, seedInt);
      const litter = fbm(u * 14 + 9, v * 14 + 4, seedInt);
      const grain = valueNoise(u * 160, v * 160, seedInt);
      const damp = fbm(u * 3 + 31, v * 3 + 17, seedInt + 5);
      // Moss greens where wet, leaf-brown litter where dry.
      const leafMix = clamp01((litter - 0.5) * 2.2 + (moss - 0.5) * 0.6);
      let r = lerp(34, 96, leafMix);
      let g = lerp(64, 74, leafMix);
      let b = lerp(26, 34, leafMix);
      // Damp dark patches (water holds in the hollows).
      if (damp < 0.42) {
        r *= 0.62; g *= 0.72; b *= 0.66;
      }
      // Bright flecks: fresh fallen leaves catching the light.
      if (grain > 0.82) {
        r += 34; g += 26; b += 8;
      }
      const i = (y * W + x) * 4;
      color[i] = Math.max(0, Math.min(255, Math.round(r)));
      color[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      color[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      color[i + 3] = 255;
      bump[y * W + x] = Math.max(0, Math.min(255,
        Math.round(128 + (litter - 0.5) * 70 + (grain - 0.5) * 44)));
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
  const out = { map, bumpMap, roughness: 1.0, bumpScale: 0.09 };
  floorCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Leaf-cluster texture — cutout alpha for the mid-canopy leaf cards.  */
/* ------------------------------------------------------------------ */

const leafCache = new Map(); // seed -> DataTexture

export function leafClusterTexture(seed = 'aethelgard-leaf') {
  const key = String(seed);
  if (leafCache.has(key)) return leafCache.get(key);
  const seedInt = hashString(`aethelgard:leaf:${key}`);
  const rnd = mulberry32(seedInt);
  const W = AETHELGARD_LEAF_SIZE;
  const H = AETHELGARD_LEAF_SIZE;
  // Seeded leaf ellipses: centre, radii, rotation, green shade.
  const leaves = [];
  for (let i = 0; i < 46; i++) {
    leaves.push({
      cx: 8 + rnd() * (W - 16),
      cy: 8 + rnd() * (H - 16),
      rx: 5 + rnd() * 9,
      ry: 3 + rnd() * 5,
      rot: rnd() * Math.PI,
      // Leaf greens: deep canopy to sunlit lime.
      g: 74 + rnd() * 90,
      r: 26 + rnd() * 30,
      b: 26 + rnd() * 22,
      vein: rnd() * Math.PI,
    });
  }
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let best = null;
      let bestD = Infinity;
      for (let li = 0; li < leaves.length; li++) {
        const L = leaves[li];
        const dx = x - L.cx;
        const dy = y - L.cy;
        const cos = Math.cos(-L.rot);
        const sin = Math.sin(-L.rot);
        const ex = (dx * cos - dy * sin) / L.rx;
        const ey = (dx * sin + dy * cos) / L.ry;
        const d = ex * ex + ey * ey;
        if (d < 1 && d < bestD) { bestD = d; best = L; }
      }
      if (!best) {
        color[i + 3] = 0; // transparent between leaves
        continue;
      }
      // Darker toward the edge, darker along the midrib vein.
      const edge = 0.82 + 0.18 * (1 - bestD);
      const along = Math.abs(((x - best.cx) * Math.cos(best.vein)
        + (y - best.cy) * Math.sin(best.vein)) / best.rx);
      const vein = along < 0.12 ? 0.78 : 1;
      color[i] = Math.max(0, Math.min(255, Math.round(best.r * edge * vein)));
      color[i + 1] = Math.max(0, Math.min(255, Math.round(best.g * edge * vein)));
      color[i + 2] = Math.max(0, Math.min(255, Math.round(best.b * edge * vein)));
      color[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  leafCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Dappled light — sun patches drifting across the forest floor.       */
/* ------------------------------------------------------------------ */

const DAPPLES = (() => {
  const rnd = mulberry32(hashString('aethelgard:dapple'));
  return Array.from({ length: AETHELGARD_DAPPLE_COUNT }, () => ({
    cx: (rnd() - 0.5) * 150,
    cz: (rnd() - 0.5) * 150,
    scale: 2.6 + rnd() * 4.4,
    phase: rnd() * Math.PI * 2,
    drift: 0.014 + rnd() * 0.02,
    pulse: 0.3 + rnd() * 0.5,
  }));
})();

/**
 * One dapple patch at `nowMs`: { x, z, scale, opacity }.
 * Patches wander slowly (the sun moves through the canopy gaps)
 * and breathe; opacity is 0 at night and scales with `dayFactor`
 * (0..1, the sky's god-ray strength). Pure function of the clock.
 */
export function dappleAt(index, nowMs = Date.now(), dayFactor = 0.5) {
  const d = DAPPLES[((index % DAPPLES.length) + DAPPLES.length) % DAPPLES.length];
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  return {
    x: d.cx + Math.sin(t * d.drift + d.phase) * 9,
    z: d.cz + Math.cos(t * d.drift * 0.8 + d.phase * 1.3) * 9,
    scale: d.scale,
    opacity: Math.max(0, Math.min(1, dayFactor))
      * (0.10 + 0.09 * Math.sin(t * d.pulse + d.phase * 2)),
  };
}

/* ------------------------------------------------------------------ */
/* Falling leaves — seeded fall cycles, canopy to floor.               */
/* ------------------------------------------------------------------ */

const FALLING = (() => {
  const rnd = mulberry32(hashString('aethelgard:fall'));
  return Array.from({ length: AETHELGARD_LEAF_FALL_COUNT }, () => ({
    x0: (rnd() - 0.5) * 160,
    z0: (rnd() - 0.5) * 160,
    top: 22 + rnd() * 14, // falls from the canopy band
    dur: 12 + rnd() * 6, // 12–18 s per fall
    phase: rnd(), // stagger through the cycle
    drift: 1 + rnd() * 3, // sideways wander in metres
    spin: 2 + rnd() * 5, // tumble rate rad/s
    hue: rnd(), // leaf colour pick, 0 green .. 1 gold
  }));
})();

/**
 * One falling leaf at `nowMs`: { x, y, z, rotX, rotZ, opacity }.
 * The leaf falls from its canopy height to the floor over `dur`
 * seconds, then respawns at the top — a pure function of the clock,
 * so the fall is identical on every phone. Opacity fades in at the
 * top of the fall and out at the floor.
 */
export function fallingLeafAt(index, nowMs = Date.now()) {
  const L = FALLING[((index % FALLING.length) + FALLING.length) % FALLING.length];
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const age = (((t / L.dur) + L.phase) % 1 + 1) % 1; // 0 top .. 1 floor
  const sway = Math.sin(t * 1.4 + L.phase * 9) * L.drift * age;
  return {
    x: L.x0 + sway,
    y: Math.max(0.15, L.top * (1 - age)),
    z: L.z0 + Math.cos(t * 1.1 + L.phase * 7) * L.drift * age * 0.7,
    rotX: t * L.spin * 0.6 + L.phase * 6,
    rotZ: t * L.spin + L.phase * 9,
    opacity: age < 0.08 ? age / 0.08 : age > 0.9 ? (1 - age) / 0.1 : 1,
    hue: L.hue,
  };
}

/* ------------------------------------------------------------------ */
/* Mist banks — slow ground mist, thicker with fogMul.                 */
/* ------------------------------------------------------------------ */

const MISTS = (() => {
  const rnd = mulberry32(hashString('aethelgard:mist'));
  return Array.from({ length: AETHELGARD_MIST_BANK_COUNT }, () => ({
    cx: (rnd() - 0.5) * 130,
    cz: (rnd() - 0.5) * 130,
    y: 1.5 + rnd() * 4,
    scale: 34 + rnd() * 26,
    phase: rnd() * Math.PI * 2,
    drift: 0.006 + rnd() * 0.008,
  }));
})();

/**
 * One mist bank at `nowMs`: { x, y, z, scale, opacity }.
 * Banks drift with the breeze and breathe; opacity scales with
 * `fogMul` (the season's fog density, 0.85 dry .. 1.8 mist) and
 * never drops to zero — the forest always breathes a little.
 * Pure function of the clock.
 */
export function mistBankAt(index, nowMs = Date.now(), fogMul = 1) {
  const m = MISTS[((index % MISTS.length) + MISTS.length) % MISTS.length];
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const fog = Math.max(0.3, Math.min(1, fogMul / 1.8));
  return {
    x: m.cx + Math.sin(t * m.drift + m.phase) * 18,
    y: m.y,
    z: m.cz + Math.cos(t * m.drift * 0.7 + m.phase * 1.4) * 18,
    scale: m.scale,
    opacity: (0.07 + 0.06 * Math.sin(t * 0.09 + m.phase)) * fog,
  };
}

/* ------------------------------------------------------------------ */
/* Plunge-pool ripples — expanding rings at the waterfall base.        */
/* ------------------------------------------------------------------ */

/**
 * One ripple ring at `nowMs`: { scale, opacity }.
 * Rings expand from 1 m to ~7 m over a 4 s cycle, staggered by
 * index, then fade and restart — the falls never stop dripping.
 * Pure function of the clock.
 */
export function rippleAt(index, nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const cycle = 4; // seconds per ring
  const age = ((((t + index * (cycle / AETHELGARD_RIPPLE_COUNT)) % cycle) + cycle) % cycle) / cycle;
  return {
    scale: 1 + age * 6,
    opacity: (1 - age) * 0.5,
  };
}
