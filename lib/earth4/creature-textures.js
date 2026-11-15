/**
 * creature-textures.js — procedural surface maps for Earth 4 creatures.
 *
 * The anatomy build map names surfaces ("fur", "overlapping scales",
 * "smooth mucus skin") — prose, not pixels. This module turns a
 * surface FAMILY (from build-plan.js surfaceFamilyFor) into real
 * colour + bump maps, generated in pure JS with a seeded PRNG so
 * the same species always wears the same coat, and cached so a
 * family+class pair costs one 128x128 texture pair no matter how
 * many creatures wear it.
 *
 * The maps are PATTERNS, not photographs: a colour map in the
 * 0.62–1.0 luminance range (so map x class colour stays readable)
 * and a bump height map. The class-seeded base colour still comes
 * from the builder (real species colour exists for ~0.3% of
 * species, so the class colour stands — the texture is the surface
 * structure the research describes, not an invented colour).
 *
 * Structure notes (all from the fetched reference research):
 *  - fur: guard-hair strands with agouti banding (dark-light-dark
 *    along a shaft), grain head-to-tail, roughness 0.8-0.9.
 *  - feather: contour feathers overlapping like shingles, barbs at
 *    30-45 deg off the rachis, roughness 0.4-0.6 with slight gloss.
 *  - scale_fish: elasmoid scales overlapping head-to-tail, focus +
 *    circuli (growth rings), glossy 0.25-0.4.
 *  - scale_reptile: keeled plates, largest on head/belly, grooves
 *    between plates, matte-to-satin.
 *  - skin: pores 0.5-2 mm + fine furrows + large directional folds
 *    at joints; elephant-style deep polygonal cracks for the
 *    coarsest end (same generator, stronger folds).
 *  - chitin: sclerite plates joined by pale arthrodial membranes
 *    (1-5% of segment width, recessed dark grooves), glossy.
 *  - shell: concentric growth lines parallel to the aperture +
 *    banding; nacre interior is not modelled (outside only).
 *  - bark: rhytidome furrows (vertical), lenticel dashes, matte.
 *  - leaf: midrib + diagonal side veins + mottling.
 *  - slime: wet gloss, almost flat bump.
 *  - keratin: fine longitudinal lines (beak/horn/claw).
 *  - sponge: porous pits. fungal: cap blotches + radial gill
 *    lines. cuticle: fine transverse rings. thallus: crusty
 *    blotches. membrane: fine veins, near-flat.
 *
 * Node-safe: THREE.DataTexture is pure JS (no DOM canvas), so the
 * node test suite can build every texture. Maps are 128x128:
 * enough for a creature a few metres across on a phone screen,
 * ~80 KB per family+class pair.
 */

import * as THREE from 'three';

export const TEXTURE_SIZE = 128;

// Roughness + bump strength per family (from the research: dry fur
// 0.8-0.9, feather vane 0.4-0.6, fish scale glossy 0.25-0.4, bark
// matte 0.9-1.0, slime wet 0.25). bumpScale is in texture space —
// tuned by eye; the phone check is the real verdict.
export const FAMILY_STYLE = {
  fur: { roughness: 0.85, bumpScale: 0.03 },
  feather: { roughness: 0.5, bumpScale: 0.04 },
  scale_fish: { roughness: 0.35, bumpScale: 0.06 },
  scale_reptile: { roughness: 0.55, bumpScale: 0.06 },
  skin: { roughness: 0.7, bumpScale: 0.04 },
  chitin: { roughness: 0.35, bumpScale: 0.03 },
  shell: { roughness: 0.7, bumpScale: 0.05 },
  bark: { roughness: 0.95, bumpScale: 0.12 },
  leaf: { roughness: 0.6, bumpScale: 0.03 },
  slime: { roughness: 0.25, bumpScale: 0.01 },
  membrane: { roughness: 0.5, bumpScale: 0.01 },
  keratin: { roughness: 0.45, bumpScale: 0.02 },
  sponge: { roughness: 0.9, bumpScale: 0.08 },
  fungal: { roughness: 0.8, bumpScale: 0.04 },
  cuticle: { roughness: 0.6, bumpScale: 0.03 },
  thallus: { roughness: 0.9, bumpScale: 0.06 },
};

