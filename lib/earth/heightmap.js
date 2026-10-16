// lib/earth/heightmap.js — the shared decoded-heightmap cache.
//
// Before Day 2, three components each fetched and decoded the
// 2048×1024 topology PNG on their own (the terrain globe, the
// asset layer, and now the lens + the street walker). One decode,
// shared: loadHeightData() resolves once and every consumer reads
// the same grayscale array the placement layer samples.
// Browser-only (Image/canvas decode); the pure samplers stay in
// placements.js / terrain.js where the tests live.
import * as THREE from 'three';
import { TERRAIN_TEXTURES } from '../terrain.js';
import { surfaceRadiusAt } from './placements.js';
import { EARTH_RADIUS } from '../geo.js';

let cache = null; // { data: Uint8Array, w, h }
let pending = null;

/** The decoded heightmap if it has arrived, else null. */
export function getHeightData() {
  return cache;
}

/** Load + decode once; resolves to the cache (or null on failure
 *  — consumers fall back to the base sphere, never a crash). */
export function loadHeightData() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(TERRAIN_TEXTURES.height);
      const img = tex.image;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      const gray = new Uint8Array(img.width * img.height);
      for (let i = 0; i < gray.length; i++) gray[i] = px[i * 4];
      tex.dispose();
      cache = { data: gray, w: img.width, h: img.height };
      return cache;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Terrain surface radius at lat/lon when the heightmap is in,
 *  else the base globe radius — the walker's ground truth. */
export function surfaceRadiusOrBase(lat, lon) {
  if (!cache) return EARTH_RADIUS;
  return surfaceRadiusAt(cache.data, cache.w, cache.h, lat, lon);
}
