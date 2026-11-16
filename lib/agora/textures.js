/**
 * lib/agora/textures.js — procedural Greek market-city materials (Merlin, Nov 15, 2026).
 *
 * Agora had no 3D scene at all — the feed page was flat colour
 * and a video backdrop — so the market city is built fresh here
 * in the house CGI idiom (lib/planet-cgi/textures.js,
 * lib/mars2/textures.js): seeded PRNG + value noise painting
 * colour + bump maps as THREE.DataTextures, cached per
 * kind+seed, deterministic so every phone paints the same
 * square. Procedural only — no bought assets, no model
 * downloads.
 *
 * What each kind reads as:
 * - cobble: warm sandstone street cobbles — rounded stones in
 *   offset rows, sandy mortar, dust in the joints, worn smooth
 *   in the middle of the lane.
 * - marble: pale Pentelic marble — fine grain, soft grey veins,
 *   a warm sun-bleach, faint chisel marks on the flutes.
 * - plaster: whitewashed walls — soft lime wash, hairline
 *   cracks, dust low down, a faint blue-grey wash in shadow.
 * - terracotta: roof tiles — overlapping half-round tiles in
 *   burnt orange, darker in the grooves, dust film, a few
 *   lichen specks.
 * - awning: striped market canvas — bold stripes (tint sets
 *   the stripe colour, white between), canvas weave, dust
 *   and sun-fade.
 * - oliveWood: stall counters and beams — warm olive-brown
 *   grain running lengthwise, knots, worn smooth on top.
 * - mosaic: the square's centre medallion — a Greek-key
 *   border in deep blue on pale stone, tesserae speckle.
 *
 * Maps are 256x256 like the planet kit. The tint multiplies
 * the map (white by default — the maps carry their own hues).
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';

export const AGORA_TEXTURE_SIZE = 256;

// Roughness + bump strength per kind. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const AGORA_KINDS = {
  cobble: { roughness: 0.95, bumpScale: 0.07, metalness: 0.0 },
  marble: { roughness: 0.35, bumpScale: 0.02, metalness: 0.05 },
  plaster: { roughness: 0.9, bumpScale: 0.03, metalness: 0.0 },
  terracotta: { roughness: 0.85, bumpScale: 0.05, metalness: 0.0 },
  awning: { roughness: 0.9, bumpScale: 0.02, metalness: 0.0 },
  oliveWood: { roughness: 0.75, bumpScale: 0.04, metalness: 0.0 },
  mosaic: { roughness: 0.8, bumpScale: 0.03, metalness: 0.0 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// ── per-kind generators ──────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1);
// n.seed is this texture's seed int.

const GENERATORS = {
  cobble(u, v, n) {
    // Offset rows of rounded sandstone cobbles: each stone its
    // own warm tint, darker sandy mortar between, dust settled
    // in the joints, wear in the middle of the lane.
    const cols = 8;
    const rows = 8;
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const cu = ((u + off / cols) * cols) % 1;
    const cv = (v * rows) % 1;
    const du = Math.abs(cu - 0.5) * 2;
    const dv = Math.abs(cv - 0.5) * 2;
    const d = Math.sqrt(du * du + dv * dv);
    const joint = d > 0.86 ? 1 : 0;
    const ci = Math.floor(u * cols + off) + row * cols;
    const stoneRnd = n.stoneRnd ? n.stoneRnd[ci % n.stoneRnd.length] : 0.5;
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const dust = fbm(u * 5, v * 9, n.seed + 2);
    let r = 198 + stoneRnd * 34 - joint * 74 - dust * 26 + (grain - 0.5) * 16;
    let g = 172 + stoneRnd * 28 - joint * 66 - dust * 24 + (grain - 0.5) * 14;
    let b = 138 + stoneRnd * 22 - joint * 56 - dust * 20 + (grain - 0.5) * 12;
    const bump = 128 - joint * 52 + (grain - 0.5) * 30 + (d < 0.5 ? 14 : 0);
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  marble(u, v, n) {
    // Pale Pentelic marble: fine grain, soft grey veins
    // wandering diagonally, warm sun-bleach, faint flute
    // chisel marks running vertically.
    const vein = 0.5 + 0.5 * Math.sin((u * 3 + v * 9) * 6 + fbm(u * 4, v * 4, n.seed) * 7);
    const veinLine = vein > 0.93 ? 1 : 0;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    const bleach = fbm(u * 3, v * 6, n.seed + 4);
    const flute = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 12);
    let l = 238 + (bleach - 0.5) * 16 - veinLine * 34 + (grain - 0.5) * 10;
    const r = l;
    const g = l - 2 - flute * 2;
    const b = l - 6 - flute * 2;
    const bump = 128 + (grain - 0.5) * 14 - veinLine * 22 + (flute - 0.5) * 10;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  plaster(u, v, n) {
    // Whitewash over stone: soft lime white, hairline cracks,
    // dust low down, a faint blue-grey wash where the sun
    // never reaches.
    const crack = valueNoise(u * 60, v * 8, n.seed + 7) > 0.965 ? 1 : 0;
    const dust = clamp01(fbm(u * 5, v * 9, n.seed + 2) * 0.7 + (1 - v) * 0.3 - 0.25);
    const grain = valueNoise(u * 190, v * 190, n.seed);
    const wash = fbm(u * 4, v * 4, n.seed + 5);
    let r = 242 - crack * 52 - dust * 42 + (grain - 0.5) * 10 - wash * 6;
    let g = 238 - crack * 50 - dust * 38 + (grain - 0.5) * 10 - wash * 4;
    let b = 232 - crack * 48 - dust * 30 + (grain - 0.5) * 10 + wash * 4;
    const bump = 128 + (grain - 0.5) * 18 - crack * 30 - dust * 8;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  terracotta(u, v, n) {
    // Overlapping half-round roof tiles: burnt orange, darker
    // in the grooves between tile rows, dust film, a few pale
    // lichen specks.
    const cols = 6;
    const cu = (u * cols) % 1;
    const groove = cu < 0.1 || cu > 0.9 ? 1 : 0;
    const tileRnd = n.tileRnd ? n.tileRnd[Math.floor(u * cols) % n.tileRnd.length] : 0.5;
    const dust = fbm(u * 6, v * 8, n.seed + 2);
    const lichen = valueNoise(u * 90, v * 90, n.seed + 6) > 0.93 ? 1 : 0;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    let r = 178 + tileRnd * 34 - groove * 52 - dust * 30 + lichen * 60 + (grain - 0.5) * 14;
    let g = 96 + tileRnd * 20 - groove * 32 - dust * 20 + lichen * 52 + (grain - 0.5) * 12;
    let b = 58 + tileRnd * 12 - groove * 20 - dust * 12 + lichen * 40 + (grain - 0.5) * 10;
    const bump = 128 - groove * 46 + (grain - 0.5) * 26 + (cu > 0.3 && cu < 0.7 ? 18 : 0);
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  awning(u, v, n) {
    // Striped market canvas: bold colour stripes (the tint
    // multiplies the map, so the stripes read in the stall's
    // own colour) with white between, canvas weave, sun-fade
    // and dust at the low edge.
    const stripe = Math.floor(u * 8) % 2 === 0 ? 1 : 0;
    const weave = valueNoise(u * 160, v * 160, n.seed);
    const fade = fbm(u * 4, v * 3, n.seed + 3);
    const dust = clamp01((1 - v) * 0.5 + fbm(u * 5, v * 7, n.seed + 2) * 0.4 - 0.3);
    // Stripe colour is a deep tinted base; white stripes are
    // near-white. The material tint multiplies this.
    let r = stripe ? 178 : 240;
    let g = stripe ? 96 : 236;
    let b = stripe ? 58 : 228;
    r = r * (1 - dust * 0.4) + 198 * dust * 0.4 - fade * 14 + (weave - 0.5) * 12;
    g = g * (1 - dust * 0.4) + 172 * dust * 0.4 - fade * 12 + (weave - 0.5) * 12;
    b = b * (1 - dust * 0.4) + 138 * dust * 0.4 - fade * 10 + (weave - 0.5) * 12;
    const bump = 128 + (weave - 0.5) * 22 - dust * 8;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  oliveWood(u, v, n) {
    // Stall counters and beams: warm olive-brown grain running
    // lengthwise, knots, worn smooth and pale on top.
    const grainLine = 0.5 + 0.5 * Math.sin((v * 26) + fbm(u * 6, v * 40, n.seed) * 5);
    const knot = valueNoise(u * 30, v * 6, n.seed + 8) > 0.9 ? 1 : 0;
    const wear = clamp01(1 - v - 0.35);
    const grain = valueNoise(u * 200, v * 60, n.seed);
    let r = 138 - (grainLine > 0.8 ? 22 : 0) - knot * 44 + wear * 26 + (grain - 0.5) * 14;
    let g = 102 - (grainLine > 0.8 ? 16 : 0) - knot * 32 + wear * 20 + (grain - 0.5) * 12;
    let b = 64 - (grainLine > 0.8 ? 10 : 0) - knot * 20 + wear * 14 + (grain - 0.5) * 10;
    const bump = 128 + (grainLine - 0.5) * 34 - knot * 30 + (grain - 0.5) * 20;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  mosaic(u, v, n) {
    // The square's centre medallion: a Greek-key border in
    // deep Aegean blue on pale stone, tesserae speckle across
    // the field. The key runs as a square ring at r ~0.32–0.40
    // of the disc, drawn as a stepped meander.
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy);
    // Stepped meander: the ring band carries a square-wave key.
    const ang = Math.atan2(dy, dx);
    const key = 0.5 + 0.5 * Math.sin(ang * 16 + Math.floor(r * 40) * 1.7);
    const inRing = r > 0.3 && r < 0.42 ? 1 : 0;
    const keyBlue = inRing && key > 0.55 ? 1 : 0;
    const grain = valueNoise(u * 220, v * 220, n.seed);
    const dust = fbm(u * 5, v * 5, n.seed + 2);
    let rr = 226 - keyBlue * 148 - dust * 22 + (grain - 0.5) * 14;
    let g = 220 - keyBlue * 122 - dust * 20 + (grain - 0.5) * 14;
    let b = 204 - keyBlue * 62 - dust * 16 + (grain - 0.5) * 14;
    const bump = 128 + (grain - 0.5) * 26 - keyBlue * 10;
    return { r: clamp255(rr), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, roughness, bumpScale, metalness }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}` -> material
let textureBytes = 0;

export function agoraTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump maps for one Agora material kind, seeded so the
 * pattern is stable per world. Unknown kinds fall back to plaster.
 */
