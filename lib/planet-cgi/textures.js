/**
 * planet-cgi/textures.js — procedural planet surface maps (Merlin, Nov 14, 2026).
 *
 * The CGI standard is the Earth 4 v2 build (lib/earth4/creature-textures.js):
 * seeded PRNG + value-noise generators that paint colour + bump maps as
 * THREE.DataTextures — node-safe (no DOM canvas), cached per family+seed,
 * deterministic so every phone paints the same planet. This module is the
 * same treatment for whole worlds: regolith, gas giants, earth-like
 * bodies, ice and rock. One module, every planet — no one-off texture
 * code per world.
 *
 * Maps are 256x256: a planet fills the screen, a creature does not.
 * Colour maps carry real hues (a planet's colour IS its identity —
 * unlike creature coats, where the class colour carries the hue).
 * Bump maps carry the relief: craters, dunes, band turbulence.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';

export const PLANET_TEXTURE_SIZE = 256;

// Roughness + bump strength per family. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const PLANET_FAMILY_STYLE = {
  lunarRegolith: { roughness: 0.95, bumpScale: 0.08 },
  marsRegolith: { roughness: 0.95, bumpScale: 0.09 },
  gasGiant: { roughness: 0.6, bumpScale: 0.02 },
  earthLike: { roughness: 0.7, bumpScale: 0.05 },
  iceCap: { roughness: 0.4, bumpScale: 0.03 },
  rock: { roughness: 1.0, bumpScale: 0.12 },
};

export const PLANET_FAMILIES = Object.keys(PLANET_FAMILY_STYLE);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// Seeded crater field: deterministic list of {u, v, r} so colour
// and bump agree exactly (same craters, same places, both maps).
function craterField(seed, count, rMin, rMax) {
  const rnd = mulberry32(seed);
  const craters = [];
  for (let i = 0; i < count; i++) {
    craters.push({ u: rnd(), v: rnd(), r: rMin + rnd() * (rMax - rMin) });
  }
  return craters;
}

// Distance in u with wrap-around (a sphere's seam must not cut
// a crater in half on one map and not the other).
function duWrapped(u, cu) {
  let d = Math.abs(u - cu);
  return Math.min(d, 1 - d);
}

// ── per-family generators ──────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1);
// n.seed is this texture's seed int.

const GENERATORS = {
  lunarRegolith(u, v, n) {
    // Grey regolith: fine speckle + shaded craters (dark bowl,
    // bright rim on the sun side, darker pit) + large dark maria
    // blotches. Mirrors the hub Moon's canvas texture
    // (components/HubMoon.jsx makeMoonTexture) as a bump-mapped
    // DataTexture — one source of truth for the look.
    const craters = n.craters;
    const maria = fbm(u * 4, v * 4, n.seed);
    const speckle = valueNoise(u * 220, v * 220, n.seed);
    let g = 150 + (maria - 0.5) * 46 + (speckle - 0.5) * 34;
    let bump = 128 + (speckle - 0.5) * 40 + (maria - 0.5) * 24;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const dx = duWrapped(u, c.u) * 2; // u spans twice the v range
      const dy = (v - c.v) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= c.r) continue;
      const t = d / c.r; // 0 centre → 1 rim
      const rim = Math.exp(-Math.pow((t - 0.82) * 5, 2));
      const bowl = 1 - t;
      g -= bowl * 52;
      g += rim * 46;
      bump -= bowl * 90;
      bump += rim * 70;
    }
    g = Math.max(60, Math.min(215, g));
    return { r: g, g, b: g, bump: Math.max(0, Math.min(255, bump)) };
  },

  marsRegolith(u, v, n) {
    // Rust-red dunes: long fbm dune bands, darker basalt patches,
    // pale dust drifts, fine grain. The red is the planet — no
    // separate tint needed.
    const dune = fbm(u * 6, v * 22, n.seed);
    const patch = fbm(u * 5 + 31, v * 5 + 17, n.seed);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const dust = fbm(u * 3, v * 9, n.seed + 5);
    let r = 178 + (dune - 0.5) * 44 - (patch < 0.42 ? 42 : 0) + (dust - 0.5) * 22;
    let g = 96 + (dune - 0.5) * 26 - (patch < 0.42 ? 22 : 0) + (dust - 0.5) * 12;
    let b = 58 + (dune - 0.5) * 18 - (patch < 0.42 ? 12 : 0) + (dust - 0.5) * 8;
    const bump = 128 + (dune - 0.5) * 90 + (grain - 0.5) * 36;
    return {
      r: Math.max(40, Math.min(235, r)),
      g: Math.max(20, Math.min(165, g)),
      b: Math.max(10, Math.min(120, b)),
      bump: Math.max(0, Math.min(255, bump)),
    };
  },

  gasGiant(u, v, n) {
    // Jupiter: horizontal bands in cream / tan / rust / brown,
    // with turbulence — the band edges wobble with fbm, and thin
    // white streaks ride the jets. v is latitude (0 = south pole).
    // The Great Red Spot is NOT painted here: it lives as a
    // separate swirling overlay (see spotSwirlTexture) so it can
    // turn at its own rate.
    const wobble = (fbm(u * 9, v * 3, n.seed) - 0.5) * 0.05;
    const lat = v + wobble;
    const bands = [
      [0.0, 0.72, 0.62, 0.52], // south polar brown
      [0.08, 0.82, 0.70, 0.55],
      [0.16, 0.88, 0.78, 0.62], // south temperate cream
      [0.24, 0.72, 0.55, 0.42], // south equatorial brown
      [0.32, 0.85, 0.72, 0.55],
      [0.40, 0.93, 0.86, 0.70], // equatorial cream
      [0.48, 0.78, 0.60, 0.45], // north equatorial rust
      [0.56, 0.88, 0.76, 0.60],
      [0.64, 0.70, 0.52, 0.40], // north temperate brown
      [0.72, 0.86, 0.74, 0.58], // north cream
      [0.80, 0.78, 0.64, 0.50],
      [0.88, 0.72, 0.60, 0.50], // north polar
      [1.0, 0.68, 0.56, 0.46],
    ];
    let lo = bands[0];
    let hi = bands[bands.length - 1];
    for (let i = 0; i < bands.length - 1; i++) {
      if (lat >= bands[i][0] && lat <= bands[i + 1][0]) {
        lo = bands[i];
        hi = bands[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, hi[0] - lo[0]);
    const t = clamp01((lat - lo[0]) / span);
    const s = t * t * (3 - 2 * t);
    const streak = valueNoise(u * 60, v * 260, n.seed);
    const jet = streak > 0.86 ? 1.12 : 1;
    const turb = fbm(u * 24, v * 90, n.seed + 11);
    const r = (lo[1] + (hi[1] - lo[1]) * s) * 255 * jet * (0.94 + turb * 0.12);
    const g = (lo[2] + (hi[2] - lo[2]) * s) * 255 * jet * (0.94 + turb * 0.12);
    const b = (lo[3] + (hi[3] - lo[3]) * s) * 255 * jet * (0.94 + turb * 0.12);
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      bump: Math.round(128 + (turb - 0.5) * 46),
    };
  },

  earthLike(u, v, n) {
    // Blue oceans, green/brown continents, white cloud streaks,
    // bright ice caps — the Earth as seen from the Moon. Same
    // look as MoonScene's canvas Earth, as a bump-mapped
    // DataTexture so the clouds can live on their own layer.
    const cont = fbm(u * 5, v * 5, n.seed);
    const detail = fbm(u * 14 + 9, v * 14 + 4, n.seed);
    const land = cont > 0.52;
    const landMix = clamp01((cont - 0.52) * 6 + (detail - 0.5) * 0.5);
    let r = 47 + (detail - 0.5) * 14;
    let g = 111 + (detail - 0.5) * 18;
    let b = 208 + (detail - 0.5) * 14;
    if (land) {
      // Green where wet, brown where dry.
      const green = landMix > 0.55;
      r = green ? 63 + landMix * 40 : 138 + landMix * 30;
      g = green ? 143 + landMix * 30 : 111 + landMix * 22;
      b = green ? 79 + landMix * 20 : 63 + landMix * 16;
    }
    // Ice caps near the poles.
    if (v < 0.05 || v > 0.95) {
      r = 240; g = 248; b = 255;
    }
    const bump = land ? 150 + (cont - 0.5) * 90 : 110;
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      bump: Math.max(0, Math.min(255, bump)),
    };
  },

  iceCap(u, v, n) {
    // Polar ice: white-blue crystal with fine crevasse lines.
    const crevasse = 0.5 + 0.5 * Math.sin((u * 7 + v * 13) * 24
      + fbm(u * 6, v * 6, n.seed) * 6);
    const sparkle = valueNoise(u * 180, v * 180, n.seed);
    const l = 0.86 + (crevasse > 0.92 ? -0.1 : 0) + (sparkle - 0.5) * 0.08;
    return {
      r: Math.round(255 * l * 0.94),
      g: Math.round(255 * l * 0.97),
      b: Math.round(255 * l),
      bump: Math.round(128 + (crevasse - 0.5) * 60),
    };
  },

  rock(u, v, n) {
    // Dark basalt with pits — Moon and Mars rocks, one family.
    const pit = valueNoise(u * 46, v * 46, n.seed);
    const mottle = fbm(u * 10, v * 10, n.seed);
    const l = pit > 0.82 ? 0.32 : 0.52 + mottle * 0.22;
    return {
      r: Math.round(255 * l * 0.98),
      g: Math.round(255 * l * 0.98),
      b: Math.round(255 * l),
      bump: Math.round(pit > 0.82 ? 40 : 128 + mottle * 70),
    };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${family}|${seed}` -> { map, bumpMap, roughness, bumpScale }
const materialCache = new Map(); // `${family}|${seed}|${tintHex}` -> material
let textureBytes = 0;

export function planetTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump maps for one planet surface family, seeded so the
 * pattern is stable per world. Unknown families fall back to rock.
 */
