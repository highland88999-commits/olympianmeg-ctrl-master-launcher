/**
 * lib/sun-base/cgi.js — procedural CGI makeover for the SUN BASE interior
 * (Merlin, Nov 15, 2026).
 *
 * WHAT IT WAS: the inside of the sun base was flat single-colour boxes
 * from the shared interior factory (lib/earth2/interior-room.js):
 * walls #8d8578, floor #5d5348, ceiling #6b6257, trim #3a332a, flat
 * emissive window planes, a door light-spill plane, one point light.
 * No texture, no beams, no furniture, no dust, nothing moving — a
 * bare diorama the shrunken user (0.2x, eye 0.34 m) reads as a vast
 * empty hall.
 *
 * WHAT THIS ADDS — as NEW meshes only, in a group of its own:
 *   1. TEXTURED MATERIALS — the house CGI idiom (lib/planet-cgi/
 *      textures.js, lib/mars2/textures.js): seeded PRNG + value noise
 *      painting colour + bump maps as THREE.DataTextures, 256x256,
 *      cached per kind+seed, deterministic so every phone paints the
 *      same room. Kinds: plankWood, thatch, hearthStone, wovenRug,
 *      sackCloth.
 *   2. TIMBER FRAME — corner posts, wall plates and cross-beams in
 *      plank wood, plus low wainscot panels proud of the side/back
 *      walls (never the door wall — the doorway stays clear).
 *   3. LIVED-IN PROPS, per interior: farmhouse — stone hearth with a
 *      glowing fire, plank table + stools, crates; barn — hearth, hay
 *      bales, workbench; windmill — sacks and a slow-turning wooden
 *      gear on the back wall. A woven rug lies on the floor.
 *   4. WARM ATMOSPHERE — hanging lanterns whose emissive cores
 *      flicker on the real clock, a fire-glow plane, slanted light
 *      shafts from the farmhouse windows, and a drifting dust-mote
 *      field (the planet-CGI makeDustField, sized to the room).
 *
 * CONFLICT RULE — the bright-gold wrap: the coloured-wraps worker is
 * concurrently wrapping the factory's STRUCTURAL surfaces (walls,
 * floor, ceiling, trim) in bright gold, applied in
 * components/SunBaseScene.jsx. This module NEVER touches those
 * surfaces: it does not re-material any factory mesh, never imports
 * the wrap code, never calls the wrap applier.
 * Every mesh here is built fresh in buildSunBaseCgi and tagged
 * userData.sunBaseCgi = true. The rug lies ON the gold floor (a new
 * plane 12 mm above it); the wainscot stands PROUD of the gold walls.
 *
 * NO NEW REAL LIGHTS — the standing rule. Warmth comes from emissive
 * materials and additive glow planes only; the scene's own lights are
 * untouched. Props are visual only, like Earth 2's walk-through
 * trees and rocks: the walker can pass through a hay bale — adding
 * colliders to the CGI props is a follow-up, Merlin's call.
 *
 * PURE WHERE IT CAN BE: sunBaseCgiSpec(spec) is data only (no THREE,
 * no DOM) — the test suite pins every interior through it.
 * lanternFlicker / fireGlow / gearAngle are pure functions of the
 * device clock (the planet-CGI motion idiom): same instant, same
 * flicker on every phone. buildSunBaseCgi(spec) is the scene
 * builder; updateSunBaseCgi(group, nowMs) is its per-frame step.
 *
 * Procedural CGI only — no Tripo, no network fetches. Entry (tap the
 * sun / fly through), the 0.2x scale, the 3.2 m/s stride and the
 * build system are untouched; this group renders alongside them.
 */

import * as THREE from 'three';
import { hashString, valueNoise } from '../earth4/creature-textures.js';
import { PLANET_CGI_EPOCH_MS, makeDustField, spinAngle, updateDustField } from '../planet-cgi/motion.js';

export { PLANET_CGI_EPOCH_MS as SUN_BASE_CGI_EPOCH_MS };
export const SUN_BASE_TEXTURE_SIZE = 256;

// Roughness + bump strength per kind. bumpScale is in texture
// space — tuned by eye; the phone check is the real verdict.
export const SUN_BASE_KINDS = {
  plankWood: { roughness: 0.8, bumpScale: 0.04, metalness: 0.0 },
  thatch: { roughness: 0.95, bumpScale: 0.07, metalness: 0.0 },
  hearthStone: { roughness: 0.9, bumpScale: 0.06, metalness: 0.05 },
  wovenRug: { roughness: 0.95, bumpScale: 0.03, metalness: 0.0 },
  sackCloth: { roughness: 1.0, bumpScale: 0.05, metalness: 0.0 },
};

