/*
 * STAR WARS pocket universe — procedural CGI layer (Merlin, Nov 15, 2026).
 *
 * "Upgrade the heck out of it. And not just tattooing... all world in
 * the Star Wars universe." His four Tatooine phone videos showed the
 * defects this layer fixes: flat brown ground, a flat light-blue sky
 * with NO twin suns, and nothing moving anywhere.
 *
 * What lives here, per world:
 *   1. TEXTURED GROUND — the lib/planet-cgi standard: seeded colour +
 *      bump DataTextures (256x256, cached per world id+seed, node-safe,
 *      no canvas, no network). Each world's own colours come from its
 *      data.js def (ground / ground2), so Tatooine stays tan sand and
 *      Hoth stays white ice — the pattern is what changes: dune
 *      ripples on Tatooine/Jakku, crevasse ice on Hoth, glowing lava
 *      cracks on Mustafar, salt-red cracks on Crait, rain-slick plates
 *      on Kamino, lit city grids on Coruscant.
 *   2. A LIVING SKY — a vertex-colour gradient dome (top / horizon /
 *      below-horizon), real sun sprites, and per-world weather: drifting
 *      cloud billboards, dust / snow / rain / ember / ash mote fields
 *      that follow the walker, dust devils on the desert worlds, a
 *      cloud sea under Bespin, lightning over Exegol.
 *   3. BREATHING LIGHT — the SHARED day/night law (lib/day-night.js):
 *      the primary sun rides the real sun vector for the walker's
 *      place (Sydney when location is not granted), the dome and the
 *      zone lights dim into the world's own night palette, and the
 *      suns set below the horizon instead of shining through the
 *      ground. Tatooine's second sun stays glued to the first (5 deg
 *      around, a touch lower) — the binary pair, moving as one.
 *
 * Pure where it can be: worldCgiSpec(def) is data only (no THREE, no
 * DOM) — the test suite pins every world through it. buildCgi(R, def,
 * T) is the scene builder; its update() is a pure function of the
 * device clock (nowMs) plus the observer position, so the same
 * instant shows the same sky on every phone.
 *
 * Procedural CGI only — NO Tripo, no network fetches. The speeder,
 * backpack, HUD and mission system are untouched; zone.js only swaps
 * its ground material and adds this group.
 */

import * as ThreeJS from 'three';
import { hashString, mulberry32, valueNoise } from '../../lib/earth4/creature-textures.js';
import {
  dayNightFor, getDayNightPlace, requestDayNightPlace,
} from '../../lib/day-night.js';
import {
  spinAngle, cloudDriftAngle, lightningFlash, devilFor, PLANET_CGI_EPOCH_MS,
} from '../../lib/planet-cgi/motion.js';
import { cloudLayerTexture } from '../../lib/planet-cgi/textures.js';
import { getParticleTexture } from '../../lib/particles/sprites.js';

function R3(THREE) { return THREE || ThreeJS; }

export const CGI_GROUND_SIZE = 256; // texture px, same as lib/planet-cgi
export const CGI_SKY_RADIUS = 1100; // dome radius (camera far is 2500)
export const CGI_SUN_DIST = 950; // sun sprites ride just inside the dome
export const CGI_DAYNIGHT_THROTTLE_MS = 500; // sun moves slowly; 2 Hz is plenty

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* Seeded fbm over valueNoise — the same primitive lib/planet-cgi paints with. */
function fbmN(x, y, seed) {
  return valueNoise(x, y, seed) * 0.65
    + valueNoise(x * 2.13 + 7, y * 2.13 + 3, seed) * 0.35;
}

