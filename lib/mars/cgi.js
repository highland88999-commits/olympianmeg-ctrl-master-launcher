// lib/mars/cgi.js — Mars CGI helpers (Merlin, Nov 14, 2026).
//
// Pure, node-safe helpers behind the Mars CGI pass ("run CGI through
// all our planets, minus Earth 1 & 2"): the seeded terrain material
// (marsRegolith texture MULTIPLIED over the seeded vertex colours —
// three.js multiplies map × vertexColor × color, so the ground keeps
// its seeded rust bands and gains dunes + bump), the Olympus Mons
// landmark site, and the soft sprite textures for haze + dust devils.
// No React, no DOM — safe to import from tests and the scene.
//
// What this does NOT do, on purpose: no poles. Mars here is a seeded
// 180×180 m regional patch, not a globe — there is no far north or
// south to cap. The pale ice lives on the Mons summit instead (see
// monsCapMaterial). No terrain heights change: the Mons is a visual
// mesh standing on the ground, never a getTerrainHeight change.

import * as THREE from 'three';
import { SeedRNG, getTerrainHeight } from './engine.js';
import { planetMaps, materialForPlanet } from '../planet-cgi/textures.js';
import { hashString, mulberry32 } from '../earth4/creature-textures.js';

// Terrain texture tiling: 180 m of ground / 6 repeats = one 30 m
// dune tile. The cloned textures keep the shared cache pristine
// (repeat lives on the clone, never on the cached original).
export const MARS_TERRAIN_TEXTURE_REPEAT = 6;

// Dust devils: 3 columns, seeded across the 180 m patch (area 120
// keeps them on the ground; devilFor adds up to +14 m downwind drift).
export const DUST_DEVIL_COUNT = 3;
export const DUST_DEVIL_AREA = 120;

// Dust-storm haze: 5 large soft sprites breathing slowly.
export const HAZE_COUNT = 5;

// Olympus Mons landmark: a broad shield cone with a pale summit cap,
// at a seeded spot on the outer rise (radius 70–78 — clear of the
// three basins and the main play area, inside the walkable 88 m).
// Visual only: the walker still stands on getTerrainHeight, never
// on the cone.
export const MONS_HEIGHT = 13;
export const MONS_RADIUS = 19;
export const MONS_CAP_HEIGHT = 4;
// Sunk into the ground so the base never floats on a slope; the
// terrain may poke through the lower flank, which reads as the
// mountain emerging from the ground.
export const MONS_SINK = 1.5;

/** Seeded Olympus Mons site for one profile. Deterministic per seed. */
export function monsSite(profile) {
  const rng = new SeedRNG(profile.seed + '-MONS');
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(70, 78);
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;
  const y = getTerrainHeight(x, z, profile);
  // The cap cone's apex must sit just proud of the main apex, and
  // its base just wider than the slope at that height, so the pale
  // cap covers the tip instead of floating inside it.
  const capRadius = MONS_RADIUS * (MONS_CAP_HEIGHT / MONS_HEIGHT);
  return {
    x,
    y,
    z,
    dist,
    height: MONS_HEIGHT,
    radius: MONS_RADIUS,
    sink: MONS_SINK,
    capHeight: MONS_CAP_HEIGHT,
    capRadius,
    // Cap centre: apex at main apex + 0.15, so the tip is covered.
    capY: MONS_HEIGHT - MONS_CAP_HEIGHT / 2 + 0.15,
  };
}

/** Shared rust-red slope material for the Mons (cached per seed). */
export function monsSlopeMaterial(profile) {
  return materialForPlanet('marsRegolith', profile.seed + '-mons');
}

/** Shared pale ice-cap material for the Mons summit (cached per seed). */
export function monsCapMaterial(profile) {
  return materialForPlanet('iceCap', profile.seed + '-mons-cap');
}

/**
 * The terrain material: marsRegolith map + bump, cloned so the
 * repeat stays local, over vertexColors. three.js multiplies the
 * map texel by the vertex colour, so the seeded ground colours
 * survive and the dunes/bump ride on top of them.
 * Caller owns disposal — see disposeTerrainMaterial.
 */
export function terrainMaterial(profile) {
  const maps = planetMaps('marsRegolith', profile.seed);
  const map = maps.map.clone();
  map.repeat.set(MARS_TERRAIN_TEXTURE_REPEAT, MARS_TERRAIN_TEXTURE_REPEAT);
  map.needsUpdate = true;
  const bumpMap = maps.bumpMap.clone();
  bumpMap.repeat.set(MARS_TERRAIN_TEXTURE_REPEAT, MARS_TERRAIN_TEXTURE_REPEAT);
  bumpMap.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    bumpMap,
    bumpScale: maps.bumpScale,
    roughness: maps.roughness,
    metalness: 0.15,
    flatShading: true,
  });
}

/** Dispose a material built by terrainMaterial (clones + material). */
export function disposeTerrainMaterial(material) {
  if (!material) return;
  if (material.map) material.map.dispose();
  if (material.bumpMap) material.bumpMap.dispose();
  material.dispose();
}

/**
 * Soft radial disc for the dust-storm haze sprites: warm white,
 * alpha falling off as the square of the distance from centre so
 * the edge melts into the sky instead of drawing a circle.
 */
export function hazeSpriteTexture() {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2; // 0 centre → 1 edge
      const a = Math.max(0, 1 - d);
      const i = (y * S + x) * 4;
      data[i] = 255;
      data[i + 1] = 235;
      data[i + 2] = 210;
      data[i + 3] = Math.round(255 * a * a);
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Vertical streaks for the dust-devil columns: pale dust with
 * ragged alpha columns, wrapping around the cylinder. The streaks
 * are what make the devil's spin visible — a smooth column turning
 * reads as still, a streaked one reads as spinning.
 */
export function devilStreakTexture() {
  const W = 64;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  const rnd = mulberry32(hashString('planet:devil-streaks'));
  const cols = [];
  for (let x = 0; x < W; x++) cols.push(0.35 + rnd() * 0.65);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = cols[x] * (0.75 + 0.25 * Math.sin(y * 0.35 + x));
      data[i] = 232;
      data[i + 1] = 196;
      data[i + 2] = 158;
      data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