export const SUN_BASE_CGI_KINDS = Object.keys(SUN_BASE_KINDS);

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
  plankWood(u, v, n) {
    // Warm oak floorboards/beams: plank bands across v (so the
    // grain runs along a beam's length), grain streaks along u,
    // dark gaps between planks, a rare knot.
    const planks = 6;
    const pv = (v * planks) % 1;
    const gap = pv < 0.045 || pv > 0.955 ? 1 : 0;
    const grain = fbm(u * 34, v * 6, n.seed);
    const streak = valueNoise(u * 120, v * 18, n.seed + 5);
    const knot = fbm(u * 3 + 11, v * 3 + 4, n.seed + 9);
    const knotted = knot > 0.78 ? 1 : 0;
    let l = 168 + (grain - 0.5) * 46 + (streak - 0.5) * 22;
    let r = l * 1.06;
    let g = l * 0.78;
    let b = l * 0.52;
    if (gap) { r *= 0.45; g *= 0.45; b *= 0.45; }
    if (knotted) { r *= 0.62; g *= 0.55; b *= 0.5; }
    const bump = 128 + (grain - 0.5) * 36 + (streak - 0.5) * 20 - gap * 55 - knotted * 30;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  thatch(u, v, n) {
    // Golden straw: fine vertical strands, layered horizontal
    // courses, pale sun-bleached tips.
    const strand = valueNoise(u * 220, v * 26, n.seed);
    const course = fbm(u * 4, v * 14, n.seed + 3);
    const tip = fbm(u * 9, v * 9, n.seed + 7);
    let r = 196 + (strand - 0.5) * 44 + (course - 0.5) * 30 + (tip > 0.72 ? 22 : 0);
    let g = 158 + (strand - 0.5) * 38 + (course - 0.5) * 26 + (tip > 0.72 ? 18 : 0);
    let b = 92 + (strand - 0.5) * 30 + (course - 0.5) * 18 + (tip > 0.72 ? 10 : 0);
    const bump = 128 + (strand - 0.5) * 70 + (course - 0.5) * 40;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  hearthStone(u, v, n) {
    // Warm grey stone blocks: a staggered block grid with mortar
    // joints, mottled faces, soot darkening low down.
    const cols = 5;
    const rows = 3;
    const row = Math.floor(v * rows);
    const off = (row % 2) * 0.5;
    const cu = (((u + off / cols) * cols) % 1);
    const cv = (v * rows) % 1;
    const joint = (cu < 0.05 || cu > 0.95 || cv < 0.06 || cv > 0.94) ? 1 : 0;
    const mottle = fbm(u * 9, v * 9, n.seed);
    const grain = valueNoise(u * 180, v * 180, n.seed);
    const soot = clamp01((0.35 - v) * 1.6) * fbm(u * 6, v * 6, n.seed + 4);
    let l = 132 + (mottle - 0.5) * 44 + (grain - 0.5) * 20 - joint * 52 - soot * 46;
    const bump = 128 + (mottle - 0.5) * 50 - joint * 60 + (grain - 0.5) * 24;
    return { r: clamp255(l * 1.02), g: clamp255(l * 0.96), b: clamp255(l * 0.88), bump: clamp255(bump) };
  },

  wovenRug(u, v, n) {
    // Deep red woven rug: a border band, a diamond motif field,
    // and a visible weave grain. The border reads at the rug's
    // edges (u/v near 0 or 1).
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const border = edge < 0.09 ? 1 : 0;
    const inner = edge < 0.13 && edge >= 0.09 ? 1 : 0;
    const du = Math.abs(u - 0.5);
    const dv = Math.abs(v - 0.5);
    const diamond = (Math.abs(du * 3 + dv * 2) % 0.5) < 0.05 ? 1 : 0;
    const weave = valueNoise(u * 160, v * 160, n.seed);
    const weaveLine = ((u * 160) % 1 < 0.12 || (v * 160) % 1 < 0.12) ? 1 : 0;
    let r = 148;
    let g = 52;
    let b = 44;
    if (border) { r = 96; g = 40; b = 34; }
    if (inner) { r = 214; g = 164; b = 92; }
    if (diamond) { r = 214; g = 164; b = 92; }
    r += (weave - 0.5) * 26 - weaveLine * 14;
    g += (weave - 0.5) * 18 - weaveLine * 10;
    b += (weave - 0.5) * 16 - weaveLine * 8;
    const bump = 128 + (weave - 0.5) * 30 - weaveLine * 18;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), bump: clamp255(bump) };
  },

  sackCloth(u, v, n) {
    // Coarse burlap: a crosshatch weave, dusty, frayed pale.
    const warp = (u * 90) % 1 < 0.5 ? 1 : 0;
    const weft = (v * 90) % 1 < 0.5 ? 1 : 0;
    const cross = warp ^ weft ? 1 : 0;
    const dust = fbm(u * 7, v * 7, n.seed);
    const grain = valueNoise(u * 200, v * 200, n.seed);
    let l = 178 + cross * 18 - dust * 34 + (grain - 0.5) * 18;
    const bump = 128 + cross * 44 - (1 - cross) * 30 + (grain - 0.5) * 22;
    return { r: clamp255(l * 1.04), g: clamp255(l * 0.92), b: clamp255(l * 0.72), bump: clamp255(bump) };
  },
};