function hexRgb(n) {
  const v = n >>> 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ------------------------------------------------------------------ */
/* Ground maps — seeded colour + bump DataTextures, cached per world.  */
/*                                                                     */
/* Each painter takes (u, v, n) with n = { seed, base, alt } (RGB     */
/* arrays from the world's own ground / ground2) and returns           */
/* { r, g, b, bump }. The pattern is the biome; the colours are the    */
/* world. Unknown tex names fall back to rock.                         */
/* ------------------------------------------------------------------ */

const GROUND_PAINTERS = {
  /* Desert sand: long fbm dune bands warped by noise, fine ripple
   * ridges (46 per tile ≈ 20 cm apart at the 9.3 m tile) carried
   * mostly in the bump channel so they read at eye level, grain
   * speckle, darker wind-scoured patches. */
  sand(u, v, n) {
    const dune = fbmN(u * 6, v * 22, n.seed);
    const patch = fbmN(u * 5 + 31, v * 5 + 17, n.seed);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    const ripple = 0.5 + 0.5 * Math.sin((u * 46 + v * 10) * Math.PI * 2
      + fbmN(u * 8, v * 8, n.seed) * 7);
    const d = dune - 0.5, p = patch < 0.42 ? -1 : 0, r = ripple - 0.5;
    return {
      r: Math.max(0, Math.min(255, n.base[0] + d * 40 + p * 26 + r * 16 + (grain - 0.5) * 18)),
      g: Math.max(0, Math.min(255, n.base[1] + d * 30 + p * 20 + r * 12 + (grain - 0.5) * 14)),
      b: Math.max(0, Math.min(255, n.base[2] + d * 20 + p * 12 + r * 8 + (grain - 0.5) * 10)),
      bump: Math.max(0, Math.min(255, 128 + d * 62 + r * 74 + (grain - 0.5) * 36)),
    };
  },
  /* Rocky desert / basalt: pits + mottling, same family as
   * planet-cgi rock, tinted by the world's own colours. */
  rock(u, v, n) {
    const pit = valueNoise(u * 46, v * 46, n.seed);
    const mottle = fbmN(u * 10, v * 10, n.seed);
    const l = pit > 0.82 ? 0.45 : 0.82 + mottle * 0.36;
    return {
      r: Math.max(0, Math.min(255, n.base[0] * l + (mottle - 0.5) * 22)),
      g: Math.max(0, Math.min(255, n.base[1] * l + (mottle - 0.5) * 18)),
      b: Math.max(0, Math.min(255, n.base[2] * l + (mottle - 0.5) * 14)),
      bump: Math.max(0, Math.min(255, pit > 0.82 ? 46 : 128 + mottle * 70)),
    };
  },
  /* Ice: white-blue crystal, fine crevasse lines, sparkle grain. */
  ice(u, v, n) {
    const crevasse = 0.5 + 0.5 * Math.sin((u * 7 + v * 13) * 24
      + fbmN(u * 6, v * 6, n.seed) * 6);
    const sparkle = valueNoise(u * 180, v * 180, n.seed);
    const drift = fbmN(u * 4, v * 9, n.seed);
    const l = 0.94 + (crevasse > 0.92 ? -0.12 : 0) + (sparkle - 0.5) * 0.07 + (drift - 0.5) * 0.08;
    return {
      r: Math.max(0, Math.min(255, n.base[0] * l)),
      g: Math.max(0, Math.min(255, n.base[1] * l)),
      b: Math.max(0, Math.min(255, n.base[2] * l)),
      bump: Math.max(0, Math.min(255, 128 + (crevasse - 0.5) * 64 + (drift - 0.5) * 40)),
    };
  },
  /* Lava rock: near-black basalt with glowing cracks — the colour
   * map carries the glow (orange / yellow fissures), the bump drops
   * inside the cracks. */
  lava(u, v, n) {
    const mottle = fbmN(u * 9, v * 9, n.seed);
    const ridge = 1 - Math.abs(2 * fbmN(u * 7 + 13, v * 7 + 4, n.seed) - 1);
    const crack = Math.max(0, ridge - 0.82) / 0.18; // 0..1 inside a fissure
    const hot = crack > 0.55;
    return {
      r: Math.max(0, Math.min(255, n.base[0] + mottle * 22 + crack * 235)),
      g: Math.max(0, Math.min(255, n.base[1] + mottle * 14 + crack * (hot ? 150 : 70))),
      b: Math.max(0, Math.min(255, n.base[2] + mottle * 10 + crack * (hot ? 40 : 12))),
      bump: Math.max(0, Math.min(255, 128 + (mottle - 0.5) * 50 - crack * 90)),
    };
  },
  /* Metal plates: panel grid, rivets at the corners, speckle wear. */
  metal(u, v, n) {
    const gx = Math.abs(((u * 4) % 1) - 0.5), gy = Math.abs(((v * 4) % 1) - 0.5);
    const seam = (gx > 0.47 || gy > 0.47) ? -0.22 : 0;
    const rivet = (gx > 0.44 && gy > 0.44) ? -0.3 : 0;
    const wear = fbmN(u * 12, v * 12, n.seed);
    const l = 0.92 + seam + rivet + (wear - 0.5) * 0.16;
    return {
      r: Math.max(0, Math.min(255, n.base[0] * l)),
      g: Math.max(0, Math.min(255, n.base[1] * l)),
      b: Math.max(0, Math.min(255, n.base[2] * l)),
      bump: Math.max(0, Math.min(255, 128 + seam * 220 + (wear - 0.5) * 30)),
    };
  },
  /* Forest floor: green mottle, leaf speckle, dark vein lines. */
  leaf(u, v, n) {
    const mottle = fbmN(u * 8, v * 8, n.seed);
    const detail = fbmN(u * 22 + 9, v * 22 + 4, n.seed);
    const vein = valueNoise(u * 60, v * 14, n.seed);
    const mix = clamp01((mottle - 0.35) * 2.2);
    const r = lerp(n.alt[0], n.base[0], mix) + (detail - 0.5) * 26;
    const g = lerp(n.alt[1], n.base[1], mix) + (detail - 0.5) * 30;
    const b = lerp(n.alt[2], n.base[2], mix) + (detail - 0.5) * 20;
    return {
      r: Math.max(0, Math.min(255, r - (vein > 0.8 ? 22 : 0))),
      g: Math.max(0, Math.min(255, g - (vein > 0.8 ? 26 : 0))),
      b: Math.max(0, Math.min(255, b - (vein > 0.8 ? 18 : 0))),
      bump: Math.max(0, Math.min(255, 128 + (mottle - 0.5) * 70 + (detail - 0.5) * 30)),
    };
  },
  /* Ocean platform: deep blue, pale wave streaks, fine sparkle.
   * The sheen comes from the material (low roughness), not the map. */
  water(u, v, n) {
    const swell = fbmN(u * 5, v * 11, n.seed);
    const streak = valueNoise(u * 40, v * 160, n.seed);
    const l = 0.9 + (swell - 0.5) * 0.3 + (streak > 0.86 ? 0.35 : 0);
    return {
      r: Math.max(0, Math.min(255, n.base[0] * l)),
      g: Math.max(0, Math.min(255, n.base[1] * l)),
      b: Math.max(0, Math.min(255, n.base[2] * l)),
      bump: Math.max(0, Math.min(255, 128 + (swell - 0.5) * 46)),
    };
  },
  /* Salt flats: white crust, red mineral cracks (ridged noise). */
  salt(u, v, n) {
    const ridge = 1 - Math.abs(2 * fbmN(u * 8 + 5, v * 8 + 11, n.seed) - 1);
    const crack = Math.max(0, ridge - 0.86) / 0.14;
    const grain = valueNoise(u * 160, v * 160, n.seed);
    return {
      r: Math.max(0, Math.min(255, n.base[0] + (grain - 0.5) * 14 - crack * 30)),
      g: Math.max(0, Math.min(255, n.base[1] + (grain - 0.5) * 12 - crack * 120)),
      b: Math.max(0, Math.min(255, n.base[2] + (grain - 0.5) * 10 - crack * 130)),
      bump: Math.max(0, Math.min(255, 128 - crack * 70 + (grain - 0.5) * 26)),
    };
  },
  /* Swamp: dark green-brown bog mottling, algae blobs, wet sheen. */
  swamp(u, v, n) {
    const bog = fbmN(u * 7, v * 7, n.seed);
    const algae = fbmN(u * 16 + 21, v * 16 + 8, n.seed);
    const mix = clamp01((bog - 0.3) * 2);
    const r = lerp(n.alt[0], n.base[0], mix) + (algae > 0.72 ? 26 : 0);
    const g = lerp(n.alt[1], n.base[1], mix) + (algae > 0.72 ? 42 : 0);
    const b = lerp(n.alt[2], n.base[2], mix) + (algae > 0.72 ? 10 : 0);
    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
      bump: Math.max(0, Math.min(255, 128 + (bog - 0.5) * 80)),
    };
  },
  /* City plane: dark plates, street grid, lit windows (warm / cool). */
  city(u, v, n) {
    const gx = Math.abs(((u * 6) % 1) - 0.5), gy = Math.abs(((v * 6) % 1) - 0.5);
    const seam = (gx > 0.46 || gy > 0.46) ? -0.3 : 0;
    const wx = Math.floor(u * 36) % 3, wy = Math.floor(v * 36) % 2;
    const rnd = mulberry32(hashString(`city:${Math.floor(u * 36)}:${Math.floor(v * 36)}`));
    const lit = rnd() < 0.4;
    const warm = rnd() < 0.8;
    const win = (wx < 2 && wy < 1 && lit) ? 1 : 0;
    return {
      r: Math.max(0, Math.min(255, n.base[0] * (0.9 + seam) + win * (warm ? 200 : 90))),
      g: Math.max(0, Math.min(255, n.base[1] * (0.9 + seam) + win * (warm ? 160 : 150))),
      b: Math.max(0, Math.min(255, n.base[2] * (0.9 + seam) + win * (warm ? 80 : 220))),
      bump: Math.max(0, Math.min(255, 128 + seam * 200)),
    };
  },
};

