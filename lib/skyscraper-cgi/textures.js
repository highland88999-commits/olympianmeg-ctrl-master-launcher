/**
 * lib/skyscraper-cgi/textures.js — procedural Skyscraper textures (Merlin, Nov 15, 2026).
 *
 * The tower was flat where it mattered: a #050508 city floor, flat
 * blue road planes, flat #111 plot slabs, tower flanks with no face
 * at all (only the front wore its video), glow-cylinder neighbours
 * and a wireframe tree. This module wraps the vertical city in
 * texture — the same idiom as the planet-CGI kit
 * (lib/planet-cgi/textures.js) and the Mars 2 hardware kit
 * (lib/mars2/textures.js): seeded PRNG + value noise painting
 * colour + bump + emissive maps as THREE.DataTextures, cached per
 * kind+seed, deterministic so every phone paints the same tower.
 * Procedural only — no bought assets, no model downloads.
 *
 * What each kind reads as:
 * - towerFacade: dark glass curtain wall — steel mullions, glass
 *   bays, and LIT WINDOWS (warm and cool, seeded per bay) so the
 *   tower reads inhabited at night. Tileable: one bay is 6 windows
 *   wide x 8 floors tall.
 * - cityGround: the city far below as one tileable 100 m block —
 *   dark asphalt streets on the tile edges with a glowing centre
 *   line, rooftops inside with tiny rooftop lights. Repeat 40x40
 *   over the 4000 m floor.
 * - road: the road strip — asphalt, pale edge lines, a dashed
 *   glowing cyan centre line (10 dashes per tile, tile = 40 m).
 * - plaza: the plot slabs — dark paving, panel seams, a faint
 *   cyan seam glow.
 * - cityView: the view OUT of a tower window — the night city far
 *   below, street grid receding to a warm horizon haze. A vista,
 *   not a tile; it hangs on the interior walls of floors 1-3 so
 *   the height can be felt from inside.
 * - canopy / bark: the Outland Forest signpost tree — real leaf
 *   clusters and streaked bark instead of wireframe.
 *
 * Maps are 256x256 like the planet kit. The tint multiplies the
 * map (white by default — the maps carry their own hues). The
 * emissive map is painted wherever a kind has light of its own
 * (windows, street lines, city glow); kinds without light carry
 * none and stay unlit.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';

export const SKYSCRAPER_TEXTURE_SIZE = 256;

// Roughness + bump strength per kind. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const SKYSCRAPER_TEXTURE_KINDS = {
  towerFacade: { roughness: 0.35, bumpScale: 0.04, metalness: 0.55 },
  cityGround: { roughness: 0.9, bumpScale: 0.05, metalness: 0.1 },
  road: { roughness: 0.85, bumpScale: 0.03, metalness: 0.1 },
  plaza: { roughness: 0.9, bumpScale: 0.05, metalness: 0.15 },
  cityView: { roughness: 0.8, bumpScale: 0.02, metalness: 0.05 },
  canopy: { roughness: 0.95, bumpScale: 0.08, metalness: 0.0 },
  bark: { roughness: 1.0, bumpScale: 0.09, metalness: 0.0 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// ── tower facade window table ────────────────────────────────────
// One bay = 6 windows wide x 8 floors. The table is the single
// source of truth: the painter reads it, and the test suite pins
// the lit fraction through it — no pixel-counting needed.
export const FACADE_COLS = 6;
export const FACADE_ROWS = 8;
export const FACADE_LIT_FRACTION = 0.55;

export function facadeWindowTable(seed) {
  const rnd = mulberry32(hashString(`skyscraper:facade:${seed}`));
  const table = [];
  for (let r = 0; r < FACADE_ROWS; r++) {
    for (let c = 0; c < FACADE_COLS; c++) {
      const lit = rnd() < FACADE_LIT_FRACTION;
      // Warm tungsten most rooms, cool white the rest.
      const warm = rnd() < 0.7;
      table.push({ row: r, col: c, lit, warm });
    }
  }
  return table;
}

export function facadeLitFraction(seed) {
  const table = facadeWindowTable(seed);
  const lit = table.filter((w) => w.lit).length;
  return lit / table.length;
}

// ── per-kind generators ──────────────────────────────────────────
// Each returns { r, g, b, eR, eG, eB, bump } for one pixel.
// u, v in [0,1); n.seed is this texture's seed int; n.extra holds
// per-kind precomputed tables (facade windows, rooftop lights).

const GENERATORS = {
  towerFacade(u, v, n) {
    const col = Math.min(FACADE_COLS - 1, Math.floor(u * FACADE_COLS));
    const row = Math.min(FACADE_ROWS - 1, Math.floor(v * FACADE_ROWS));
    const fx = (u * FACADE_COLS - col);
    const fy = (v * FACADE_ROWS - row);
    const win = n.facade[row * FACADE_COLS + col];
    const grain = valueNoise(u * 180, v * 180, n.seed);
    // Mullion frame around every bay.
    const mullion = fx < 0.07 || fx > 0.93 || fy < 0.07 || fy > 0.93;
    if (mullion) {
      const l = 34 + (grain - 0.5) * 12;
      return { r: l, g: l + 4, b: l + 10, eR: 0, eG: 0, eB: 0, bump: 205 };
    }
    // Window glass: inside the pane, recessed from the mullions.
    const inPane = fx > 0.16 && fx < 0.84 && fy > 0.22 && fy < 0.78;
    if (!inPane) {
      // Spandrel — the dark band between pane and frame.
      const l = 20 + (grain - 0.5) * 8;
      return { r: l, g: l + 3, b: l + 8, eR: 0, eG: 0, eB: 0, bump: 118 };
    }
    if (win.lit) {
      if (win.warm) {
        const flick = 0.85 + grain * 0.3;
        return {
          r: clamp255(255 * flick), g: clamp255(196 * flick), b: clamp255(120 * flick),
          eR: 235, eG: 178, eB: 105, bump: 88,
        };
      }
      const flick = 0.85 + grain * 0.3;
      return {
        r: clamp255(168 * flick), g: clamp255(214 * flick), b: clamp255(250 * flick),
        eR: 150, eG: 200, eB: 245, bump: 88,
      };
    }
    // Dark glass at night: near-black blue with a faint sky sheen.
    const sheen = 14 + (grain - 0.5) * 10 + (1 - v) * 8;
    return {
      r: clamp255(sheen), g: clamp255(sheen + 5), b: clamp255(sheen + 14),
      eR: 0, eG: 0, eB: 0, bump: 92,
    };
  },

  cityGround(u, v, n) {
    // Streets run on the tile edges (the tile is one 100 m block);
    // rooftops fill the middle. Tileable: the bands are pure u/v.
    const d = Math.min(u, 1 - u, v, 1 - v);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    if (d < 0.06) {
      // Street asphalt, centre line glowing cyan.
      const line = Math.abs(d - 0.03) < 0.005;
      if (line) {
        return { r: 30, g: 180, b: 210, eR: 0, eG: 170, eB: 205, bump: 165 };
      }
      const l = 20 + (grain - 0.5) * 12;
      return { r: l, g: l + 2, b: l + 6, eR: 0, eG: 0, eB: 0, bump: 100 };
    }
    // Rooftops: 3x3 sub-blocks, grey slabs with rooftop lights.
    const su = Math.floor(u * 3);
    const sv = Math.floor(v * 3);
    const block = (su * 3 + sv) % 9;
    const dot = n.roofDots[block];
    const lx = (u * 3 - su - dot.dx) * 40;
    const ly = (v * 3 - sv - dot.dy) * 40;
    const isDot = (lx * lx + ly * ly) < 0.09;
    if (isDot) {
      return { r: 255, g: 200, b: 130, eR: 220, eG: 165, eB: 95, bump: 160 };
    }
    const l = 46 + (grain - 0.5) * 18 + (block % 3) * 5;
    return { r: l, g: l + 2, b: l + 6, eR: 0, eG: 0, eB: 0, bump: 150 };
  },

  road(u, v, n) {
    // u runs along the road, v across it. 10 dashes per tile;
    // the tile repeats 100x over the 4000 m road, so a dash reads
    // ~2.2 m on the ground.
    const grain = valueNoise(u * 200, v * 60, n.seed);
    const patch = fbm(u * 5, v * 3, n.seed);
    // Pale edge lines.
    if (v < 0.03 || v > 0.97) {
      return { r: 168, g: 176, b: 186, eR: 26, eG: 26, eB: 26, bump: 150 };
    }
    // Dashed glowing centre line.
    if (v > 0.47 && v < 0.53 && ((u * 10) % 1) < 0.55) {
      return { r: 20, g: 200, b: 235, eR: 0, eG: 185, eB: 220, bump: 170 };
    }
    const l = 16 + (grain - 0.5) * 10 + (patch - 0.5) * 12;
    return { r: clamp255(l), g: clamp255(l + 2), b: clamp255(l + 6), eR: 0, eG: 0, eB: 0, bump: 108 };
  },

  plaza(u, v, n) {
    // 4x4 dark paving slabs, faint cyan seam glow.
    const seamU = Math.abs(((u * 4) % 1) - 0.5);
    const seamV = Math.abs(((v * 4) % 1) - 0.5);
    const seam = seamU > 0.5 - 0.02 || seamV > 0.5 - 0.02;
    const grain = valueNoise(u * 180, v * 180, n.seed);
    if (seam) {
      return { r: 12, g: 40, b: 46, eR: 0, eG: 52, eB: 60, bump: 88 };
    }
    const l = 24 + (grain - 0.5) * 12;
    return { r: l, g: l + 2, b: l + 5, eR: 0, eG: 0, eB: 0, bump: 130 };
  },

  cityView(u, v, n) {
    // The night city from a tower window: the street grid
    // recedes toward a warm horizon haze at the top (v -> 1).
    // Not a tile — one vista per window.
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const haze = Math.max(0, (v - 0.86) / 0.14);
    // Horizontal streets, closer together toward the horizon.
    const rowF = v * v * 14;
    const rowLine = Math.abs((rowF % 1) - 0.5) > 0.47;
    // Vertical streets fan slightly toward the centre with height.
    const spread = 1 - v * 0.45;
    const colF = ((u - 0.5) / spread + 0.5) * 9;
    const colLine = Math.abs((colF % 1) - 0.5) > 0.46;
    if (rowLine || colLine) {
      const glow = 0.75 + grain * 0.4;
      return {
        r: clamp255(70 * glow), g: clamp255(150 * glow), b: clamp255(215 * glow),
        eR: 60, eG: 140, eB: 200, bump: 140,
      };
    }
    // Warm window lights speckle the blocks, denser near below.
    const dot = valueNoise(u * 90, v * 90, n.seed + 5);
    if (dot > 0.93) {
      return { r: 255, g: 190, b: 110, eR: 210, eG: 150, eB: 70, bump: 128 };
    }
    const l = 8 + (grain - 0.5) * 8 + haze * 60;
    return {
      r: clamp255(l + haze * 120), g: clamp255(l + 2 + haze * 60), b: clamp255(l + 8),
      eR: Math.round(haze * 90), eG: Math.round(haze * 45), eB: Math.round(haze * 10),
      bump: 118,
    };
  },

  canopy(u, v, n) {
    // Leaf clusters: fbm green with darker shadow blobs and
    // pale leaf speckle.
    const clump = fbm(u * 6, v * 6, n.seed);
    const speckle = valueNoise(u * 200, v * 200, n.seed);
    const shadow = fbm(u * 3 + 11, v * 3 + 7, n.seed) < 0.38;
    let r = 34 + (clump - 0.5) * 44 + (speckle - 0.5) * 22;
    let g = 96 + (clump - 0.5) * 60 + (speckle - 0.5) * 26;
    let b = 42 + (clump - 0.5) * 36 + (speckle - 0.5) * 18;
    if (shadow) { r *= 0.55; g *= 0.55; b *= 0.55; }
    const bump = 128 + (clump - 0.5) * 90 + (speckle - 0.5) * 40;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), eR: 0, eG: 0, eB: 0, bump: clamp255(bump) };
  },

  bark(u, v, n) {
    // Vertical bark streaks.
    const streak = valueNoise(u * 46, v * 5, n.seed);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let l = 62 + (streak - 0.5) * 52 + (grain - 0.5) * 16;
    const bump = 128 + (streak - 0.5) * 110;
    return { r: clamp255(l * 1.15), g: clamp255(l * 0.85), b: clamp255(l * 0.6), eR: 0, eG: 0, eB: 0, bump: clamp255(bump) };
  },
};

// Kinds whose maps carry light of their own.
export const SKYSCRAPER_EMISSIVE_KINDS = ['towerFacade', 'cityGround', 'road', 'plaza', 'cityView'];

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, emissiveMap, roughness, bumpScale, metalness }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}|${repeat}|${side}|${ei}` -> material
let textureBytes = 0;

export function skyscraperTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump (+ emissive, where the kind has light) maps for
 * one Skyscraper kind, seeded so the pattern is stable per world.
 * Unknown kinds fall back to plaza. The repeat is part of the
 * cache key: a repeat lives on the shared texture, so two repeats
 * of the same kind+seed must not share one texture or the second
 * caller would silently re-tile the first.
 */
