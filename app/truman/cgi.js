/**
 * app/truman/cgi.js — procedural CGI kit for the Truman small town
 * (Merlin, Nov 15, 2026 — Truman CGI makeover).
 *
 * The live Truman scene (gta-scene.js) was flat colour: plain boxes
 * for houses, one beige for every car, a flat-colour sky, no life.
 * This module is the makeover's shared kit, in the house idiom
 * (lib/planet-cgi/textures.js, lib/mars2/textures.js): seeded PRNG
 * + value noise painting colour + bump maps as THREE.DataTextures,
 * cached per kind+seed, deterministic so every phone paints the
 * same town. Sky, wind and the lighthouse beam are pure functions
 * of the clock (lib/planet-cgi/motion.js idiom): same place +
 * same time = the same town on every phone.
 *
 * Truman is a TOWN, not a big city: pastel siding, shingled roofs,
 * brick shopfronts, a wooden pier, a sea breeze — not Mega City
 * neon. The classic 2.5D renderer's dark-neon textures
 * (textures.js) belong to that sim's Matrix Brain identity and
 * are left alone; this kit is the 3D town's own.
 *
 * Emissive only — no new real lights anywhere. Window glow,
 * headlights, the lighthouse beam and the sun/moon are all
 * unlit materials / sprites whose brightness is a function of
 * the time of day.
 *
 * Node-safe: no DOM, no canvas — DataTextures only — so the
 * node test suite can pin every value.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../../lib/earth4/creature-textures.js';

export const TRUMAN_TEXTURE_SIZE = 256;
export const TRUMAN_EPOCH_MS = Date.UTC(2026, 0, 1);

// Roughness + bump strength per kind. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const TRUMAN_MAP_KINDS = {
  // Pale warm-neutral siding: the tint (house colour) multiplies
  // the map, so one texture serves every pastel house.
  houseSiding: { roughness: 0.85, bumpScale: 0.03, metalness: 0.0 },
  // Dark warm shingles in offset rows.
  roofShingle: { roughness: 0.95, bumpScale: 0.05, metalness: 0.0 },
  // Warm brick courses + mortar, for the main-street shops.
  brickShop: { roughness: 0.9, bumpScale: 0.04, metalness: 0.0 },
  // Weathered grey-brown pier planks.
  woodPlank: { roughness: 0.9, bumpScale: 0.05, metalness: 0.0 },
};

export const TRUMAN_KINDS = Object.keys(TRUMAN_MAP_KINDS);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// Horizontal siding: a regular board line every 1/12 of v, with a
// soft shadow under each board lip and fine grain across.
function sidingAmount(v) {
  const f = (v * 12) % 1;
  return f > 0.86 ? 1 : f > 0.78 ? 0.45 : 0;
}

// ── per-kind generators ──────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1);
// n.seed is this texture's seed int.

const GENERATORS = {
  houseSiding(u, v, n) {
    const seam = sidingAmount(v);
    const grain = valueNoise(u * 160, v * 60, n.seed);
    const mottle = fbm(u * 4, v * 4, n.seed);
    let l = 228 - seam * 34 + (grain - 0.5) * 16 + (mottle - 0.5) * 10;
    const bump = 128 + (grain - 0.5) * 20 - seam * 44;
    return { r: clamp255(l), g: clamp255(l - 2), b: clamp255(l - 8), bump: clamp255(bump) };
  },

  roofShingle(u, v, n) {
    // Offset shingle rows: each row is 1/8 of v, shingles 1/6 of u,
    // every other row shifted half a shingle.
    const row = Math.floor(v * 8);
    const shift = (row % 2) * 0.5;
    const fu = ((u + shift / 6) * 6) % 1;
    const fv = (v * 8) % 1;
    const seam = (fu > 0.92 || fv > 0.82) ? 1 : 0;
    const tone = valueNoise(Math.floor(u * 6 + shift) * 3.1, row * 2.7, n.seed);
    const grain = valueNoise(u * 180, v * 180, n.seed);
    let l = 96 + (tone - 0.5) * 44 - seam * 42 + (grain - 0.5) * 14;
    const bump = 128 + (grain - 0.5) * 24 - seam * 52;
    // Warm brown-grey shingles, not flat grey.
    return {
      r: clamp255(l + 8), g: clamp255(l - 2), b: clamp255(l - 10),
      bump: clamp255(bump),
    };
  },

  brickShop(u, v, n) {
    // Brick courses: rows 1/10 of v, bricks 1/5 of u, offset rows.
    const row = Math.floor(v * 10);
    const shift = (row % 2) * 0.5;
    const fu = ((u + shift / 5) * 5) % 1;
    const fv = (v * 10) % 1;
    const mortar = (fu > 0.94 || fv > 0.86) ? 1 : 0;
    const tone = valueNoise(Math.floor(u * 5 + shift) * 4.3, row * 3.9, n.seed);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let r = 178 + (tone - 0.5) * 46 - mortar * 96 + (grain - 0.5) * 12;
    let g = 104 + (tone - 0.5) * 30 - mortar * 62 + (grain - 0.5) * 10;
    let b = 78 + (tone - 0.5) * 24 - mortar * 48 + (grain - 0.5) * 8;
    const bump = 128 + (grain - 0.5) * 22 - mortar * 40;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  woodPlank(u, v, n) {
    // Vertical planks (pier decking runs along u): 6 planks across v.
    const plank = Math.floor(v * 6);
    const fv = (v * 6) % 1;
    const seam = fv > 0.9 ? 1 : 0;
    const grain = fbm(u * 30, v * 4, n.seed + plank);
    const tone = valueNoise(plank * 7.7, 3.3, n.seed);
    let l = 148 + (tone - 0.5) * 36 - seam * 52 + (grain - 0.5) * 26;
    const bump = 128 + (grain - 0.5) * 40 - seam * 46;
    return {
      r: clamp255(l + 6), g: clamp255(l - 4), b: clamp255(l - 16),
      bump: clamp255(bump),
    };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, roughness, bumpScale }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}` -> material

export function trumanTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size };
}

/**
 * Colour + bump maps for one Truman material kind, seeded so the
 * pattern is stable per world. Unknown kinds fall back to
 * houseSiding.
 */