export const SURFACE_FAMILIES = Object.keys(FAMILY_STYLE);

// ── seeded PRNG + value noise ──────────────────────────────────────

export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)
    + Math.imul(seed, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Colour maps stay in 0.62-1.0 luminance so map x class colour
// never goes black: the class colour carries the hue, the map
// carries the structure.
const shade = (v) => Math.round(255 * (0.62 + 0.38 * clamp01(v)));

// ── per-family generators ──────────────────────────────────────────
// Each fills colour (RGBA) + bump (single channel) for one pixel.
// u, v in [0,1); n is the noise helper bound to this texture's seed.

const GENERATORS = {
  fur(u, v, n) {
    // Guard-hair strands run along v (head-to-tail grain); agouti
    // banding dark-light-dark along each shaft.
    const strand = fbm(u * 90, v * 6, n.seed);
    const band = 0.5 + 0.5 * Math.sin(v * 220 + fbm(u * 30, v * 8, n.seed) * 9);
    const under = fbm(u * 18, v * 18, n.seed);
    const l = 0.55 + strand * 0.3 + band * 0.12 + under * 0.1;
    return { l, b: Math.round(255 * (0.35 + strand * 0.5)) };
  },
  feather(u, v, n) {
    // Shingle rows of contour feathers: each feather a rounded arc
    // with a darker edge and a rachis line; barbs hatch diagonally.
    const rowH = 1 / 6;
    const row = Math.floor(v / rowH);
    const rv = (v - row * rowH) / rowH;
    const off = (row % 2) * 0.5;
    const fu = (u + off) % 1;
    const fx = Math.abs(fu - 0.5) * 2;
    const arc = Math.sqrt(Math.max(0, 1 - fx * fx));
    const edge = rv > 0.86 ? 0.45 : 1; // overlapping tip shadow
    const rachis = Math.abs(fu - 0.5) < 0.012 ? 0.7 : 1;
    const barb = 0.92 + 0.08 * Math.sin((u * 3 + v * 9) * 40);
    const l = (0.6 + arc * 0.35) * edge * rachis * barb;
    return { l, b: Math.round(255 * (0.3 + arc * 0.5) * edge) };
  },
  scale_fish(u, v, n) {
    // Elasmoid scales: rows offset by half, each scale a dome with
    // a bright exposed rear edge and faint circuli (growth rings).
    const rows = 8;
    const cols = 8;
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const cu = (((u + off) * cols) % 1 + 1) % 1;
    const cv = (v * rows) % 1;
    const dx = cu - 0.5;
    const dy = cv - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy);
    const dome = Math.max(0, 1 - r * 2.1);
    const circuli = 0.94 + 0.06 * Math.sin(r * 46);
    const rear = cv > 0.82 ? 1.12 : 1; // exposed rear edge catches light
    const l = (0.58 + dome * 0.34) * circuli * rear;
    return { l, b: Math.round(255 * (0.25 + dome * 0.65)) };
  },
  scale_reptile(u, v, n) {
    // Keeled plates: a bright ridge down each plate's centre,
    // dark grooves between plates, largest plates read broad.
    const cols = 10;
    const rows = 7;
    const cu = (u * cols) % 1;
    const cv = (v * rows) % 1;
    const keel = 1 - Math.min(1, Math.abs(cu - 0.5) * 2.4);
    const groove = (cu < 0.06 || cu > 0.94 || cv < 0.06 || cv > 0.94) ? 0.55 : 1;
    const mottle = fbm(u * 14, v * 14, n.seed);
    const l = (0.6 + keel * 0.3 + mottle * 0.12) * groove;
    return { l, b: Math.round(255 * (0.3 + keel * 0.55) * groove) };
  },
  skin(u, v, n) {
    // Pores (fine speckle) + furrows (low-frequency bands) +
    // large directional folds.
    const pore = hash2(Math.floor(u * 128), Math.floor(v * 128), n.seed);
    const poreDark = pore > 0.93 ? 0.72 : 1;
    const fold = 0.5 + 0.5 * Math.sin((u * 3 + v * 9) * 6
      + fbm(u * 4, v * 4, n.seed) * 5);
    const mottle = fbm(u * 10, v * 10, n.seed);
    const l = (0.66 + fold * 0.14 + mottle * 0.14) * poreDark;
    return { l, b: Math.round(255 * (0.4 + fold * 0.3 + (pore > 0.93 ? 0.2 : 0))) };
  },
  chitin(u, v, n) {
    // Sclerite plates with recessed arthrodial membranes (dark
    // grooves, 1-5% of segment width) between them.
    const cols = 6;
    const rows = 5;
    const cu = (u * cols) % 1;
    const cv = (v * rows) % 1;
    const groove = (cu < 0.04 || cu > 0.96 || cv < 0.04 || cv > 0.96) ? 0.5 : 1;
    const sheen = fbm(u * 8, v * 8, n.seed);
    const l = (0.68 + sheen * 0.22) * groove;
    return { l, b: Math.round(255 * (0.45 + sheen * 0.3) * groove) };
  },
  shell(u, v, n) {
    // Concentric growth lines from a corner (the apex) + banding.
    const d = Math.sqrt(u * u + v * v);
    const rings = 0.5 + 0.5 * Math.sin(d * 130);
    const band = 0.5 + 0.5 * Math.sin(d * 34 + fbm(u * 6, v * 6, n.seed) * 4);
    const l = 0.66 + rings * 0.14 + band * 0.14;
    return { l, b: Math.round(255 * (0.4 + rings * 0.45)) };
  },
  bark(u, v, n) {
    // Rhytidome furrows run vertically; lenticels are short
    // horizontal dashes; ridge tops weathered, fissures dark.
    const furrow = fbm(u * 26, v * 3, n.seed);
    const fissure = furrow < 0.38 ? 0.55 : 1;
    const dash = hash2(Math.floor(u * 40), Math.floor(v * 90), n.seed);
    const lenticel = (dash > 0.965 && Math.abs(((v * 90) % 1) - 0.5) < 0.16) ? 0.8 : 1;
    const l = (0.6 + furrow * 0.3) * fissure * lenticel;
    return { l, b: Math.round(255 * (0.25 + furrow * 0.6)) };
  },
  leaf(u, v, n) {
    // Midrib + diagonal side veins + mottling.
    const midrib = Math.abs(u - 0.5) < 0.012 ? 1.18 : 1;
    const vein = 0.5 + 0.5 * Math.sin((u * 2 + v) * 46);
    const veinLine = vein > 0.93 ? 1.1 : 1;
    const mottle = fbm(u * 12, v * 12, n.seed);
    const l = (0.66 + mottle * 0.2) * midrib * veinLine;
    return { l, b: Math.round(255 * (0.4 + mottle * 0.3)) };
  },
  slime(u, v, n) {
    // Wet gloss: almost flat, bright speckle where light catches.
    const wet = hash2(Math.floor(u * 64), Math.floor(v * 64), n.seed);
    const l = 0.86 + (wet > 0.9 ? 0.12 : 0) + fbm(u * 6, v * 6, n.seed) * 0.06;
    return { l, b: Math.round(255 * 0.42) };
  },
  membrane(u, v, n) {
    // Fine branching veins on a near-flat sheet.
    const vein = 0.5 + 0.5 * Math.sin((u * 5 + v * 11) * 30
      + fbm(u * 5, v * 5, n.seed) * 6);
    const l = 0.78 + (vein > 0.9 ? 0.12 : 0) + fbm(u * 8, v * 8, n.seed) * 0.06;
    return { l, b: Math.round(255 * 0.4) };
  },
  keratin(u, v, n) {
    // Fine longitudinal lines (beak / horn / claw growth lines).
    const line = 0.5 + 0.5 * Math.sin(u * 260 + fbm(u * 8, v * 8, n.seed) * 3);
    const l = 0.72 + line * 0.16;
    return { l, b: Math.round(255 * (0.42 + line * 0.2)) };
  },
  sponge(u, v, n) {
    // Porous pits: random dark holes on a rough body.
    const pit = hash2(Math.floor(u * 46), Math.floor(v * 46), n.seed);
    const l = pit > 0.82 ? 0.5 : 0.72 + fbm(u * 10, v * 10, n.seed) * 0.16;
    return { l, b: Math.round(255 * (pit > 0.82 ? 0.12 : 0.55)) };
  },
  fungal(u, v, n) {
    // Cap blotches + fine radial gill lines from the centre.
    const blotch = fbm(u * 9, v * 9, n.seed);
    const a = Math.atan2(v - 0.5, u - 0.5);
    const gill = 0.5 + 0.5 * Math.sin(a * 48);
    const l = 0.64 + blotch * 0.22 + (gill > 0.94 ? 0.06 : 0);
    return { l, b: Math.round(255 * (0.4 + blotch * 0.35)) };
  },
  cuticle(u, v, n) {
    // Fine transverse rings (segmented worms, many larvae).
    const ring = 0.5 + 0.5 * Math.sin(v * 190);
    const l = 0.68 + ring * 0.18 + fbm(u * 8, v * 8, n.seed) * 0.08;
    return { l, b: Math.round(255 * (0.4 + ring * 0.4)) };
  },
  thallus(u, v, n) {
    // Crusty blotches (lichen): large irregular two-tone patches.
    const patch = fbm(u * 5, v * 5, n.seed);
    const edge = patch > 0.52 && patch < 0.58 ? 0.7 : 1;
    const l = (0.62 + patch * 0.26) * edge;
    return { l, b: Math.round(255 * (0.35 + patch * 0.45)) };
  },
};

