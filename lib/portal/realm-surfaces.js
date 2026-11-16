/**
 * lib/portal/realm-surfaces.js
 *
 * ENVIRONMENT WRAPPING for the 13 hell realms (Merlin, 2026-11-15):
 * the walls, floor, ceiling and objects of every hell realm wear
 * textures — and those textures are LIGHT SOURCES (emissive-first).
 * One shared module, every realm — no one-off texture code per world.
 *
 * Pattern follows the Star Wars ground painter (app/star-wars/cgi.js)
 * and lib/planet-cgi/textures.js: seeded colour + bump DataTextures
 * (256x256, cached per realm+kind, node-safe — no DOM canvas), so
 * every phone paints the same floor. The old per-file canvas
 * groundTexture() functions were unseeded Math.random — a different
 * floor on every load. These replace them.
 *
 * Two textures per realm, both painted from the realm's own hue in
 * lib/portal/realms.js (never invented here):
 *   floor — dark ground with glowing veins in the realm hue;
 *   stone — grey stone, faintly tinted by the hue, with grain +
 *     cracks. The existing material colours stay and multiply the
 *     map (tint, not replace).
 *
 * EMISSIVE-FIRST: floorSurface() / stoneSurface() return props to
 * spread onto a <meshStandardMaterial>: the same texture as map AND
 * emissiveMap, emissive in the realm hue. The rooms glow from their
 * own walls and floors. ZERO new real lights are added anywhere —
 * the light budget is asserted by tests/realm-surfaces.test.mjs.
 *
 * CEILING: the sky dome lives in components/RealmSkyDome.jsx (JSX
 * cannot live in this node-tested module). It wears the generated
 * sky image at public/art/realms/<slug>-sky.jpg — one per realm,
 * slug 'nether-realm' for Hades, the realm key everywhere else.
 * The dome is the ceiling texture; DayNightRig still drives light
 * and fog. Known trade: the dome hides the rig's background-colour
 * cycle (the sky image is static — it does not dim at night) and
 * the rig's fog is switched off on the dome itself (fog={false}),
 * or the sky would wash out to fog colour at 520 m.
 *
 * Pure module: no JSX, no document/window access at import time.
 */

import * as THREE from 'three';
import { hashString, valueNoise } from '../earth4/creature-textures.js';
import { PORTAL_REALMS } from './realms.js';

export const REALM_SURFACE_SIZE = 256;

/** The 13 hell realms, by PORTAL_REALMS key (Hades' key is 'hades'). */
export const REALM_SURFACE_KEYS = [
  'hades',
  'helheim',
  'duat',
  'hell',
  'naraka',
  'yomi',
  'annwn',
  'mictlan',
  'xibalba',
  'kur',
  'nav',
  'diyu',
  'orun',
];

/** Sky-art slug per realm key: Hades lives at /nether-realm.
 * Land of the Dead is sky-only here (Nov 16, 2026): its sphere
 * scene does not consume floorSurface/RealmSkyDome, so it stays
 * OUT of REALM_SURFACE_KEYS — the floor part is routed around,
 * deliberately. The slug entry exists so skyUrlForRealm stops
 * throwing for this realm and the sky art has a home. */
export const REALM_SKY_SLUGS = {
  hades: 'nether-realm',
  helheim: 'helheim',
  duat: 'duat',
  hell: 'hell',
  naraka: 'naraka',
  yomi: 'yomi',
  annwn: 'annwn',
  mictlan: 'mictlan',
  xibalba: 'xibalba',
  kur: 'kur',
  nav: 'nav',
  diyu: 'diyu',
  orun: 'orun',
  'land-of-the-dead': 'land-of-the-dead',
};

export const REALM_SKY_BASE = '/art/realms';

/** Public URL of a realm's generated sky image. */
export function skyUrlForRealm(realmKey) {
  const slug = REALM_SKY_SLUGS[realmKey];
  if (!slug) throw new Error(`realm-surfaces: unknown realm key "${realmKey}"`);
  return `${REALM_SKY_BASE}/${slug}-sky.jpg`;
}

/** Repo-relative paths of the 13 expected sky files (for tests). */
export const REALM_SKY_FILES = REALM_SURFACE_KEYS.map(
  (k) => `public/art/realms/${REALM_SKY_SLUGS[k]}-sky.jpg`,
);

/** A realm's hue, straight from lib/portal/realms.js — never invented. */
export function hueForRealm(realmKey) {
  const realm = PORTAL_REALMS.find((r) => r.key === realmKey);
  return realm ? realm.hue : null;
}

// ── colour helpers ────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

// ── per-kind generators ───────────────────────────────────────────────
// Each returns { r, g, b, bump } for one pixel. u, v in [0,1).
// n.seed is this texture's seed int; n.hue is the realm hue as [r,g,b].

