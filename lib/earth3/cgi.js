// lib/earth3/cgi.js — Earth 3 CGI helpers (Merlin, Nov 14, 2026).
//
// The CGI pass for /new-earth: terrain grain, water shimmer, sky
// shimmer, flower sway and drifting motes — the world around the
// real dinos and real trees, which this module never touches.
// Node-safe (THREE + lib/planet-cgi only, no DOM): the node test
// suite pins every helper. All motion is a pure function of the
// device clock (nowMs) — no stored state, no server tick — so the
// same instant paints the same world on every phone.

import * as THREE from 'three';
import { planetMaps, cloudLayerTexture } from '../planet-cgi/textures.js';
import {
  PLANET_CGI_EPOCH_MS,
  spinAngle,
  bandFlowOffset,
  makeDustField,
} from '../planet-cgi/motion.js';

export { PLANET_CGI_EPOCH_MS };

// ── ground ───────────────────────────────────────────────────────
// A neutral detail map that multiplies with the ground disc's
// vertex colours (green / sand / snow zones keep their colours
// and layout): near-white grey derived from the rock family's
// bump relief — pits read ~0.73, flats ~1.0, mean ~0.88 — plus
// that same bump map so the sun finds real relief. Tiled 24x
// across the 520 m disc (~22 m per tile) so the grain reads at
// walking height instead of smearing over the whole world.

const GROUND_REPEAT = 24;
const GROUND_BUMP_SCALE = 0.05;

const groundCache = new Map(); // seed -> { map, bumpMap, roughness, bumpScale }

export function groundDetailMaps(seed = 'earth3-ground') {
  if (groundCache.has(seed)) return groundCache.get(seed);
  const { bumpMap } = planetMaps('rock', seed);
  const W = 256;
  const H = 256;
  const bump = bumpMap.image.data;
  const color = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const g = Math.max(185, Math.min(255, Math.round(225 + (bump[i] - 128) * 0.45)));
    const o = i * 4;
    color[o] = g;
    color[o + 1] = g;
    color[o + 2] = g;
    color[o + 3] = 255;
  }
  const map = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
  bumpMap.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
  const out = { map, bumpMap, roughness: 1, bumpScale: GROUND_BUMP_SCALE };
  groundCache.set(seed, out);
  return out;
}

// ── water ────────────────────────────────────────────────────────
// Scrolling offsets for the shimmer sheet riding over each water
// body: cloud-layer streaks drifting on the real clock, U and V
// on different rates/phases so the light never slides as one
// sheet. 0..1, wraps.

export function waterShimmerOffset(nowMs = Date.now(), rate = 0.008) {
  return {
    u: bandFlowOffset(rate, nowMs),
    v: bandFlowOffset(rate * 0.63, Number(nowMs) + 47000),
  };
}

/** The scrolling streak texture itself (white on transparency). */
export function waterShimmerTexture(seed = 'earth3-water') {
  const tex = cloudLayerTexture(seed);
  tex.repeat.set(3, 2);
  return tex;
}

// ── sky ──────────────────────────────────────────────────────────
// Sun shimmer: a slow 0..1 breathing of the glow on the real
// clock (~14 s cycle), so the sun pulses instead of sitting flat.
export function sunShimmer(nowMs = Date.now()) {
  return 0.5 + 0.5 * Math.sin(spinAngle(0.45, nowMs));
}

// Cloud breathing: each cloud's opacity multiplier, 0.70..1.00,
// on its own phase (index * golden angle) so the layer never
// pulses as one sheet.
export function cloudBreath(nowMs = Date.now(), phase = 0) {
  return 0.85 + 0.15 * Math.sin(spinAngle(0.35, nowMs) + phase);
}

// ── vegetation ───────────────────────────────────────────────────
// One shared sway per plant: a small lean (radians) on the real
// clock, phase from the plant index so neighbours never move in
// lockstep. |rz| <= amplitude, |rx| <= 0.6 * amplitude.
export function vegetationSway(index, nowMs = Date.now(), amplitude = 0.05) {
  const phase = index * 2.39996; // golden angle
  return {
    rz: amplitude * Math.sin(spinAngle(0.9, nowMs) + phase),
    rx: amplitude * 0.6 * Math.cos(spinAngle(0.7, nowMs) + phase * 1.3),
  };
}

// ── dust motes ───────────────────────────────────────────────────
// Warm motes drifting over the gardens: one wide field over the
// plaza + housing gardens, one small field over the floating
// island's gardens (island grass sits ~6 m up, so its motes start
// at y 6.4). Drift with updateDustField(field, Date.now()) once
// per frame — see lib/planet-cgi/motion.js.
export function makeEarth3Dust() {
  const main = makeDustField({
    count: 220, width: 260, height: 4.5, depth: 260, yBase: 0.3,
    seed: 'earth3-motes', color: '#ffe9b0', size: 0.12, opacity: 0.5,
  });
  const island = makeDustField({
    count: 60, width: 90, height: 4, depth: 90, yBase: 6.4,
    seed: 'earth3-island-motes', color: '#ffe9b0', size: 0.12, opacity: 0.5,
  });
  island.position.set(-50, 0, 175);
  return [main, island];
}

// ── arctic ───────────────────────────────────────────────────────
// The arctic snow/ice wears the iceCap family: white-blue crystal
// with crevasse lines and real bump relief.
export function arcticIceMaps(seed = 'earth3-arctic') {
  return planetMaps('iceCap', seed);
}