export function agoraMaps(kind, seed) {
  const k = AGORA_KINDS[kind] ? kind : 'plaster';
  const key = `${k}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`agora-material:${k}:${seed}`);
  const W = AGORA_TEXTURE_SIZE;
  const H = AGORA_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  if (k === 'cobble') {
    const stoneRnd = mulberry32(seedInt + 201);
    n.stoneRnd = Array.from({ length: 64 }, () => stoneRnd());
  }
  if (k === 'terracotta') {
    const tileRnd = mulberry32(seedInt + 301);
    n.tileRnd = Array.from({ length: 6 }, () => tileRnd());
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
  const style = AGORA_KINDS[k];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, metalness: style.metalness };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A shared MeshStandardMaterial for one (kind, seed, tint): the
 * pattern maps are shared per kind+seed, the tint multiplies the
 * map (white by default — the maps carry their own hues). The
 * awning tint is the stall's colour: the stripe base is warm
 * orange in the map, and the tint steers it to the stall's own
 * hue (blue olives, purple figs, and so on).
 */
export function materialForAgora(kind, seed, tint = '#ffffff', opts = {}) {
  const k = AGORA_KINDS[kind] ? kind : 'plaster';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const side = opts.side || THREE.FrontSide;
  const key = `${k}|${seed}|${hex}|${side === THREE.DoubleSide ? 'double' : 'front'}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = agoraMaps(k, seed);
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