/* Roughness + bump strength per ground family — the bumpScale is in
 * texture space (same convention as lib/planet-cgi). */
const GROUND_STYLE = {
  sand: { roughness: 0.95, bumpScale: 0.09 },
  rock: { roughness: 1.0, bumpScale: 0.12 },
  ice: { roughness: 0.4, bumpScale: 0.03 },
  lava: { roughness: 0.9, bumpScale: 0.1 },
  metal: { roughness: 0.55, bumpScale: 0.04 },
  leaf: { roughness: 0.95, bumpScale: 0.06 },
  water: { roughness: 0.25, bumpScale: 0.02 },
  salt: { roughness: 0.7, bumpScale: 0.05 },
  swamp: { roughness: 0.85, bumpScale: 0.08 },
  city: { roughness: 0.6, bumpScale: 0.03 },
};

const groundCache = new Map(); // `${id}|${seed}` -> { map, bumpMap, roughness, bumpScale }

/**
 * Seeded colour + bump maps for one world's ground. The maps carry
 * the world's own colours (def.ground / def.ground2); the material
 * that uses them stays white. Cached — the same world paints the
 * same ground on every visit, and a rebuilt zone reuses the maps
 * instead of repainting 65k pixels. Returns null for fly worlds
 * (no ground to paint).
 */