// ── caches ─────────────────────────────────────────────────────────

const textureCache = new Map(); // `${kind}|${seed}` -> { map, bumpMap, roughness, bumpScale, metalness }
const materialCache = new Map(); // `${kind}|${seed}|${tintHex}` -> material
let textureBytes = 0;

export function sunBaseTextureStats() {
  return { textures: textureCache.size, materials: materialCache.size, bytes: textureBytes };
}

/**
 * Colour + bump maps for one CGI kind, seeded so the pattern is
 * stable per interior. Unknown kinds fall back to plankWood.
 */
export function sunBaseMaps(kind, seed) {
  const k = SUN_BASE_KINDS[kind] ? kind : 'plankWood';
  const key = `${k}|${seed}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const gen = GENERATORS[k];
  const seedInt = hashString(`sun-base:${k}:${seed}`);
  const W = SUN_BASE_TEXTURE_SIZE;
  const H = SUN_BASE_TEXTURE_SIZE;
  const color = new Uint8Array(W * H * 4);
  const bump = new Uint8Array(W * H);
  const n = { seed: seedInt };
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
  const style = SUN_BASE_KINDS[k];
  const out = { map, bumpMap, roughness: style.roughness, bumpScale: style.bumpScale, metalness: style.metalness };
  textureCache.set(key, out);
  textureBytes += W * H * 4 + W * H;
  return out;
}

/**
 * A shared MeshStandardMaterial for one (kind, seed, tint): the
 * pattern maps are shared per kind+seed, the tint multiplies the
 * map (white by default — the maps carry their own hues).
 * Shared materials are never disposed by callers (userData.shared).
 */
export function materialForSunBase(kind, seed, tint = '#ffffff') {
  const k = SUN_BASE_KINDS[kind] ? kind : 'plankWood';
  const hex = tint instanceof THREE.Color ? `#${tint.getHexString()}` : String(tint);
  const key = `${k}|${seed}|${hex}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const maps = sunBaseMaps(k, seed);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: maps.metalness,
    color: tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint),
  });
  m.userData.shared = true;
  materialCache.set(key, m);
  return m;
}

// ── pure spec ──────────────────────────────────────────────────────

/**
 * The CGI spec for one interior-room spec (lib/earth2/fittings.js
 * interiorSpecForAnchor, re-based by lib/sun-base-spec.js): the
 * data-only plan the builder follows. Null when the spec is not
 * one of the three sun-base interiors (unknown class, missing
 * dimensions). Room metres throughout — the builder works in the
 * room's own metres, the walker reads them at 0.2x.
 *
 * Worker's-choice numbers (Merlin gave no numbers — flag if he
 * wants them tuned): timber frame at 2.4 m (the room's own scale
 * reads it as a 12 m frame to the shrunken eye), two lanterns,
 * dust 140–180 motes.
 */
export function sunBaseCgiSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const cls = spec.class;
  if (cls !== 'house' && cls !== 'barn' && cls !== 'windmill') return null;
  const W = Number(spec.widthM);
  const D = Number(spec.depthM);
  const H = Number(spec.heightM);
  if (!Number.isFinite(W) || !Number.isFinite(D) || !Number.isFinite(H) || W <= 0 || D <= 0 || H <= 0) return null;
  // The windmill is an open structure: the factory caps its ceiling
  // at 2.8 m (lib/earth2/interior-room.js) — the frame hangs from
  // the real ceiling, not the 10 m shell.
  const effH = spec.openStructure ? Math.min(2.8, H) : H;
  const innerW = W * 0.94;
  const innerD = D * 0.94;
  const frameY = Math.min(2.4, effH - 0.35);
  return {
    class: cls,
    widthM: W,
    depthM: D,
    heightM: H,
    effHeightM: effH,
    innerW,
    innerD,
    lightColor: spec.lightColor || '#ffb46b',
    windows: !!spec.windows,
    frameY,
    rug: { w: innerW * 0.38, d: innerD * 0.3 },
    lanterns: [
      { x: -innerW * 0.18, z: 0 },
      { x: innerW * 0.18, z: 0 },
    ],
    hearth: cls === 'house' || cls === 'barn',
    table: cls === 'house',
    crates: cls === 'house' ? 2 : 0,
    hayBales: cls === 'barn' ? 3 : 0,
    workbench: cls === 'barn',
    sacks: cls === 'windmill' ? 3 : 0,
    gear: cls === 'windmill',
    windowShafts: !!spec.windows,
    dust: {
      count: cls === 'barn' ? 180 : cls === 'windmill' ? 150 : 140,
      width: innerW * 0.9,
      depth: innerD * 0.9,
      height: Math.max(0.6, Math.min(effH, 4) - 0.3),
    },
  };
}

// ── pure motion (device clock — the planet-CGI idiom) ─────────────

/**
 * Lantern flicker 0.62..1.0 at `nowMs`: a warm breathing wobble —
 * two slow sines on a seeded phase, so each lantern flickers on
 * its own rhythm but every phone agrees at the same instant.
 * Deterministic: same seed + same instant = same value.
 */
export function lanternFlicker(nowMs = Date.now(), seed = 'lantern') {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const phase = (hashString(`sun-base:flicker:${seed}`) % 1000) / 1000 * Math.PI * 2;
  const v = 0.81
    + 0.11 * Math.sin(t * 7.3 + phase)
    + 0.06 * Math.sin(t * 13.1 + phase * 1.7);
  return Math.max(0.62, Math.min(1, v));
}

/** Fire-glow opacity for the hearth plane: the fire breathes with its own flicker. */
export function fireGlow(nowMs = Date.now()) {
  return 0.3 + 0.22 * lanternFlicker(nowMs, 'hearth');
}

/** Windmill gear angle (rad): a slow steady turn, 0.12 rad/s. */
export function gearAngle(nowMs = Date.now()) {
  return spinAngle(0.12, nowMs);
}

// ── scene builder ──────────────────────────────────────────────────

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.userData.sunBaseCgi = true;
  return m;
}

function tag(obj, kind) {
  obj.userData.sunBaseCgi = true;
  if (kind) obj.userData.cgiKind = kind;
  return obj;
}

/**
 * Build the CGI overlay group for one interior spec. Returns null
 * when the spec is not a sun-base interior. Every mesh is NEW —
 * nothing here re-materials, moves or hides a factory mesh, so the
 * bright-gold wrap on the structural surfaces is untouched. The
 * group carries no lights of any kind (emissive + additive only).
 */
export function buildSunBaseCgi(spec) {
  const cgi = sunBaseCgiSpec(spec);
  if (!cgi) return null;
  const seed = `sun-base:${cgi.class}`;
  const group = new THREE.Group();
  group.userData.sunBaseCgi = true;
  const W = cgi.innerW;
  const D = cgi.innerD;
  const wallT = Math.min(0.22, W * 0.04);
  const innerFaceX = W / 2 - wallT / 2;
  const innerFaceZ = D / 2 - wallT / 2;
  const wood = materialForSunBase('plankWood', seed);
  const stone = materialForSunBase('hearthStone', seed);
  const thatch = materialForSunBase('thatch', seed);
  const rugMat = materialForSunBase('wovenRug', seed);
  const sack = materialForSunBase('sackCloth', seed);

  // ── Timber frame: corner posts, wall plates, cross-beams ──
  const postX = W / 2 - 0.22;
  const postZ = D / 2 - 0.22;
  const fy = cgi.frameY;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(box(0.14, fy, 0.14, wood, sx * postX, fy / 2, sz * postZ));
    }
  }
  for (const sz of [-1, 1]) {
    group.add(box(W - 0.3, 0.14, 0.14, wood, 0, fy, sz * postZ));
  }
  for (const sx of [-1, 1]) {
    group.add(box(0.14, 0.14, D - 0.3, wood, sx * postX, fy, 0));
  }
  for (const sz of [-0.18, 0.18]) {
    group.add(box(W - 0.3, 0.12, 0.12, wood, 0, fy, sz * D));
  }

  // ── Wainscot: low timber panels proud of the side + back walls ──
  // (never the +Z door wall — the doorway and its gold trim stay clear).
  const wainsH = 0.55;
  const wainsY = wainsH / 2;
  for (const sx of [-1, 1]) {
    group.add(box(0.03, wainsH, D - 0.3, wood, sx * (innerFaceX - 0.02), wainsY, 0));
  }
  group.add(box(W - 0.3, wainsH, 0.03, wood, 0, wainsY, -(innerFaceZ - 0.02)));

  // ── Woven rug, lying on the floor (12 mm above the gold floor) ──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(cgi.rug.w, cgi.rug.d), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 0.1);
  tag(rug, 'rug');
  group.add(rug);

  // ── Hearth (farmhouse + barn): stone breast, dark firebox, glow ──
  if (cgi.hearth) {
    const hz = -(innerFaceZ - 0.02) + 0.19;
    group.add(box(1.7, 1.15, 0.38, stone, 0, 0.575, hz));
    group.add(box(1.9, 0.1, 0.5, wood, 0, 1.2, hz));
    // The fire opening sits ON the stone's front face (the stone
    // front is hz + 0.19): a dark recess, the glow plane, embers.
    const firebox = box(0.9, 0.55, 0.06,
      new THREE.MeshStandardMaterial({ color: '#17100a', roughness: 1 }), 0, 0.32, hz + 0.2);
    tag(firebox, 'firebox');
    group.add(firebox);
    const fire = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.42),
      new THREE.MeshBasicMaterial({
        color: '#ff8c2e', transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    fire.position.set(0, 0.32, hz + 0.24);
    fire.userData.sunBaseCgi = true;
    fire.userData.cgiFlicker = 'fire';
    group.add(fire);
    const ember = box(0.5, 0.08, 0.08,
      new THREE.MeshStandardMaterial({
        color: '#2a1408', emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 1.6, roughness: 0.9,
      }), 0, 0.1, hz + 0.23);
    ember.userData.cgiFlicker = 'ember';
    group.add(ember);
  }

  // ── Lanterns: hung from the cross-beams, emissive amber cores ──
  cgi.lanterns.forEach((L, i) => {
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.9 }),
    );
    cord.position.set(L.x, fy - 0.15, L.z);
    tag(cord, 'lantern-cord');
    group.add(cord);
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: '#2a2018', metalness: 0.6, roughness: 0.45 }),
    );
    cage.position.set(L.x, fy - 0.42, L.z);
    tag(cage, 'lantern-cage');
    group.add(cage);
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.12, 0.09),
      new THREE.MeshStandardMaterial({
        color: '#3a2a12', emissive: new THREE.Color('#ffb46b'), emissiveIntensity: 1.5, roughness: 0.6,
      }),
    );
    core.position.set(L.x, fy - 0.42, L.z);
    core.userData.sunBaseCgi = true;
    core.userData.cgiFlicker = 'lantern';
    core.userData.cgiSeed = `lantern:${i}`;
    group.add(core);
  });

  // ── Farmhouse: plank table + stools, crates ──
  if (cgi.table) {
    const tx = W * 0.18;
    const tz = -D * 0.08;
    group.add(box(1.6, 0.08, 0.9, wood, tx, 0.76, tz));
    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-0.35, 0.35]) {
        group.add(box(0.09, 0.72, 0.09, wood, tx + sx, 0.36, tz + sz));
      }
    }
    for (const sx of [-1, 1]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), wood);
      stool.position.set(tx + sx * 1.15, 0.42, tz);
      tag(stool, 'stool');
      group.add(stool);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 6), wood);
      leg.position.set(tx + sx * 1.15, 0.19, tz);
      tag(leg, 'stool-leg');
      group.add(leg);
    }
  }
  if (cgi.crates) {
    group.add(box(0.6, 0.6, 0.6, wood, W / 2 - 0.75, 0.3, -D / 2 + 0.75));
    const crate2 = box(0.45, 0.45, 0.45, wood, W / 2 - 0.7, 0.825, -D / 2 + 0.72);
    crate2.rotation.y = 0.35;
    group.add(crate2);
  }

  // ── Barn: hay bales + workbench ──
  if (cgi.hayBales) {
    const bx = -W / 2 + 0.85;
    const bz = -D / 2 + 0.85;
    group.add(box(0.95, 0.55, 0.6, thatch, bx, 0.275, bz));
    group.add(box(0.95, 0.55, 0.6, thatch, bx + 0.1, 0.275, bz + 0.7));
    const top = box(0.9, 0.5, 0.55, thatch, bx + 0.05, 0.8, bz + 0.35);
    top.rotation.y = 0.2;
    group.add(top);
  }
  if (cgi.workbench) {
    const wx = -W / 2 + 0.45;
    group.add(box(0.6, 0.1, 2.2, wood, wx, 0.82, 0.4));
    for (const sz of [-0.6, 1.4]) {
      group.add(box(0.5, 0.77, 0.1, wood, wx, 0.385, sz));
    }
  }

  // ── Windmill: sacks + the slow-turning gear on the back wall ──
  if (cgi.sacks) {
    const sx0 = W / 2 - 0.7;
    const sz0 = D * 0.12;
    for (let i = 0; i < cgi.sacks; i++) {
      const s = box(0.55, 0.42, 0.55, sack, sx0, 0.21 + (i === 2 ? 0.42 : 0), sz0 + (i - 1) * 0.62);
      s.rotation.y = (i - 1) * 0.3;
      if (i === 2) s.position.x = sx0 - 0.05;
      group.add(s);
    }
  }
  if (cgi.gear) {
    const gear = new THREE.Group();
    gear.position.set(W * 0.2, 1.55, -(innerFaceZ - 0.02) + 0.14);
    gear.userData.sunBaseCgi = true;
    gear.userData.cgiGear = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 28), wood);
    tag(rim, 'gear-rim');
    gear.add(rim);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.52, 0.06), wood);
      spoke.rotation.z = (i * Math.PI) / 8;
      tag(spoke, 'gear-spoke');
      gear.add(spoke);
    }
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: '#2a2018', metalness: 0.6, roughness: 0.45 }),
    );
    hub.rotation.x = Math.PI / 2;
    tag(hub, 'gear-hub');
    gear.add(hub);
    group.add(gear);
  }

  // ── Window light shafts (farmhouse only — the only windows) ──
  if (cgi.windowShafts) {
    const shaftMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cgi.lightColor), transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const sx of [-1, 1]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), shaftMat);
      shaft.rotation.order = 'YXZ';
      shaft.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      shaft.rotation.z = sx * 0.18;
      shaft.position.set(sx * (W / 2 - 0.45), 0.95, D * 0.12);
      shaft.userData.sunBaseCgi = true;
      shaft.userData.cgiKind = 'window-shaft';
      group.add(shaft);
    }
  }

  // ── Dust motes, drifting on the real clock ──
  const dust = makeDustField({
    count: cgi.dust.count,
    width: cgi.dust.width,
    height: cgi.dust.height,
    depth: cgi.dust.depth,
    yBase: 0.05,
    seed: `sun-base:${cgi.class}`,
    color: '#ffd9a0',
    size: 0.05,
    opacity: 0.5,
  });
  dust.userData.sunBaseCgi = true;
  group.add(dust);

  return group;
}

/**
 * Per-frame step: dust drifts, lanterns + fire breathe, the
 * windmill gear turns. Pure function of the device clock — the
 * same instant shows the same room on every phone.
 */
export function updateSunBaseCgi(group, nowMs = Date.now()) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.userData && obj.userData.isDustField) {
      updateDustField(obj, nowMs);
      return;
    }
    if (obj.userData && obj.userData.cgiGear) {
      obj.rotation.z = gearAngle(nowMs);
      return;
    }
    if (!obj.material || !obj.userData || !obj.userData.cgiFlicker) return;
    const kind = obj.userData.cgiFlicker;
    if (kind === 'lantern') {
      obj.material.emissiveIntensity = 1.5 * lanternFlicker(nowMs, obj.userData.cgiSeed || 'lantern');
    } else if (kind === 'ember') {
      obj.material.emissiveIntensity = 1.6 * lanternFlicker(nowMs, 'hearth');
    } else if (kind === 'fire') {
      obj.material.opacity = fireGlow(nowMs);
    }
  });
}

/**
 * Dispose a group built by buildSunBaseCgi: geometries and the
 * fresh (non-shared) materials go; shared CGI materials
 * (userData.shared) and shared particle textures are never
 * disposed — the cache owns them.
 */
export function disposeSunBaseCgi(group) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    mats.forEach((m) => {
      if (m && !m.userData.shared && m.dispose) m.dispose();
    });
  });
}