// ── texture + material caches ──────────────────────────────────────

const textureCache = new Map(); // `${family}|${seed}` -> { map, bumpMap, roughness, bumpScale }
const materialCache = new Map(); // `${family}|${seed}|${colorHex}` -> material
let textureBytes = 0;

export function textureStats() {
  return {
    textures: textureCache.size,
    materials: materialCache.size,
    // 128x128 RGBA colour + 128x128 single-channel bump, per pair.
    bytes: textureBytes,
  };
}

/**
 * Colour + bump maps for one surface family, seeded so the pattern
 * is stable per class. Unknown families fall back to skin.
 */
export function surfaceMaps(family, seed) {
  const fam = FAMILY_STYLE[family] ? family : 'skin';
  const key = `${fam}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[fam];
  const seedInt = hashString(`${fam}:${seed}`);
  const W = TEXTURE_SIZE;
  const H = TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const { l, b } = gen(u, v, n);
      const s = shade(l);
      const i = (y * W + x) * 4;
      color[i] = s;
      color[i + 1] = s;
      color[i + 2] = s;
      color[i + 3] = 255;
      bump[y * W + x] = Math.max(0, Math.min(255, b));
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
  const style = FAMILY_STYLE[fam];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A shared MeshStandardMaterial for one (family, class-seed, base
 * colour): the pattern maps are shared per family+seed, the colour
 * is the builder's class-seeded HSL. Materials are shared across
 * creatures — never disposed per creature.
 */
export function materialForSurface(family, seed, baseColor) {
  const fam = FAMILY_STYLE[family] ? family : 'skin';
  const hex = baseColor instanceof THREE.Color
    ? `#${baseColor.getHexString()}`
    : String(baseColor);
  const key = `${fam}|${seed}|${hex}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = surfaceMaps(fam, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    color: baseColor instanceof THREE.Color
      ? baseColor.clone()
      : new THREE.Color(baseColor),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}