export function cgiGroundMaps(R, def) {
  const THREE = R3(R);
  const d = def || {};
  if (d.kind === 'fly') return null;
  const texName = GROUND_PAINTERS[d.tex] ? d.tex : 'rock';
  const key = `${d.id || 'world'}|${(d.seed >>> 0) || 1337}|${texName}`;
  if (groundCache.has(key)) return groundCache.get(key);
  const seedInt = hashString(`starwars:ground:${key}`);
  const W = CGI_GROUND_SIZE, H = CGI_GROUND_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const paint = GROUND_PAINTERS[texName];
  const n = {
    seed: seedInt,
    base: hexRgb(d.ground != null ? d.ground : 0x888888),
    alt: hexRgb(d.ground2 != null ? d.ground2 : (d.ground != null ? d.ground : 0x666666)),
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = paint(x / W, y / H, n);
      const i = (y * W + x) * 4;
      color[i] = px.r; color[i + 1] = px.g; color[i + 2] = px.b; color[i + 3] = 255;
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
  const style = GROUND_STYLE[texName];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, tex: texName };
  groundCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-world sky spec — pure data, no THREE, no DOM.                   */
/*                                                                     */
/* sky: day gradient (top / horizon / below-horizon) + night gradient  */
/*   (the world's own night — the shared law supplies the blend, not  */
/*   Earth's palette). suns: [{ color, scale, azimuthDeg,             */
/*   elevationDeg }] — the primary sun rides the real sun vector at    */
/*   runtime; azimuth/elevation are its staging + the fly-world fix.  */
/*   Tatooine carries two. clouds: drifting billboards. motes: a      */
/*   walker-following particle field — drift (dust/pollen/mist), fall  */
/*   (rain/snow/ash), rise (embers). devils: dust-devil count.         */
/*   lightning: Exegol storm light. cloudSea: Bespin's cloud deck.    */
/*   horizonGlow: a low coloured glow sprite (Starkiller's weapon     */
/*   charge, Exegol's citadel light).                                  */
/* ------------------------------------------------------------------ */

const NIGHT = { top: 0x070d1f, horizon: 0x1a2438, bottom: 0x05070f };

const CGI_SPECS = {
  tatooine: {
    sky: { top: 0x6fb7e8, horizon: 0xf6d9a0, bottom: 0x8a6a42 },
    night: { top: 0x0a1026, horizon: 0x2a1e3a, bottom: 0x0a0812 },
    suns: [
      { color: 0xfff3c4, scale: 150, azimuthDeg: 205, elevationDeg: 26 },
      { color: 0xffd98a, scale: 110, azimuthDeg: 222, elevationDeg: 20 },
    ],
    clouds: { count: 10, yMin: 90, yMax: 160, radius: 550, color: 0xfff6e0, opacity: 0.75, driftRate: 0.004 },
    motes: { count: 220, color: 0xd8c49a, size: 0.11, opacity: 0.55, mode: 'drift', area: 60, height: 7, speed: 0.11, sprite: 'grain' },
    devils: 2,
  },
  naboo: {
    sky: { top: 0x6fc3ef, horizon: 0xd8ecdf, bottom: 0x4a7a44 },
    suns: [{ color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 34 }],
    clouds: { count: 16, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.85, driftRate: 0.005 },
    motes: { count: 120, color: 0xe8f0d8, size: 0.09, opacity: 0.5, mode: 'drift', area: 50, height: 6, speed: 0.09, sprite: 'glow' },
  },
  coruscant: {
    sky: { top: 0x2e3d5e, horizon: 0xe88f4a, bottom: 0x1a1a26 },
    night: { top: 0x05070f, horizon: 0x2a1a30, bottom: 0x05050a },
    suns: [{ color: 0xffe0b0, scale: 120, azimuthDeg: 215, elevationDeg: 18 }],
    clouds: { count: 8, yMin: 100, yMax: 170, radius: 600, color: 0x8a7a8a, opacity: 0.6, driftRate: 0.003 },
    motes: { count: 150, color: 0xffd98a, size: 0.08, opacity: 0.7, mode: 'drift', area: 60, height: 9, speed: 0.14, sprite: 'glow' },
  },
  kamino: {
    sky: { top: 0x5f7488, horizon: 0x9db4c2, bottom: 0x2a3a48 },
    night: { top: 0x060a12, horizon: 0x141c26, bottom: 0x04060a },
    suns: [{ color: 0xdfe8f0, scale: 100, azimuthDeg: 195, elevationDeg: 20 }],
    clouds: { count: 20, yMin: 60, yMax: 120, radius: 550, color: 0x6a7a88, opacity: 0.9, driftRate: 0.008 },
    motes: { count: 500, color: 0xbfd4e6, size: 0.14, opacity: 0.5, mode: 'fall', area: 50, height: 16, speed: 22, sprite: 'drop' },
  },
  geonosis: {
    sky: { top: 0xd97a3e, horizon: 0xf2b06a, bottom: 0x7a3a20 },
    night: { top: 0x160a08, horizon: 0x3a1c10, bottom: 0x0e0604 },
    suns: [{ color: 0xffd9a0, scale: 140, azimuthDeg: 210, elevationDeg: 30 }],
    clouds: { count: 6, yMin: 90, yMax: 150, radius: 550, color: 0xe8a06a, opacity: 0.6, driftRate: 0.005 },
    motes: { count: 260, color: 0xc47a44, size: 0.11, opacity: 0.55, mode: 'drift', area: 60, height: 7, speed: 0.12, sprite: 'grain' },
    devils: 2,
  },
  mustafar: {
    sky: { top: 0x1a0806, horizon: 0x7a1e08, bottom: 0x0e0402 },
    night: { top: 0x050202, horizon: 0x1c0806, bottom: 0x020101 },
    suns: [{ color: 0xff5a26, scale: 90, azimuthDeg: 205, elevationDeg: 14 }],
    clouds: { count: 8, yMin: 70, yMax: 130, radius: 550, color: 0x2a1210, opacity: 0.85, driftRate: 0.004 },
    motes: { count: 200, color: 0xff7a26, size: 0.12, opacity: 0.8, mode: 'rise', area: 55, height: 12, speed: 1.6, sprite: 'ember' },
  },
  'yavin-4': {
    sky: { top: 0x6fbde8, horizon: 0xcfe8c8, bottom: 0x2a4a2a },
    suns: [{ color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 34 }],
    clouds: { count: 14, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.8, driftRate: 0.005 },
    motes: { count: 140, color: 0xd8e8c8, size: 0.09, opacity: 0.45, mode: 'drift', area: 50, height: 6, speed: 0.08, sprite: 'glow' },
  },
  alderaan: {
    sky: { top: 0x05070f, horizon: 0x0a1220, bottom: 0x03040a },
    night: { top: 0x05070f, horizon: 0x0a1220, bottom: 0x03040a },
    suns: [{ color: 0xfff6e0, scale: 200, azimuthDeg: 210, elevationDeg: 30 }],
  },
  'death-star': {
    sky: { top: 0x05070f, horizon: 0x0a1220, bottom: 0x03040a },
    night: { top: 0x05070f, horizon: 0x0a1220, bottom: 0x03040a },
    suns: [{ color: 0xdfe8ff, scale: 180, azimuthDeg: 195, elevationDeg: 26 }],
  },
  hoth: {
    sky: { top: 0x8fb8e0, horizon: 0xe8f1fa, bottom: 0xb9d2ea },
    night: { top: 0x0a1424, horizon: 0x2a3a50, bottom: 0x0a121e },
    suns: [{ color: 0xf2f6ff, scale: 120, azimuthDeg: 200, elevationDeg: 24 }],
    clouds: { count: 12, yMin: 70, yMax: 130, radius: 550, color: 0xffffff, opacity: 0.85, driftRate: 0.006 },
    motes: { count: 420, color: 0xffffff, size: 0.13, opacity: 0.75, mode: 'fall', area: 55, height: 14, speed: 1.8, sprite: 'flake' },
  },
  dagobah: {
    sky: { top: 0x5a7058, horizon: 0x8ba888, bottom: 0x22331a },
    night: { top: 0x05080a, horizon: 0x0e1a12, bottom: 0x030604 },
    suns: [{ color: 0xe8f0d8, scale: 90, azimuthDeg: 205, elevationDeg: 16 }],
    clouds: { count: 10, yMin: 60, yMax: 110, radius: 500, color: 0x7a8a72, opacity: 0.7, driftRate: 0.003 },
    motes: { count: 90, color: 0xc8e88a, size: 0.12, opacity: 0.7, mode: 'drift', area: 45, height: 5, speed: 0.1, sprite: 'glow' },
  },
  bespin: {
    sky: { top: 0xe8905c, horizon: 0xf7c98a, bottom: 0xf2c98a },
    night: { top: 0x120a24, horizon: 0x3a2038, bottom: 0x1a1024 },
    suns: [{ color: 0xffe0b0, scale: 140, azimuthDeg: 210, elevationDeg: 20 }],
    clouds: { count: 14, yMin: 70, yMax: 140, radius: 550, color: 0xffd9a0, opacity: 0.85, driftRate: 0.005 },
    motes: { count: 100, color: 0xffd9a0, size: 0.09, opacity: 0.5, mode: 'drift', area: 50, height: 8, speed: 0.1, sprite: 'glow' },
    cloudSea: true,
  },
  endor: {
    sky: { top: 0x6fb8e8, horizon: 0xcfe8d8, bottom: 0x2a4a2a },
    suns: [{ color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 34 }],
    clouds: { count: 14, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.8, driftRate: 0.005 },
    motes: { count: 120, color: 0xd8e88a, size: 0.11, opacity: 0.65, mode: 'drift', area: 50, height: 6, speed: 0.09, sprite: 'glow' },
  },
  jakku: {
    sky: { top: 0xd89a55, horizon: 0xe8c88a, bottom: 0x9a7438 },
    night: { top: 0x140e08, horizon: 0x33241a, bottom: 0x0e0804 },
    suns: [{ color: 0xffe8b8, scale: 150, azimuthDeg: 208, elevationDeg: 28 }],
    clouds: { count: 6, yMin: 90, yMax: 150, radius: 550, color: 0xe8b878, opacity: 0.6, driftRate: 0.005 },
    motes: { count: 260, color: 0xc49a54, size: 0.11, opacity: 0.55, mode: 'drift', area: 60, height: 7, speed: 0.12, sprite: 'grain' },
    devils: 2,
  },
  takodana: {
    sky: { top: 0x7cc0e8, horizon: 0xd8ecd8, bottom: 0x2a5a36 },
    suns: [{ color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 34 }],
    clouds: { count: 14, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.8, driftRate: 0.005 },
    motes: { count: 120, color: 0xe8f0d8, size: 0.09, opacity: 0.5, mode: 'drift', area: 50, height: 6, speed: 0.09, sprite: 'glow' },
  },
  starkiller: {
    sky: { top: 0x5a7a9e, horizon: 0xcfe0f2, bottom: 0x7a96b5 },
    night: { top: 0x060a18, horizon: 0x1c2836, bottom: 0x0a1220 },
    suns: [{ color: 0xe8f0ff, scale: 110, azimuthDeg: 200, elevationDeg: 22 }],
    clouds: { count: 10, yMin: 70, yMax: 130, radius: 550, color: 0xd8e8f2, opacity: 0.8, driftRate: 0.005 },
    motes: { count: 380, color: 0xffffff, size: 0.13, opacity: 0.75, mode: 'fall', area: 55, height: 14, speed: 1.6, sprite: 'flake' },
    horizonGlow: { color: 0x39ff88, azimuthDeg: 180, elevationDeg: 4, scale: 220 },
  },
  'ahch-to': {
    sky: { top: 0x6fb8e8, horizon: 0xd8e8e0, bottom: 0x4a7f58 },
    suns: [{ color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 34 }],
    clouds: { count: 16, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.85, driftRate: 0.005 },
    motes: { count: 120, color: 0xd8e8e8, size: 0.09, opacity: 0.45, mode: 'drift', area: 50, height: 6, speed: 0.08, sprite: 'glow' },
  },
  crait: {
    sky: { top: 0x7fb8ee, horizon: 0xf0e9d8, bottom: 0xd8cbb4 },
    suns: [{ color: 0xfff6d8, scale: 140, azimuthDeg: 205, elevationDeg: 30 }],
    clouds: { count: 8, yMin: 90, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.75, driftRate: 0.004 },
    motes: { count: 140, color: 0xf0e0e0, size: 0.1, opacity: 0.5, mode: 'drift', area: 55, height: 6, speed: 0.1, sprite: 'glow' },
  },
  exegol: {
    sky: { top: 0x0d0718, horizon: 0x2c1e45, bottom: 0x141020 },
    night: { top: 0x0d0718, horizon: 0x2c1e45, bottom: 0x141020 },
    suns: [{ color: 0xc8b8e8, scale: 70, azimuthDeg: 200, elevationDeg: 8 }],
    clouds: { count: 10, yMin: 80, yMax: 150, radius: 550, color: 0x2a1e40, opacity: 0.85, driftRate: 0.004 },
    motes: { count: 200, color: 0x8a7aa8, size: 0.11, opacity: 0.6, mode: 'fall', area: 55, height: 14, speed: 1.2, sprite: 'wisp' },
    lightning: true,
    horizonGlow: { color: 0x8a5aff, azimuthDeg: 180, elevationDeg: 3, scale: 260 },
  },
};

/**
 * The full CGI spec for one world — a fresh object every call.
 * Worlds not in the table fall back to their biome's sky (blue day,
 * standard night) with one sun, so no world can ever ship sky-less.
 */
export function worldCgiSpec(def) {
  const d = def || {};
  const over = CGI_SPECS[d.id] || {};
  const fly = d.kind === 'fly';
  return {
    id: d.id || 'world',
    kind: fly ? 'fly' : 'walk',
    groundTex: GROUND_PAINTERS[d.tex] ? d.tex : 'rock',
    sky: over.sky || { top: 0x6fb8e8, horizon: 0xd8ecf0, bottom: 0x8a7a5a },
    night: over.night || NIGHT,
    suns: (over.suns && over.suns.length ? over.suns : [
      { color: 0xfff6d8, scale: 130, azimuthDeg: 200, elevationDeg: 32 },
    ]).map((s) => ({ ...s })),
    clouds: fly ? null : (over.clouds || { count: 10, yMin: 80, yMax: 150, radius: 550, color: 0xffffff, opacity: 0.8, driftRate: 0.005 }),
    motes: fly ? null : (over.motes || null),
    devils: fly ? 0 : (over.devils || 0),
    lightning: !!over.lightning,
    cloudSea: !!over.cloudSea,
    horizonGlow: over.horizonGlow ? { ...over.horizonGlow } : null,
  };
}

/** Unit direction from azimuth (deg, 0 = +Z south, clockwise) + elevation. */
export function sunPosition(azimuthDeg, elevationDeg, dist) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const r = dist != null ? dist : CGI_SUN_DIST;
  return {
    x: r * Math.cos(el) * Math.sin(az),
    y: r * Math.sin(el),
    z: r * Math.cos(el) * Math.cos(az),
  };
}