export function trumanMaps(kind, seed) {
  const k = TRUMAN_MAP_KINDS[kind] ? kind : 'houseSiding';
  const key = `${k}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`truman:${k}:${seed}`);
  const W = TRUMAN_TEXTURE_SIZE;
  const H = TRUMAN_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = gen(x / W, y / H, n);
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
  const style = TRUMAN_MAP_KINDS[k];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale };
  textureCache.set(key, out);
  return out;
}

/**
 * A shared MeshStandardMaterial for one (kind, seed, tint): the
 * pattern maps are shared per kind+seed, the tint multiplies
 * the map (white by default — the maps carry their own hues).
 */
export function materialForTruman(kind, seed, tint = '#ffffff') {
  const k = TRUMAN_MAP_KINDS[kind] ? kind : 'houseSiding';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const key = `${k}|${seed}|${hex}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = trumanMaps(k, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: TRUMAN_MAP_KINDS[k].metalness,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}

// ── sky + day/night ────────────────────────────────────────────────
// simTime is the scene's 0..1 day clock (0.3 = morning, as the
// scene starts). sunAngle = simTime * 2π; dayness = max(0, sin).
// The sun intensity law is the scene's existing one (0.25 + dayness)
// — the makeover changes the colours, not the light levels.

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hexLerp(h1, h2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(h1), b = p(h2);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/**
 * The whole small-town sky at `simTime`: colours as hex strings
 * plus the numbers the scene drives its (existing) lights and
 * emissive materials with. Pure function — node-testable.
 * Returns { sky, fog, sunColor, sunIntensity, hemiSky, hemiGround,
 * hemiIntensity, windowGlow, starOpacity, sunOpacity, moonOpacity,
 * dusk, dayness }.
 */
export function trumanSkyAt(simTime) {
  const sunAngle = ((simTime % 1) + 1) % 1 * Math.PI * 2;
  const dayness = Math.max(0, Math.sin(sunAngle));
  // Dawn/dusk: the sun is up but low — a warm wash over the sky.
  const dusk = dayness > 0 && dayness < 0.4 ? 1 - dayness / 0.4 : 0;
  let sky = hexLerp('#0b1026', '#8ecfee', smooth(0, 0.5, dayness));
  sky = hexLerp(sky, '#e8956d', dusk * 0.55);
  const sunColor = hexLerp('#ffb37a', '#fff3d6', smooth(0, 0.4, dayness));
  return {
    sky,
    fog: sky,
    sunColor,
    sunIntensity: 0.25 + dayness * 1.0,
    hemiSky: hexLerp('#1a2340', '#cde7ff', smooth(0, 0.5, dayness)),
    hemiGround: hexLerp('#1a1610', '#6a7a4a', smooth(0, 0.5, dayness)),
    hemiIntensity: 0.35 + dayness * 0.45,
    // Windows glow once the day fades: full at night, dark by midday.
    windowGlow: clamp01((0.42 - dayness) / 0.42),
    starOpacity: clamp01((0.25 - dayness) / 0.25),
    sunOpacity: clamp01(dayness / 0.05),
    moonOpacity: clamp01((0.08 - dayness) / 0.08),
    dusk,
    dayness,
  };
}

// ── wind ───────────────────────────────────────────────────────────
// Truman's sea breeze (Merlin gave no numbers — worker's choice,
// echoing the Moon wind's rhythm in lib/planet-cgi/motion.js:
// 47 s gusts, ±veer over 4 min): base 2.0 m/s off the water,
// gusts ±1.2, veer ±0.35 rad. It sways the trees and drifts the
// clouds; it never moves a mechanic.

export const TRUMAN_WIND = {
  baseDirection: 0.9, // blowing from the sea (east) inland
  baseSpeed: 2.0,
  gustAmp: 1.2,
  gustPeriodS: 47,
  veerAmp: 0.35,
  veerPeriodS: 240,
};

/** Truman's breeze at `nowMs`: { direction, speed, gust } — deterministic. */
export function trumanWind(nowMs = Date.now()) {
  const t = (Number(nowMs) - TRUMAN_EPOCH_MS) / 1000;
  const direction = TRUMAN_WIND.baseDirection
    + TRUMAN_WIND.veerAmp * Math.sin((t / TRUMAN_WIND.veerPeriodS) * Math.PI * 2);
  const speed = Math.max(
    0.4,
    TRUMAN_WIND.baseSpeed
      + TRUMAN_WIND.gustAmp * Math.sin((t / TRUMAN_WIND.gustPeriodS) * Math.PI * 2 + 1.3),
  );
  const gust = clamp01((speed - TRUMAN_WIND.baseSpeed) / TRUMAN_WIND.gustAmp);
  return { direction, speed, gust };
}

// ── lighthouse beam ────────────────────────────────────────────────
// One slow sweep (~12.6 s per revolution), a pure function of the
// device clock — the beam is an emissive cone, never a light.

export const LIGHTHOUSE_BEAM_RATE_RAD_S = 0.5;

/** Beam azimuth (rad) at `nowMs` — deterministic, wraps at 2π. */
export function lighthouseBeamAngle(nowMs = Date.now()) {
  const t = (Number(nowMs) - TRUMAN_EPOCH_MS) / 1000;
  return (LIGHTHOUSE_BEAM_RATE_RAD_S * t) % (Math.PI * 2);
}

// ── clouds ─────────────────────────────────────────────────────────
// Ten lazy small-town clouds: seeded base positions, drifting
// downwind with the breeze. cloudOffset returns the x drift at
// `nowMs` for cloud `index` — the scene adds it to the base x
// and wraps around the town.

export const TRUMAN_CLOUD_COUNT = 10;
export const TRUMAN_CLOUD_SPAN = 560; // drift wraps across ±280

/** Seeded base placements for the cloud layer (stable per load). */
export function trumanClouds() {
  const rnd = mulberry32(hashString('truman:clouds'));
  const clouds = [];
  for (let i = 0; i < TRUMAN_CLOUD_COUNT; i++) {
    clouds.push({
      x: (rnd() - 0.5) * 480,
      z: (rnd() - 0.5) * 480,
      y: 55 + rnd() * 35,
      scale: 14 + rnd() * 16,
      speed: 1.1 + rnd() * 0.5,
    });
  }
  return clouds;
}

/** Downwind drift (m) for cloud `index` at `nowMs` — wraps the span. */
export function cloudOffset(index, nowMs = Date.now()) {
  const t = (Number(nowMs) - TRUMAN_EPOCH_MS) / 1000;
  const speed = 1.1 + (index % 5) * 0.25;
  const off = (t * speed) % TRUMAN_CLOUD_SPAN;
  return off < 0 ? off + TRUMAN_CLOUD_SPAN : off;
}
