/**
 * lib/gta/city-cgi.js — procedural CGI layer for the GTA cities
 * (Mega City first, shared with Babel — Merlin, Nov 15, 2026).
 *
 * What Mega City was before this: flat grey instanced boxes (the
 * city.js header promised "emissive windows at night" but the code
 * never painted them — the `windows` / `rooftop` flags on every
 * building were written and never read), a flat asphalt ground
 * texture, a flat colour-lerp sky, pole-only streetlights, box
 * cars with no wheels or lights, no moving traffic, no pedestrians
 * at all, and a Harbor district whose `water: true` flag produced
 * no water — just bare asphalt where the harbour should be.
 *
 * What lives here, in the house CGI idiom (lib/planet-cgi,
 * lib/mars2, app/star-wars/cgi.js): seeded colour + bump +
 * emissive DataTextures (256x256, cached per kind+seed, node-safe,
 * no canvas, no network), a gradient sky dome with sun / moon /
 * stars / drifting clouds, city rain on the real clock, and
 * operators — traffic and pedestrians as pure functions of
 * (place, kind, device clock), never fake counts, never stored
 * state. No new real lights anywhere: glow is emissive only.
 *
 * Mechanics are untouched: this module builds looks, never rules.
 * No wanted / mission / economy / physics numbers live here.
 */

import * as THREE from 'three';
import { hashString, mulberry32, valueNoise } from '../earth4/creature-textures.js';
import { getParticleTexture } from '../particles/sprites.js';
import { PLANET_CGI_EPOCH_MS, spinAngle } from '../planet-cgi/motion.js';

export const CITY_CGI_EPOCH_MS = PLANET_CGI_EPOCH_MS;
export const CITY_SIZE = 600;

// ── Facades ─────────────────────────────────────────────────────
// One texture set per kind: colour + bump + emissive (lit windows).
// The emissive map is black except lit windows, so the caller's
// emissiveIntensity (driven by night) is the only switch — windows
// glow after dark and stay dark glass by day.

export const FACADE_KINDS = {
  glass: { base: [58, 74, 96], roughness: 0.35, metalness: 0.55, litWarm: 0.5, litCool: 0.12 },
  brick: { base: [122, 76, 58], roughness: 0.9, metalness: 0.05, litWarm: 0.38, litCool: 0.06 },
  slab: { base: [146, 144, 136], roughness: 0.85, metalness: 0.05, litWarm: 0.42, litCool: 0.08 },
  industrial: { base: [96, 100, 104], roughness: 0.8, metalness: 0.3, litWarm: 0.22, litCool: 0.04 },
};

export const FACADE_TEXTURE_SIZE = 256;
export const FACADE_COLS = 8;
export const FACADE_ROWS = 20;

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const facadeCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, emissiveMap, ... }
const facadeMaterialCache = new Map();

export function facadeTextureStats() {
  return { textures: facadeCache.size, materials: facadeMaterialCache.size };
}

/**
 * Colour + bump + emissive maps for one facade kind. Unknown kinds
 * fall back to slab. The window grid is painted once, in row-major
 * order, from a single seeded stream so colour, bump and emissive
 * agree exactly about which windows are lit.
 */