/**
 * The shared day/night law, reduced to what a sky needs: the real
 * sun direction, the night factor (0 = noon, 1 = deep night) and the
 * sun's elevation. Same clock, same place rule (Sydney fallback)
 * as every other world.
 */
export function cgiDayNight(nowMs, lat, lon) {
  const dn = dayNightFor(nowMs, lat, lon);
  return {
    sunVec: dn.sunVec,
    night: dn.palette.night,
    sunElevationDeg: dn.sun.elevationDeg,
    clock: dn.clock,
  };
}

/* ------------------------------------------------------------------ */
/* Scene builders                                                      */
/* ------------------------------------------------------------------ */

/* Gradient dome: vertex colours blend bottom -> horizon -> top.
 * The material colour is the day/night tint (white by day). */
function buildSkyDome(R, spec) {
  const geo = new R.SphereGeometry(CGI_SKY_RADIUS, 28, 16);
  const top = new R.Color(spec.sky.top);
  const hor = new R.Color(spec.sky.horizon);
  const bot = new R.Color(spec.sky.bottom);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new R.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / CGI_SKY_RADIUS + 1) / 2; // 0 bottom .. 1 top
    if (y01 < 0.5) c.copy(bot).lerp(hor, y01 * 2);
    else c.copy(hor).lerp(top, (y01 - 0.5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new R.BufferAttribute(colors, 3));
  const mat = new R.MeshBasicMaterial({
    vertexColors: true, side: R.BackSide, fog: false, depthWrite: false,
  });
  const dome = new R.Mesh(geo, mat);
  dome.name = 'cgi-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

/* One glowing sun sprite (bare). The lightning flash and the
 * horizon glow use this directly — they are glow only, never a sun. */
function buildGlowSprite(R, T, sun) {
  const tex = T.glowSprite();
  const mat = new R.SpriteMaterial({
    map: tex, color: sun.color, transparent: true, opacity: 1,
    blending: R.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sp = new R.Sprite(mat);
  sp.scale.set(sun.scale, sun.scale, 1);
  sp.userData.sunSpec = sun;
  return sp;
}

/* A solid white disc, for a sun's bright core — drawn once and
 * shared by every sun. Canvas-guarded: no document, no disc (the
 * glow still carries the sun). */
let discTextureCache = null;
function discTexture(R) {
  if (discTextureCache) return discTextureCache;
  if (typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
    discTextureCache = new R.CanvasTexture(cv);
    return discTextureCache;
  } catch {
    return null;
  }
}

/* One sun (house treatment, Merlin Nov 17): a bright core disc +
 * the glow halo in one group. The group IS the 'cgi-sun' the
 * tests count (the inner sprite wears no 'cgi-sun' name, so the
 * count stays one per sun); group.userData.sprite is the halo,
 * group.userData.disc the core — the per-frame loop moves the
 * group and fades both materials together. */
function buildSunSprite(R, T, sun) {
  const group = new R.Group();
  group.name = 'cgi-sun';
  const glow = buildGlowSprite(R, T, sun);
  glow.name = 'cgi-sun-glow';
  group.add(glow);
  const tex = discTexture(R);
  let disc = null;
  if (tex) {
    disc = new R.Sprite(new R.SpriteMaterial({
      map: tex, color: sun.color, transparent: true, opacity: 1,
      depthWrite: false, fog: false,
    }));
    disc.name = 'cgi-sun-core';
    disc.scale.set(sun.scale * 0.25, sun.scale * 0.25, 1);
    group.add(disc);
  }
  group.userData.sprite = glow;
  group.userData.disc = disc;
  group.userData.sunSpec = sun;
  return group;
}

/* Drifting cloud billboards on one ring; the whole group turns on
 * the real clock (cloudDriftAngle), a touch faster than the ground. */
function buildClouds(R, T, spec, seed) {
  const group = new R.Group();
  group.name = 'cgi-clouds';
  const cfg = spec.clouds;
  if (!cfg) return group;
  const tex = T.cloudTexture();
  const mat = new R.MeshBasicMaterial({
    map: tex, color: cfg.color, transparent: true, opacity: cfg.opacity,
    depthWrite: false, side: R.DoubleSide,
  });
  const rand = mulberry32(hashString(`starwars:clouds:${spec.id}:${seed}`));
  const geo = new R.PlaneGeometry(90, 36);
  for (let i = 0; i < cfg.count; i++) {
    const m = new R.Mesh(geo, mat);
    const a = rand() * Math.PI * 2;
    const r = cfg.radius * (0.55 + rand() * 0.45);
    m.position.set(Math.cos(a) * r, cfg.yMin + rand() * (cfg.yMax - cfg.yMin), Math.sin(a) * r);
    m.lookAt(0, m.position.y, 0);
    const s = 0.7 + rand() * 0.9;
    m.scale.set(s, s * (0.8 + rand() * 0.4), 1);
    m.rotation.z = (rand() - 0.5) * 0.2;
    m.name = 'cgi-cloud';
    group.add(m);
  }
  group.userData.driftRate = cfg.driftRate || 0.005;
  return group;
}

/* Walker-following mote field. Modes: drift (sine wander — dust,
 * pollen, mist, fireflies), fall (rain / snow / ash — wraps down),
 * rise (embers — wraps up). Positions are a pure function of nowMs. */
function makeMotes(R, spec, seed) {
  const cfg = spec.motes;
  const count = cfg.count;
  const rand = mulberry32(hashString(`starwars:motes:${spec.id}:${seed}`));
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rand() - 0.5) * cfg.area;
    base[i * 3 + 1] = rand() * cfg.height;
    base[i * 3 + 2] = (rand() - 0.5) * cfg.area;
    phase[i] = rand() * Math.PI * 2;
  }
  const geo = new R.BufferGeometry();
  geo.setAttribute('position', new R.BufferAttribute(new Float32Array(base), 3));
  geo.userData.moteBase = base;
  geo.userData.motePhase = phase;
  geo.userData.moteCount = count;
  geo.userData.moteCfg = cfg;
  const mat = new R.PointsMaterial({
    color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity,
    depthWrite: false, sizeAttenuation: true,
    map: getParticleTexture(cfg.sprite || 'glow') || undefined,
  });
  const points = new R.Points(geo, mat);
  points.name = 'cgi-motes';
  points.frustumCulled = false;
  return points;
}

function updateMotes(points, nowMs) {
  const geo = points.geometry;
  const base = geo.userData.moteBase;
  const phase = geo.userData.motePhase;
  const count = geo.userData.moteCount;
  const cfg = geo.userData.moteCfg;
  if (!base || !phase || !count || !cfg) return;
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  const wrap = (v, h) => ((v % h) + h) % h;
  for (let i = 0; i < count; i++) {
    const p = phase[i];
    if (cfg.mode === 'fall') {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.3 + p) * 0.8;
      arr[i * 3 + 1] = wrap(base[i * 3 + 1] - cfg.speed * t, cfg.height);
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.24 + p) * 0.8;
    } else if (cfg.mode === 'rise') {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.4 + p) * 1.1;
      arr[i * 3 + 1] = wrap(base[i * 3 + 1] + cfg.speed * t, cfg.height);
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.33 + p) * 1.1;
    } else {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.11 + p) * 0.55;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.07 + p * 1.7) * 0.28;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.09 + p) * 0.55;
    }
  }
  attr.needsUpdate = true;
}