export function planetMaps(family, seed) {
  const fam = PLANET_FAMILY_STYLE[family] ? family : 'rock';
  const key = `${fam}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[fam];
  const seedInt = hashString(`planet:${fam}:${seed}`);
  const W = PLANET_TEXTURE_SIZE;
  const H = PLANET_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  if (fam === 'lunarRegolith') n.craters = craterField(seedInt, 90, 0.03, 0.16);
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
  const style = PLANET_FAMILY_STYLE[fam];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A shared MeshStandardMaterial for one (family, seed, tint): the
 * pattern maps are shared per family+seed, the tint multiplies
 * the map (white by default — planet maps carry their own hues).
 */
export function materialForPlanet(family, seed, tint = '#ffffff') {
  const fam = PLANET_FAMILY_STYLE[family] ? family : 'rock';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const key = `${fam}|${seed}|${hex}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = planetMaps(fam, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}

/**
 * The Great Red Spot as its own swirling overlay: a soft-edged
 * rust ellipse with a brighter rim and a darker core, on a
 * transparent canvas texture. It rides slightly above the gas
 * giant's surface at the spot's UV (u 0.62, v 0.36 — southern
 * temperate belt) and turns slowly on its own clock, so the storm
 * visibly swirls while the bands flow past beneath it.
 */
export const GREAT_RED_SPOT_UV = { u: 0.62, v: 0.36 };

/**
 * Where a surface feature at texture UV (u, v) sits on a sphere of
 * `radius`, lifted `lift` above the surface — the same UV mapping
 * three.js SphereGeometry uses (v = 1 at the north pole, u wraps
 * around Y, theta measured from +Y). Returns the anchor position,
 * the outward normal, the quaternion that turns +Z onto the normal
 * (for a decal plane hugging the surface), and a point just above
 * the surface for a storm light. The Great Red Spot's UV (0.62,
 * 0.36) lands in the southern temperate belt, about 25°S.
 */
export function spotAnchorOnSphere(uv, radius, lift = 1.0) {
  const theta = (1 - uv.v) * Math.PI;
  const phi = uv.u * Math.PI * 2;
  const r = radius + lift;
  const position = new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  );
  const normal = position.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal,
  );
  const lightPosition = normal.clone().multiplyScalar(radius + 16);
  return { position, normal, quaternion, lightPosition };
}