const GENERATORS = {
  floor(u, v, n) {
    // Dark ground: near-black base faintly warmed by the hue, large
    // soft blotches, fine speckle, and glowing veins — thin bright
    // lines where the fbm field crosses its middle, in the hue.
    // The veins are the bright part, so they are also what glows
    // when this map is used as the emissiveMap.
    const mottle = fbm(u * 5, v * 5, n.seed);
    const detail = fbm(u * 16 + 9, v * 16 + 4, n.seed);
    const speckle = valueNoise(u * 220, v * 220, n.seed);
    const veinField = fbm(u * 3 + 31, v * 3 + 17, n.seed);
    const vein = Math.max(0, 1 - Math.abs(veinField - 0.5) * 22);
    const ember = valueNoise(u * 90 + 50, v * 90, n.seed) > 0.93 ? 1 : 0;
    const base = mixRgb([11, 10, 13], n.hue, 0.16 + mottle * 0.1);
    const lift = (mottle - 0.5) * 26 + (detail - 0.5) * 18 + (speckle - 0.5) * 22;
    let r = base[0] + lift + vein * n.hue[0] * 0.55 + ember * n.hue[0] * 0.5;
    let g = base[1] + lift + vein * n.hue[1] * 0.55 + ember * n.hue[1] * 0.5;
    let b = base[2] + lift + vein * n.hue[2] * 0.55 + ember * n.hue[2] * 0.5;
    const bump = 128 + (mottle - 0.5) * 60 + (speckle - 0.5) * 44 + vein * 30;
    return {
      r: clamp255(r),
      g: clamp255(g),
      b: clamp255(b),
      bump: clamp255(bump),
    };
  },

  stone(u, v, n) {
    // Cut stone: mid-grey faintly tinted by the hue, large soft
    // tonal blocks, fine grain, and darker crack lines where the
    // fbm field crosses its middle. No bright veins — stone glows
    // evenly and dimly, the floor carries the bright lines.
    const block = fbm(u * 4, v * 4, n.seed);
    const detail = fbm(u * 13 + 5, v * 13 + 11, n.seed);
    const grain = valueNoise(u * 180, v * 180, n.seed);
    const crackField = fbm(u * 6 + 41, v * 6 + 23, n.seed);
    const crack = Math.max(0, 1 - Math.abs(crackField - 0.5) * 30);
    const base = mixRgb([106, 106, 114], n.hue, 0.12);
    const lift = (block - 0.5) * 34 + (detail - 0.5) * 20 + (grain - 0.5) * 26 - crack * 42;
    const bump = 128 + (block - 0.5) * 50 + (grain - 0.5) * 40 - crack * 70;
    return {
      r: clamp255(base[0] + lift),
      g: clamp255(base[1] + lift),
      b: clamp255(base[2] + lift),
      bump: clamp255(bump),
    };
  },
};

// ── caches ────────────────────────────────────────────────────────────
// Base textures are cached per (kind, realmKey); each call clones
// them so every surface can carry its own repeat without fighting
// the others (a clone shares the pixel buffer — cheap).

const baseCache = new Map(); // `${kind}|${realmKey}` -> { map, bumpMap }
let textureBytes = 0;

export function realmSurfaceStats() {
  return { textures: baseCache.size, bytes: textureBytes };
}

function paintBase(kind, realmKey) {
  const key = `${kind}|${realmKey}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const hue = hueForRealm(realmKey);
  if (!hue) throw new Error(`realm-surfaces: unknown realm key "${realmKey}"`);
  const gen = GENERATORS[kind];
  const seedInt = hashString(`realm-surface:${kind}:${realmKey}`);
  const W = REALM_SURFACE_SIZE;
  const H = REALM_SURFACE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt, hue: hexToRgb(hue) };
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
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const out = { map, bumpMap };
  baseCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * One surface's maps, cloned from the cached base so the caller
 * owns the repeat. `repeat` is tiles per face: ground discs use 6,
 * region discs 2, stone 1 (the texture is fbm noise + grain, so
 * one tile reads as stone at any size without visible stretching).
 */
export function surfaceMaps(kind, realmKey, repeat = 1) {
  if (!GENERATORS[kind]) throw new Error(`realm-surfaces: unknown kind "${kind}"`);
  const base = paintBase(kind, realmKey);
  const map = base.map.clone();
  map.repeat.set(repeat, repeat);
  map.needsUpdate = true;
  const bumpMap = base.bumpMap.clone();
  bumpMap.repeat.set(repeat, repeat);
  bumpMap.needsUpdate = true;
  return { map, bumpMap };
}

// ── material props (spread onto <meshStandardMaterial>) ───────────────
// The same texture is map AND emissiveMap, so the glow follows the
// painted pattern (bright veins glow, dark rock does not). The
// existing material colour multiplies the map, as before — the
// spread goes FIRST in JSX, colour/roughness after it.

export const FLOOR_EMISSIVE_INTENSITY = 0.5;
export const STONE_EMISSIVE_INTENSITY = 0.3;

export function floorSurface(realmKey, repeat = 2) {
  const hue = hueForRealm(realmKey);
  if (!hue) throw new Error(`realm-surfaces: unknown realm key "${realmKey}"`);
  const { map, bumpMap } = surfaceMaps('floor', realmKey, repeat);
  return {
    map,
    emissiveMap: map,
    emissive: hue,
    emissiveIntensity: FLOOR_EMISSIVE_INTENSITY,
    bumpMap,
    bumpScale: 0.05,
  };
}

export function stoneSurface(realmKey, repeat = 1) {
  const hue = hueForRealm(realmKey);
  if (!hue) throw new Error(`realm-surfaces: unknown realm key "${realmKey}"`);
  const { map, bumpMap } = surfaceMaps('stone', realmKey, repeat);
  return {
    map,
    emissiveMap: map,
    emissive: hue,
    emissiveIntensity: STONE_EMISSIVE_INTENSITY,
    bumpMap,
    bumpScale: 0.04,
  };
}