/**
 * Build the whole CGI layer for one world.
 *
 * opts: { sunLight?, hemiLight? } — the zone's own lights, which the
 * updater drives with the real-clock day/night blend (walk worlds).
 * Returns { group, spec, update(t, dt, nowMs, observer), dispose }.
 * update() is a pure function of the clock + observer position.
 * dispose() is a no-op by design: zone.dispose() traverses the
 * group and frees every geometry / material / map in it (the cached
 * ground maps are not owned here — they live in cgiGroundMaps).
 */
export function buildCgi(R, def, T, opts) {
  const THREE = R3(R);
  const spec = worldCgiSpec(def);
  const options = opts || {};
  const seed = (def.seed >>> 0) || 1337;
  const group = new THREE.Group();
  group.name = 'cgi';
  const kind = spec.kind;
  try { requestDayNightPlace(); } catch (e) { /* Sydney fallback stands */ }

  const sunSprites = [];
  let dome = null;
  let clouds = null;
  let motes = null;
  const devils = [];
  let flashLight = null;
  let flashSprite = null;
  let cloudSeaGroup = null;

  if (kind === 'walk') {
    dome = buildSkyDome(THREE, spec);
    group.add(dome);

    for (const sun of spec.suns) {
      const sp = buildSunSprite(THREE, T, sun);
      group.add(sp);
      sunSprites.push(sp);
    }
    if (spec.horizonGlow) {
      // Glow only, not a sun — the bare glow sprite, never a
      // core-disc group.
      const glow = buildGlowSprite(THREE, T, {
        color: spec.horizonGlow.color, scale: spec.horizonGlow.scale,
      });
      const gp = sunPosition(spec.horizonGlow.azimuthDeg, spec.horizonGlow.elevationDeg, CGI_SUN_DIST);
      glow.position.set(gp.x, gp.y, gp.z);
      glow.name = 'cgi-horizon-glow';
      // ENDLESS: the glow's home offset from the observer — update()
      // re-seats it over the walker every frame (see the suns below).
      glow.userData.home = { x: gp.x, y: gp.y, z: gp.z };
      group.add(glow);
      sunSprites.push(glow); // rides the day/night dimming, never sets
      glow.userData.isGlow = true;
    }

    clouds = buildClouds(THREE, T, spec, seed);
    group.add(clouds);

    if (spec.motes) {
      motes = makeMotes(THREE, spec, seed);
      group.add(motes);
    }

    if (spec.devils > 0) {
      const devilGeo = new THREE.ConeGeometry(1, 1, 10, 1, true);
      for (let i = 0; i < spec.devils; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xc9a06a, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const cone = new THREE.Mesh(devilGeo, mat);
        cone.name = 'cgi-dust-devil';
        cone.userData.devilIndex = i;
        cone.visible = false;
        group.add(cone);
        devils.push(cone);
      }
    }

    if (spec.cloudSea) {
      cloudSeaGroup = new THREE.Group();
      cloudSeaGroup.name = 'cgi-cloud-sea';
      const seaTex = cloudLayerTexture('bespin-sea');
      const sea = new THREE.Mesh(
        new THREE.CircleGeometry(900, 48),
        new THREE.MeshBasicMaterial({
          map: seaTex, transparent: true, opacity: 0.9,
          depthWrite: false, fog: false,
        })
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = -10;
      cloudSeaGroup.add(sea);
      group.add(cloudSeaGroup);
    }

    if (spec.lightning) {
      flashLight = new THREE.DirectionalLight(0xb46bff, 0);
      flashLight.position.set(100, 200, 50);
      flashLight.name = 'cgi-lightning';
      group.add(flashLight);
      // The flash stays a bare glow sprite (never a sun group).
      flashSprite = buildGlowSprite(THREE, T, { color: 0xc9a0ff, scale: 420 });
      flashSprite.position.set(0, 320, -500);
      flashSprite.material.opacity = 0;
      flashSprite.name = 'cgi-lightning-flash';
      group.add(flashSprite);
    }
  } else {
    /* Fly worlds: space. No dome (the page's starfield is the sky),
     * one fixed sun sprite far out — the star the debris orbits. */
    for (const sun of spec.suns) {
      const sp = buildSunSprite(THREE, T, sun);
      const p = sunPosition(sun.azimuthDeg, sun.elevationDeg, CGI_SUN_DIST);
      sp.position.set(p.x, p.y, p.z);
      group.add(sp);
      sunSprites.push(sp);
      sp.userData.fixed = true;
    }
  }

  /* --- per-frame state, all pure functions of the clock --- */
  let lastDnMs = 0;
  let lastDn = null;

  function refreshDayNight(nowMs) {
    if (nowMs - lastDnMs < CGI_DAYNIGHT_THROTTLE_MS && lastDn) return lastDn;
    lastDnMs = nowMs;
    try {
      const place = getDayNightPlace();
      lastDn = cgiDayNight(nowMs, place.lat, place.lon);
    } catch (e) {
      lastDn = { sunVec: { x: 0, y: 1, z: 0 }, night: 0, sunElevationDeg: 60, clock: '' };
    }
    return lastDn;
  }

  function update(t, dt, nowMs, observer) {
    const now = nowMs != null ? nowMs : Date.now();
    const obs = observer || { x: 0, z: 0 };
    if (kind === 'walk') {
      const dn = refreshDayNight(now);
      const dayF = 1 - dn.night;
      const sunUp = dn.sunElevationDeg > -2;
      const sv = dn.sunVec || { x: 0, y: 1, z: 0 };
      /* Primary sun rides the real sun vector; the twin stays glued
       * to it — 5 deg around, a touch lower — so the pair crosses
       * the sky as one and sets as one. The two discs (150 m and
       * 110 m across at 950 m) sit near-touching: the binary-sunset
       * look, not two suns in different quarters of the sky. */
      /* ENDLESS (Merlin, Nov 18, 2026): the sky travels with the
       * walker — the dome, the suns and the glow are re-seated over
       * the observer every frame, so the sun never slides across
       * the sky and the walker never walks out of the dome. (The
       * motes and dust devils already follow the observer below;
       * the clouds and the cloud sea join them.) A dome fixed at
       * the origin would end 1100 m out — the walker would roam
       * past the edge of the sky itself. */
      if (dome) dome.position.set(obs.x, 0, obs.z);
      sunSprites.forEach((sp, i) => {
        if (sp.userData.isGlow) {
          // The horizon glow is a bare sprite — its own material.
          sp.material.opacity = 0.25 + 0.65 * dn.night;
          const home = sp.userData.home || { x: 0, y: 0, z: 0 };
          sp.position.set(obs.x + home.x, home.y, obs.z + home.z);
          return;
        }
        if (i === 0) {
          sp.position.set(obs.x + sv.x * CGI_SUN_DIST, sv.y * CGI_SUN_DIST, obs.z + sv.z * CGI_SUN_DIST);
        } else {
          /* Twin: step 5 deg sideways along the sun's path — in the
           * horizontal direction perpendicular to the sun's azimuth
           * — then a touch lower. A fixed ANGLE, so the pair reads
           * at any elevation: a yaw rotation collapses to nothing
           * when the sun is near-overhead at noon (measured: the
           * two discs merged into one 30 m blob), while this holds
           * ~100 m apart at 950 m all day. The discs are 150 m and
           * 110 m across, so they sit near-touching — the
           * binary-sunset look. */
          const hl = Math.hypot(sv.x, sv.z);
          const px = hl > 0.05 ? -sv.z / hl : 1;
          const pz = hl > 0.05 ? sv.x / hl : 0;
          const th = 0.09;
          const cx = sv.x * Math.cos(th) + px * Math.sin(th);
          const cy = sv.y * Math.cos(th);
          const cz = sv.z * Math.cos(th) + pz * Math.sin(th);
          const dy = cy - 0.02;
          const len = Math.hypot(cx, dy, cz);
          sp.position.set(
            obs.x + (cx / len) * CGI_SUN_DIST,
            (dy / len) * CGI_SUN_DIST,
            obs.z + (cz / len) * CGI_SUN_DIST
          );
        }
        sp.visible = sunUp;
        // Core + halo fade together: the group carries both
        // (userData.sprite / userData.disc).
        const fade = sunUp ? 1 : 0;
        sp.userData.sprite.material.opacity = fade;
        if (sp.userData.disc) sp.userData.disc.material.opacity = fade;
      });
      if (dome) {
        /* The dome keeps its own gradient; the material colour is
         * the night tint (new-earth's law: white at noon, dark
         * blue-grey at deep night). */
        dome.material.color.setRGB(
          0.08 + 0.92 * dayF, 0.10 + 0.90 * dayF, 0.22 + 0.78 * dayF
        );
      }
      /* The zone's lights breathe with the same cycle. */
      if (options.sunLight) {
        options.sunLight.position.set(sv.x * 100, Math.max(sv.y, 0.08) * 100, sv.z * 100);
        options.sunLight.intensity = 1.25 * (0.18 + 0.82 * dayF);
        options.sunLight.color.setRGB(
          lerp(0.55, 1.0, dayF), lerp(0.65, 0.95, dayF), lerp(0.9, 0.87, dayF)
        );
      }
      if (options.hemiLight) options.hemiLight.intensity = 0.85 * (0.25 + 0.75 * dayF);
      if (clouds && clouds.userData.driftRate) {
        clouds.rotation.y = cloudDriftAngle(clouds.userData.driftRate, now);
        clouds.position.set(obs.x, 0, obs.z);
      }
      if (motes) {
        updateMotes(motes, now);
        motes.position.set(obs.x, 0, obs.z);
      }
      for (const cone of devils) {
        const st = devilFor(cone.userData.devilIndex, now, 120);
        cone.visible = st.alive;
        if (st.alive) {
          cone.position.set(obs.x + st.x, st.height / 2, obs.z + st.z);
          cone.scale.set(st.radius, st.height, st.radius);
          cone.rotation.y = st.spin;
          cone.material.opacity = 0.32 * st.opacity;
        }
      }
      if (cloudSeaGroup) {
        cloudSeaGroup.rotation.y = spinAngle(0.002, now);
        cloudSeaGroup.position.set(obs.x, 0, obs.z);
      }
      if (flashLight || flashSprite) {
        const flash = lightningFlash(now, 'exegol-storm', 9000);
        if (flashLight) flashLight.intensity = flash * 2.5;
        if (flashSprite) {
          flashSprite.material.opacity = flash * 0.8;
          flashSprite.position.set(obs.x, 320, obs.z - 500);
        }
      }
    } else {
      /* Fly worlds: the fixed sun never sets; clouds/motes don't exist. */
      void t; void dt;
    }
  }

  function dispose() {
    /* No-op by design — see the header on buildCgi: zone.dispose()
     * traverses this group and frees every geometry / material /
     * map in it. The cached ground maps are not owned here. */
  }

  return { group, spec, update, dispose };
}