export function skyscraperMaps(kind, seed, repeat) {
  const k = SKYSCRAPER_TEXTURE_KINDS[kind] ? kind : 'plaza';
  const rx = repeat ? (repeat.x || 1) : 1;
  const ry = repeat ? (repeat.y || 1) : 1;
  const key = `${k}|${seed}|${rx}x${ry}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`skyscraper:${k}:${seed}`);
  const W = SKYSCRAPER_TEXTURE_SIZE;
  const H = SKYSCRAPER_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const emissive = new Uint8Array(W * H * 4);
  const n = { seed: seedInt };
  if (k === 'towerFacade') n.facade = facadeWindowTable(seed);
  if (k === 'cityGround') {
    const rnd = mulberry32(seedInt + 77);
    n.roofDots = Array.from({ length: 9 }, () => ({ dx: 0.25 + rnd() * 0.5, dy: 0.25 + rnd() * 0.5 }));
  }
  let hasEmissive = false;
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
      emissive[i] = px.eR || 0;
      emissive[i + 1] = px.eG || 0;
      emissive[i + 2] = px.eB || 0;
      emissive[i + 3] = 255;
      if (px.eR || px.eG || px.eB) hasEmissive = true;
    }
  }
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(rx, ry);
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(rx, ry);
  let emissiveMap = null;
  if (hasEmissive) {
    emissiveMap = new THREE.DataTexture(emissive, W, H, THREE.RGBAFormat);
    emissiveMap.needsUpdate = true;
    emissiveMap.wrapS = THREE.RepeatWrapping;
    emissiveMap.wrapT = THREE.RepeatWrapping;
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.repeat.set(rx, ry);
  }
  const style = SKYSCRAPER_TEXTURE_KINDS[k];
  const out = {
    map, bumpMap, emissiveMap,
    roughness: style.roughness, bumpScale: style.bumpScale, metalness: style.metalness,
  };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H + (hasEmissive ? W * H * 4 : 0);
  return out;
}

/**
 * A shared MeshStandardMaterial for one (kind, seed, tint, repeat,
 * side, emissiveIntensity): the pattern maps are shared per
 * kind+seed, the tint multiplies the map (white by default — the
 * maps carry their own hues). `opts.emissive` tints the emissive
 * light (white by default); kinds without an emissive map stay
 * unlit whatever is passed. `opts.transparent` / `opts.opacity` /
 * `opts.depthWrite` pass through for the road strips. Shared
 * materials are never disposed by callers.
 */
export function materialForSkyscraper(kind, seed, tint = '#ffffff', opts = {}) {
  const k = SKYSCRAPER_TEXTURE_KINDS[kind] ? kind : 'plaza';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const rep = opts.repeat ? `${opts.repeat.x || 1}x${opts.repeat.y || 1}` : '1x1';
  const side = opts.side || THREE.FrontSide;
  const ei = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1;
  const emHex = opts.emissive
    ? (opts.emissive instanceof THREE.Color ? `#${opts.emissive.getHexString()}` : String(opts.emissive))
    : '#ffffff';
  const key = `${k}|${seed}|${hex}|${rep}|${side === THREE.DoubleSide ? 'double' : 'front'}|${ei}|${emHex}|${opts.transparent ? 't' : 'o'}${opts.opacity !== undefined ? opts.opacity : ''}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = skyscraperMaps(k, seed, opts.repeat);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: maps.metalness,
    side,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  if (maps.emissiveMap) {
    m.emissiveMap = maps.emissiveMap;
    m.emissive = opts.emissive instanceof THREE.Color
      ? opts.emissive.clone()
      : new THREE.Color(opts.emissive || '#ffffff');
    m.emissiveIntensity = ei;
  }
  if (opts.transparent) m.transparent = true;
  if (opts.opacity !== undefined) m.opacity = opts.opacity;
  if (opts.depthWrite !== undefined) m.depthWrite = opts.depthWrite;
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}