export function spotSwirlTexture() {
  const W = 128;
  const H = 128;
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W - 0.5;
      const v = y / H - 0.5;
      const d = Math.sqrt((u * 1.6) * (u * 1.6) + v * v);
      const edge = Math.max(0, 1 - d * 2.1);
      const swirl = 0.5 + 0.5 * Math.sin(Math.atan2(v, u * 1.6) * 3 + d * 14);
      const a = Math.round(255 * edge * (d < 0.42 ? 0.95 : 0.75));
      const r = Math.round(198 + swirl * 28 - d * 30);
      const g = Math.round(96 + swirl * 18 - d * 18);
      const b = Math.round(58 + swirl * 10 - d * 10);
      const i = (y * W + x) * 4;
      color[i] = Math.max(0, Math.min(255, r));
      color[i + 1] = Math.max(0, Math.min(255, g));
      color[i + 2] = Math.max(0, Math.min(255, b));
      color[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A drifting cloud layer for an earth-like body: soft white
 * streaks on transparency, meant for a slightly larger sphere
 * turning a touch faster than the surface beneath it.
 */
export function cloudLayerTexture(seed = 'earth-clouds') {
  const W = 256;
  const H = 128;
  const color = new Uint8Array(W * H * 4);
  const seedInt = hashString(`planet:clouds:${seed}`);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const streak = fbm(u * 9, v * 5, seedInt);
      const puff = fbm(u * 22 + 40, v * 16, seedInt);
      const a = clamp01((streak - 0.52) * 3.2) * (0.55 + puff * 0.45);
      const i = (y * W + x) * 4;
      color[i] = 255;
      color[i + 1] = 255;
      color[i + 2] = 255;
      color[i + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