export function facadeMaps(kind, seed) {
  const k = FACADE_KINDS[kind] ? kind : 'slab';
  const key = `${k}|${seed}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const style = FACADE_KINDS[k];
  const seedInt = hashString(`gta:facade:${k}:${seed}`);
  const rnd = mulberry32(seedInt);
  const W = FACADE_TEXTURE_SIZE;
  const H = FACADE_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const emissive = new Uint8Array(W * H * 4);
  const cellW = W / FACADE_COLS;
  const cellH = H / FACADE_ROWS;
  // Per-window lit state, decided once so all three maps agree.
  const lit = [];
  for (let r = 0; r < FACADE_ROWS; r++) {
    for (let c = 0; c < FACADE_COLS; c++) {
      const roll = rnd();
      lit.push(roll < style.litWarm ? 'warm' : roll < style.litWarm + style.litCool ? 'cool' : null);
    }
  }
  for (let y = 0; y < H; y++) {
    const row = Math.min(FACADE_ROWS - 1, Math.floor(y / cellH));
    const wy0 = row * cellH + cellH * 0.22;
    const wy1 = row * cellH + cellH * 0.78;
    const inWinY = y >= wy0 && y < wy1;
    // Horizontal floor band between rows.
    const band = (y % cellH) < 1.5 ? 1 : 0;
    for (let x = 0; x < W; x++) {
      const col = Math.min(FACADE_COLS - 1, Math.floor(x / cellW));
      const wx0 = col * cellW + cellW * 0.18;
      const wx1 = col * cellW + cellW * 0.82;
      const inWin = inWinY && x >= wx0 && x < wx1;
      const grain = valueNoise(x * 0.9, y * 0.9, seedInt);
      const i = (y * W + x) * 4;
      if (inWin) {
        const state = lit[row * FACADE_COLS + col];
        if (state === 'warm') {
          color[i] = 232; color[i + 1] = 186; color[i + 2] = 110; color[i + 3] = 255;
          emissive[i] = 255; emissive[i + 1] = 190; emissive[i + 2] = 90; emissive[i + 3] = 255;
        } else if (state === 'cool') {
          color[i] = 168; color[i + 1] = 200; color[i + 2] = 238; color[i + 3] = 255;
          emissive[i] = 150; emissive[i + 1] = 200; emissive[i + 2] = 255; emissive[i + 3] = 255;
        } else {
          color[i] = 22; color[i + 1] = 26; color[i + 2] = 34; color[i + 3] = 255;
          emissive[i] = 0; emissive[i + 1] = 0; emissive[i + 2] = 0; emissive[i + 3] = 255;
        }
        bump[y * W + x] = 96;
      } else {
        const shade = 0.88 + (grain - 0.5) * 0.24 - band * 0.18;
        color[i] = clamp255(style.base[0] * shade);
        color[i + 1] = clamp255(style.base[1] * shade);
        color[i + 2] = clamp255(style.base[2] * shade);
        color[i + 3] = 255;
        emissive[i] = 0; emissive[i + 1] = 0; emissive[i + 2] = 0; emissive[i + 3] = 255;
        bump[y * W + x] = clamp255(128 + (grain - 0.5) * 30 - band * 40);
      }
    }
  }
  const mk = (arr, format) => {
    const tex = new THREE.DataTexture(arr, W, H, format);
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const map = mk(color, THREE.RGBAFormat);
  const emissiveMap = mk(emissive, THREE.RGBAFormat);
  const bumpMap = new THREE.DataTexture(bump, W, H, THREE.RedFormat);
  bumpMap.needsUpdate = true;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  const out = {
    map, bumpMap, emissiveMap,
    roughness: style.roughness, metalness: style.metalness, bumpScale: 0.04,
    litCount: lit.filter(Boolean).length,
    windowCount: lit.length,
  };
  facadeCache.set(key, out);
  return out;
}

/**
 * Shared MeshStandardMaterial for one (kind, seed, tint). The
 * emissive is white x emissiveMap, intensity 0 by default — the
 * scene drives it with the night factor. Shared materials are
 * never disposed by callers.
 */
export function materialForFacade(kind, seed, tint = '#ffffff') {
  const k = FACADE_KINDS[kind] ? kind : 'slab';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const key = `${k}|${seed}|${hex}`;
  if (facadeMaterialCache.has(key)) return facadeMaterialCache.get(key);
  const maps = facadeMaps(k, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    emissiveMap: maps.emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    roughness: maps.roughness,
    metalness: maps.metalness,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  m.userData.isFacade = true;
  facadeMaterialCache.set(key, m);
  return m;
}

/** District id -> facade kind. Unknown districts read as slab. */
export function facadeKindForDistrict(districtId) {
  if (districtId === 'downtown' || districtId === 'spire') return 'glass';
  if (districtId === 'harbor') return 'brick';
  if (districtId === 'industrial') return 'industrial';
  return 'slab';
}

// ── Harbour water ───────────────────────────────────────────────
// The Harbor district flag `water: true` used to mean "no buildings
// here" and nothing else. The water itself is a real plane now.

export const HARBOR_WATER = { x: -180, z: 140, r: 50 };

const waterCache = new Map();

export function waterMaps(seed = 1337) {
  const key = `water|${seed}`;
  if (waterCache.has(key)) return waterCache.get(key);
  const seedInt = hashString(`gta:water:${seed}`);
  const W = 256;
  const H = 256;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const swell = valueNoise(u * 5, v * 11, seedInt) * 0.65
        + valueNoise(u * 10.6 + 7, v * 10.6 + 3, seedInt) * 0.35;
      const streak = valueNoise(u * 40, v * 160, seedInt);
      const l = 0.9 + (swell - 0.5) * 0.3 + (streak > 0.86 ? 0.35 : 0);
      const i = (y * W + x) * 4;
      color[i] = clamp255(26 * l);
      color[i + 1] = clamp255(74 * l);
      color[i + 2] = clamp255(102 * l);
      color[i + 3] = 255;
      bump[y * W + x] = clamp255(128 + (swell - 0.5) * 46);
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
  const out = { map, bumpMap, roughness: 0.25, metalness: 0.1, bumpScale: 0.03 };
  waterCache.set(key, out);
  return out;
}

export function buildHarborWater(seed = 1337) {
  const maps = waterMaps(seed);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(HARBOR_WATER.r, 48),
    new THREE.MeshStandardMaterial({
      map: maps.map, bumpMap: maps.bumpMap, bumpScale: maps.bumpScale,
      roughness: maps.roughness, metalness: maps.metalness,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(HARBOR_WATER.x, 0.06, HARBOR_WATER.z);
  mesh.receiveShadow = true;
  mesh.name = 'cgi-harbor-water';
  return mesh;
}

// ── Sky ─────────────────────────────────────────────────────────
// The scene's own 10-minute day cycle is kept (timeOfDay 0..1,
// 0.5 = noon) — this layer only paints it. dayness follows the
// same law the old flat lerp used: max(0, sin(angle)).

export const CITY_SKY = {
  day: { top: 0x3a7bd5, horizon: 0xbfd9ee, bottom: 0x9db8c8 },
  night: { top: 0x070a18, horizon: 0x1a1a3a, bottom: 0x0a0a14 },
  sunColor: 0xfff3c4,
  moonColor: 0xdfe8ff,
};

export function skyDayness(timeOfDay01) {
  return Math.max(0, Math.sin(((timeOfDay01 % 1) + 1) % 1 * Math.PI * 2));
}

function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** { top, horizon, bottom } hex colours for a dayness 0..1. Pure. */
export function skyPalette(dayness) {
  const d = Math.max(0, Math.min(1, dayness));
  return {
    top: lerpHex(CITY_SKY.night.top, CITY_SKY.day.top, d),
    horizon: lerpHex(CITY_SKY.night.horizon, CITY_SKY.day.horizon, d),
    bottom: lerpHex(CITY_SKY.night.bottom, CITY_SKY.day.bottom, d),
  };
}

export const CITY_SKY_RADIUS = 800;
export const CITY_SUN_DIST = 700;

/** Gradient dome: vertex colours blend bottom -> horizon -> top. */
export function buildSkyDome() {
  const geo = new THREE.SphereGeometry(CITY_SKY_RADIUS, 28, 16);
  const top = new THREE.Color(CITY_SKY.day.top);
  const hor = new THREE.Color(CITY_SKY.day.horizon);
  const bot = new THREE.Color(CITY_SKY.day.bottom);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / CITY_SKY_RADIUS + 1) / 2;
    if (y01 < 0.5) c.copy(bot).lerp(hor, y01 * 2);
    else c.copy(hor).lerp(top, (y01 - 0.5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'cgi-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

function glowSprite(color, scale, name) {
  const mat = new THREE.SpriteMaterial({
    map: getParticleTexture('glow') || undefined,
    color, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.name = name;
  sp.scale.set(scale, scale, 1);
  return sp;
}

export function buildSunSprite() {
  return glowSprite(CITY_SKY.sunColor, 150, 'cgi-sun');
}

export function buildMoonSprite() {
  const sp = glowSprite(CITY_SKY.moonColor, 70, 'cgi-moon');
  sp.position.set(-420, 380, -320);
  return sp;
}

// Solid-disc sprite texture: opaque white out to 0.7 of the radius,
// then a falloff to transparent at the rim — the bright core the
// glow sprite alone never had. Painted as data (node-safe), the
// same idiom as babelGlowTexture in app/babel/cgi.js.
let sunDiscTextureCache = null;
function sunDiscTexture() {
  if (sunDiscTextureCache) return sunDiscTextureCache;
  const W = 64;
  const H = 64;
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2;
      const dy = (y / H - 0.5) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = d <= 0.7 ? 1 : Math.max(0, 1 - (d - 0.7) / 0.3);
      const i = (y * W + x) * 4;
      color[i] = 255; color[i + 1] = 255; color[i + 2] = 255;
      color[i + 3] = Math.round(255 * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  sunDiscTextureCache = tex;
  return tex;
}

/**
 * The sun's bright core: a small solid disc that rides inside the
 * glow sprite (same colour, much smaller scale). Additive, so it
 * can never occlude the halo — it only brightens its centre.
 */
export function buildSunDisc() {
  const mat = new THREE.SpriteMaterial({
    map: sunDiscTexture(),
    color: CITY_SKY.sunColor, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.name = 'cgi-sun-disc';
  sp.scale.set(28, 28, 1);
  sp.renderOrder = 1;
  return sp;
}

// Merlin's lunar photograph (Nov 15, 2026): 1170x585 equirectangular,
// the exact shape a sphere wants. It goes on a sphere ONLY — never
// on a flat disc or a sprite, which would smear the whole unwrapped
// surface. The loader swaps the pale fallback for the photo the
// moment it lands; a failed load leaves a pale moon, never a blank
// one. Node-safe: without a document no loader runs.
export const MOON_SURFACE_PHOTO_URL = '/images/moon/moon-surface.jpg';
export const MOON_DISC_RADIUS = 22;
export const MOON_DISC_FALLBACK_COLOR = 0xdfe8ff;

/**
 * The real Moon: a sphere wearing the photograph, on the same
 * fixed perch as the glow sprite (which stays as its halo — it is
 * additive, so it brightens the sphere instead of covering it).
 */
export function buildMoonDisc() {
  const mat = new THREE.MeshBasicMaterial({
    color: MOON_DISC_FALLBACK_COLOR, transparent: true, opacity: 1, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_DISC_RADIUS, 48, 32), mat);
  mesh.name = 'cgi-moon-disc';
  mesh.position.set(-420, 380, -320);
  if (typeof document !== 'undefined') {
    try {
      new THREE.TextureLoader().load(
        MOON_SURFACE_PHOTO_URL,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        },
        undefined,
        () => { /* photo failed: the pale fallback stays */ },
      );
    } catch { /* no loader available: the pale fallback stays */ }
  }
  return mesh;
}

/** Stars on the upper dome shell; opacity is driven by night. */
export function buildStars(count = 240, seed = 'mega-city-stars') {
  const rnd = mulberry32(hashString(`gta:stars:${seed}`));
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const el = rnd() * Math.PI * 0.48 + 0.03;
    const r = CITY_SKY_RADIUS - 20;
    pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd8e8ff, size: 1.8, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
    map: getParticleTexture('star') || undefined,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'cgi-stars';
  points.frustumCulled = false;
  return points;
}

/** Drifting cloud billboards on a ring; the group turns on the clock. */
export function buildClouds(count = 10, seed = 'mega-city-clouds') {
  const group = new THREE.Group();
  group.name = 'cgi-clouds';
  const tex = getParticleTexture('mist') || undefined;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color: 0xffffff, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const rnd = mulberry32(hashString(`gta:clouds:${seed}`));
  const geo = new THREE.PlaneGeometry(130, 42);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    const a = rnd() * Math.PI * 2;
    const r = 420 + rnd() * 220;
    m.position.set(Math.cos(a) * r, 95 + rnd() * 70, Math.sin(a) * r);
    m.lookAt(0, m.position.y, 0);
    const s = 0.7 + rnd() * 0.9;
    m.scale.set(s, s * (0.8 + rnd() * 0.4), 1);
    m.rotation.z = (rnd() - 0.5) * 0.2;
    m.name = 'cgi-cloud';
    group.add(m);
  }
  group.userData.driftRate = 0.004;
  return group;
}

/** Cloud-ring angle at `nowMs` — pure function of the clock. */
export function cloudAngle(nowMs = Date.now()) {
  return spinAngle(0.004, nowMs);
}

// ── City wind + rain ────────────────────────────────────────────
// Worker's-choice numbers (Merlin gave none — flag if he wants
// them tuned): prevailing from the west (270°), base 4 m/s, gusts
// 2–9 m/s on a 47 s cycle, veer ±20° over 4 minutes. Same shape
// as the Mars 2 Thule wind, city-scale speeds.

export const CITY_WIND_BEARING_DEG = 270;
export const CITY_WIND_VEER_DEG = 20;
export const CITY_WIND_VEER_PERIOD_S = 240;
export const CITY_WIND_BASE_MPS = 4;
export const CITY_WIND_GUST_MIN_MPS = 2;
export const CITY_WIND_GUST_MAX_MPS = 9;
export const CITY_WIND_GUST_PERIOD_S = 47;

export function windVectorFromBearing(bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), z: Math.cos(rad) };
}

/** The city wind at `nowMs`: { speed, bearingDeg, dirX, dirZ, gust }. Pure. */
export function cityWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - CITY_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / CITY_WIND_GUST_PERIOD_S) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    CITY_WIND_GUST_MIN_MPS,
    Math.min(CITY_WIND_GUST_MAX_MPS, CITY_WIND_BASE_MPS + gustWave * 2.5),
  );
  const bearingDeg = CITY_WIND_BEARING_DEG
    + CITY_WIND_VEER_DEG * Math.sin((t / CITY_WIND_VEER_PERIOD_S) * Math.PI * 2 + 0.7);
  const dir = windVectorFromBearing(bearingDeg);
  return {
    speed,
    bearingDeg,
    dirX: dir.x,
    dirZ: dir.z,
    gust: (speed - CITY_WIND_GUST_MIN_MPS) / (CITY_WIND_GUST_MAX_MPS - CITY_WIND_GUST_MIN_MPS),
  };
}

export const CITY_RAIN_COUNT = 320;
export const CITY_RAIN_AREA = 70;
export const CITY_RAIN_HEIGHT = 18;
export const CITY_RAIN_SPEED = 13;

/** Walker-following rain: drops fall and wrap, drifting with the wind. */
export function makeRainField({
  count = CITY_RAIN_COUNT,
  area = CITY_RAIN_AREA,
  height = CITY_RAIN_HEIGHT,
  seed = 'mega-city-rain',
  color = 0xbfd4e6,
  size = 0.32,
  opacity = 0.42,
} = {}) {
  const rnd = mulberry32(hashString(`gta:rain:${seed}`));
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rnd() - 0.5) * area;
    base[i * 3 + 1] = rnd() * height;
    base[i * 3 + 2] = (rnd() - 0.5) * area;
    phase[i] = rnd() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
  geo.userData.rainBase = base;
  geo.userData.rainPhase = phase;
  geo.userData.rainCount = count;
  geo.userData.rainHeight = height;
  geo.userData.rainSpeed = CITY_RAIN_SPEED;
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity,
    depthWrite: false, sizeAttenuation: true,
    map: getParticleTexture('drop') || undefined,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'cgi-rain';
  points.frustumCulled = false;
  return points;
}

/** Advance the rain to `nowMs`; the scene keeps the field on the player. Pure of clock. */
export function updateRainField(points, nowMs = Date.now()) {
  const geo = points.geometry;
  const base = geo.userData.rainBase;
  const phase = geo.userData.rainPhase;
  const count = geo.userData.rainCount;
  const height = geo.userData.rainHeight;
  const speed = geo.userData.rainSpeed;
  if (!base || !phase || !count) return;
  const t = (Number(nowMs) - CITY_CGI_EPOCH_MS) / 1000;
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  const wrap = (v, h) => ((v % h) + h) % h;
  for (let i = 0; i < count; i++) {
    const p = phase[i];
    arr[i * 3] = base[i * 3] + Math.sin(t * 0.3 + p) * 0.6;
    arr[i * 3 + 1] = wrap(base[i * 3 + 1] - speed * t, height);
    arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.24 + p) * 0.6;
  }
  attr.needsUpdate = true;
}

// ── Traffic operator ────────────────────────────────────────────
// The parked cars were the only cars in the city. These 14 drive
// the road grid — a pure function of (index, clock): same index +
// same instant = same car in the same place on every phone.
// Roads run on the 40 m grid (centres -294 + 40k); lanes sit
// 3.2 m right of the road centre (right-hand traffic). Visual
// only: traffic cars carry no colliders and no crime — they never
// touch the wanted system, the player, or a mission.

export const TRAFFIC_COUNT = 14;
export const TRAFFIC_ROAD_CENTERS = Array.from({ length: 15 }, (_, k) => -294 + 40 * k);
export const TRAFFIC_LANE_OFFSET = 3.2;
export const TRAFFIC_TYPES = ['sedan', 'taxi', 'sports', 'truck'];
export const TRAFFIC_COLORS = [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x6b7280, 0x111827, 0xe5e7eb];

export function trafficCarFor(index, nowMs = Date.now()) {
  const rnd = mulberry32(hashString(`gta:traffic:${index}`));
  const speed = 8 + rnd() * 8;
  const dir = rnd() > 0.5 ? 1 : -1;
  const phase = rnd() * CITY_SIZE;
  const lane = TRAFFIC_ROAD_CENTERS[Math.floor(rnd() * TRAFFIC_ROAD_CENTERS.length)];
  const type = TRAFFIC_TYPES[Math.floor(rnd() * TRAFFIC_TYPES.length)];
  const color = TRAFFIC_COLORS[Math.floor(rnd() * TRAFFIC_COLORS.length)];
  const axis = index % 2 === 0 ? 'x' : 'z';
  const t = (Number(nowMs) - CITY_CGI_EPOCH_MS) / 1000;
  const s = (((phase + dir * speed * t) % CITY_SIZE) + CITY_SIZE) % CITY_SIZE - CITY_SIZE / 2;
  // Right-hand traffic: the lane offset flips with the axis so the
  // car always sits on the right of its direction of travel.
  const offset = dir * (axis === 'x' ? TRAFFIC_LANE_OFFSET : -TRAFFIC_LANE_OFFSET);
  const x = axis === 'x' ? s : lane + offset;
  const z = axis === 'x' ? lane + offset : s;
  // Heading follows the vehicle law: forward = (sin h, cos h).
  const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  return { index, x, z, heading, speed, dir, axis, type, color };
}

// ── Pedestrian operator ─────────────────────────────────────────
// 18 walkers on the sidewalk rings around the blocks — a pure
// function of (index, clock). They walk, they bob, they never
// collide, never commit crimes, never count as objectives: the
// city had no people at all, and these are its first. Visual only,
// same as the traffic.

export const PEDESTRIAN_COUNT = 18;
export const PEDESTRIAN_RING_HALF = 16; // sidewalk ring around a 40 m block
export const PEDESTRIAN_COATS = [0x7c2d12, 0x1e3a5f, 0x3f6212, 0x581c87, 0x9f1239, 0x0f766e, 0x92400e, 0x334155];

export function pedestrianFor(index, nowMs = Date.now()) {
  const rnd = mulberry32(hashString(`gta:pedestrian:${index}`));
  const bx = -280 + 40 * Math.floor(rnd() * 14);
  const bz = -280 + 40 * Math.floor(rnd() * 14);
  const speed = 1.2 + rnd() * 0.6;
  const phase = rnd() * 128;
  const coat = PEDESTRIAN_COATS[Math.floor(rnd() * PEDESTRIAN_COATS.length)];
  const h = PEDESTRIAN_RING_HALF;
  const perimeter = 8 * h; // 2 * (2h + 2h)
  const t = (Number(nowMs) - CITY_CGI_EPOCH_MS) / 1000;
  const d = (((phase + speed * t) % perimeter) + perimeter) % perimeter;
  // Clockwise around the ring, starting at the north-west corner.
  let x, z, heading;
  const side = 2 * h;
  if (d < side) { x = bx - h + d; z = bz - h; heading = Math.PI / 2; }
  else if (d < side * 2) { x = bx + h; z = bz - h + (d - side); heading = 0; }
  else if (d < side * 3) { x = bx + h - (d - side * 2); z = bz + h; heading = -Math.PI / 2; }
  else { x = bx - h; z = bz + h - (d - side * 3); heading = Math.PI; }
  return {
    index, x, z, heading, speed, coat,
    bob: Math.sin(t * speed * 4 + phase),
    blockX: bx, blockZ: bz,
  };
}

// ── Vehicle + pedestrian meshes (shared: Mega City, Babel) ──────
// The old inline builders were a body box + a dark cabin box — no
// wheels, no lights, no glass. One builder now, used by every GTA
// scene, so a parked car, a traffic car and a cop read as cars.

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
wheelGeo.rotateZ(Math.PI / 2); // axle along X, so rotation.x spins the wheel
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
hubGeo.rotateZ(Math.PI / 2); // axle along X, like the wheel
const hubMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.35, metalness: 0.7 });

export function buildVehicleMesh(type = 'sedan', colorHex = 0xdc2626) {
  const group = new THREE.Group();
  group.name = `cgi-vehicle-${type}`;
  const paint = new THREE.MeshStandardMaterial({
    color: colorHex, roughness: 0.3, metalness: 0.6,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a2530, roughness: 0.15, metalness: 0.85,
  });
  const isSports = type === 'sports';
  const isTruck = type === 'truck';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(isSports ? 1.9 : 2, isSports ? 0.65 : 0.8, isSports ? 4.4 : 4.2),
    paint
  );
  body.position.y = isSports ? 0.52 : 0.6;
  body.castShadow = true;
  group.add(body);
  if (isTruck) {
    // Cab + cargo box instead of a cabin.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.2), glass);
    cab.position.set(0, 1.15, 1.3);
    group.add(cab);
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.3, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.6, metalness: 0.3 })
    );
    cargo.position.set(0, 1.15, -0.7);
    cargo.castShadow = true;
    group.add(cargo);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), glass);
    cabin.position.set(0, 1.2, -0.2);
    group.add(cabin);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.8 })
    );
    sign.position.set(0, 1.62, -0.2);
    group.add(sign);
  }
  // Wheels (spin via userData.wheels, rotation.x).
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.set(wx, 0.42, wz);
    group.add(hub);
  }
  // Headlights (front, +Z) + taillights (rear) — emissive only.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfffbe8, emissive: 0xfff2b0, emissiveIntensity: 0.4,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d, emissive: 0xef4444, emissiveIntensity: 0.5,
  });
  for (const hx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headMat);
    head.position.set(hx, 0.62, 2.12);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), tailMat);
    tail.position.set(hx, 0.62, -2.12);
    group.add(tail);
  }
  group.userData.wheels = wheels;
  group.userData.lampMats = { head: headMat, tail: tailMat };
  return group;
}

/** Police car: sedan + a red/blue lightbar the scene flashes on the clock. */
export function buildCopMesh() {
  const group = buildVehicleMesh('sedan', 0x1e3a8a);
  group.name = 'cgi-cop-car';
  const redMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b, emissive: 0xff0000, emissiveIntensity: 0.2,
  });
  const blueMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a, emissive: 0x2244ff, emissiveIntensity: 0.2,
  });
  const barGeo = new THREE.BoxGeometry(0.55, 0.22, 0.4);
  const red = new THREE.Mesh(barGeo, redMat);
  red.position.set(-0.32, 1.35, 0);
  const blue = new THREE.Mesh(barGeo, blueMat);
  blue.position.set(0.32, 1.35, 0);
  group.add(red, blue);
  group.userData.lightbar = { red: redMat, blue: blueMat };
  return group;
}

/** Cop lightbar flash at `nowMs`: red and blue alternate every 350 ms. Pure. */
export function copFlashAt(nowMs = Date.now()) {
  return Math.floor(Number(nowMs) / 350) % 2 === 0 ? 'red' : 'blue';
}

export function buildPedestrianMesh(coatHex = 0x1e3a5f) {
  const group = new THREE.Group();
  group.name = 'cgi-pedestrian';
  const coat = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), coat);
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
  legL.position.set(-0.12, 0.25, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
  legR.position.set(0.12, 0.25, 0);
  group.add(body, head, legL, legR);
  group.userData.legs = { left: legL, right: legR };
  return group;
}

// ── Neon signs ──────────────────────────────────────────────────
// Rooftop signs on the tallest downtown towers, placed on the
// building's south face from the generated city data — so they
// always sit on a real tower, never floating in air. Emissive
// canvas texture (browser-only drawing); without a document the
// caller gets a plain emissive plane instead of a crash.

export const NEON_LABELS = ['HOTEL', 'RAMEN', '24H', 'NEON', 'BAR', 'CINEMA'];
export const NEON_COLORS = [0x00f2ff, 0xff3366, 0xffcc33, 0xa259ff, 0xff7a1f, 0x39ff88];

/**
 * Sign placements for the `count` tallest buildings (h >= 60).
 * Pure data: { x, y, z, heading, w, h, label, color }. The sign
 * sits 0.3 m proud of the south face at 55% of the tower height.
 */
export function neonSignPlacements(buildings, count = 6) {
  const tall = buildings
    .filter((b) => b.h >= 60)
    .sort((a, b) => b.h - a.h);
  const picks = [];
  for (let i = 0; i < tall.length && picks.length < count; i += 1) {
    const b = tall[i];
    // Spread the picks so two signs never share one tower face row.
    if (picks.some((p) => Math.abs(p.x - b.x) < 20 && Math.abs(p.z - b.z) < 20)) continue;
    picks.push({
      x: b.x,
      y: b.h * 0.55,
      z: b.z + b.d / 2 + 0.3,
      heading: 0,
      w: Math.min(14, b.w * 0.8),
      h: 3,
      label: NEON_LABELS[picks.length % NEON_LABELS.length],
      color: NEON_COLORS[picks.length % NEON_COLORS.length],
    });
  }
  return picks;
}

export function buildNeonSignMesh(placement) {
  const group = new THREE.Group();
  group.name = `cgi-neon-${placement.label}`;
  const colorCss = `#${placement.color.toString(16).padStart(6, '0')}`;
  let map = null;
  if (typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#05070d';
      x.fillRect(0, 0, 256, 64);
      x.font = '700 34px system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowColor = colorCss;
      x.shadowBlur = 16;
      x.fillStyle = colorCss;
      x.fillText(placement.label, 128, 34);
      map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
    } catch (e) { map = null; }
  }
  const mat = new THREE.MeshBasicMaterial({
    map: map || undefined,
    color: map ? 0xffffff : placement.color,
    transparent: true, opacity: 0.9, fog: false,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(placement.w, placement.h), mat);
  group.add(face);
  group.position.set(placement.x, placement.y, placement.z);
  group.rotation.y = placement.heading;
  group.userData.signMat = mat;
  return group;
}
