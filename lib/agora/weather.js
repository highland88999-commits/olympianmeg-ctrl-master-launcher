/**
 * lib/agora/weather.js — the Meltemi breeze + drifting pollen for Agora (Merlin, Nov 15, 2026).
 *
 * The Meltemi is the Aegean summer wind — the market square's
 * weather. The system owns the wind — a direction and a speed
 * that vary on the real clock — and the pollen drifts with it:
 * pale motes over the square, thicker in gusts, thin in the
 * lulls, plus the stall awnings breathing with the same wind.
 * Pure functions of the device clock, like the rest of the
 * planet-CGI kit (lib/planet-cgi/motion.js): same place + same
 * time = the same breeze on every phone. No stored state beyond
 * the pollen particles' own positions, no server tick, no new
 * real lights.
 *
 * Worker's-choice numbers (Merlin gave no numbers — flag if he
 * wants them tuned): prevailing from the north (0°), base
 * 4 m/s, gusts 2–11 m/s on a 47 s cycle, veer ±20° over 4
 * minutes, 260 pollen motes over the 120 m square, 0.2–6 m up.
 *
 * Compass convention (shared with the Mars 2 Thule wind):
 * heading 0 faces -Z, so north is -Z and a bearing is clockwise
 * from -Z. The wind vector is the direction the air TRAVELS
 * (bearing + 180°): a wind FROM the north (0°) blows towards
 * the south.
 */

import * as THREE from 'three';
import { hashString, mulberry32 } from '../earth4/creature-textures.js';
import { getParticleTexture } from '../particles/sprites.js';
import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';
import { windCompass, windVector } from '../mars2/weather.js';

export { windCompass, windVector };

export const MELTEMI_WIND_NAME = 'Meltemi breeze';
export const MELTEMI_WIND_BEARING_DEG = 0; // prevailing FROM the north
export const MELTEMI_WIND_VEER_DEG = 20; // slow veer either side of prevailing
export const MELTEMI_WIND_VEER_PERIOD_S = 240; // one full veer cycle, 4 minutes
export const MELTEMI_WIND_BASE_MPS = 4; // prevailing speed
export const MELTEMI_WIND_GUST_MIN_MPS = 2; // the lull between gusts
export const MELTEMI_WIND_GUST_MAX_MPS = 11; // a proper Aegean gust
export const MELTEMI_WIND_GUST_PERIOD_S = 47; // one gust cycle
export const MELTEMI_POLLEN_COUNT = 260;
export const MELTEMI_POLLEN_WIDTH_M = 110;
export const MELTEMI_POLLEN_DEPTH_M = 110;
export const MELTEMI_POLLEN_HEIGHT_M = 6;
export const MELTEMI_POLLEN_Y_BASE_M = 0.2;

/**
 * The Meltemi at `nowMs`: { speed, bearingDeg, dirX, dirZ, gust }.
 * Speed rides a gust envelope (two slow sines, 47 s cycle) around
 * the 4 m/s base, clamped to the 2–11 m/s gust range; the bearing
 * veers slowly ±20° around the 0° prevailing. `gust` is 0..1 — 0
 * in the lull, 1 at the top of a gust — for pollen thickness and
 * awning sway. Pure function of the clock: deterministic,
 * node-testable.
 */
export function meltemiWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / MELTEMI_WIND_GUST_PERIOD_S) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    MELTEMI_WIND_GUST_MIN_MPS,
    Math.min(
      MELTEMI_WIND_GUST_MAX_MPS,
      MELTEMI_WIND_BASE_MPS + gustWave * 3.5,
    ),
  );
  const bearingDeg = MELTEMI_WIND_BEARING_DEG
    + MELTEMI_WIND_VEER_DEG * Math.sin((t / MELTEMI_WIND_VEER_PERIOD_S) * Math.PI * 2 + 0.7);
  const dir = windVector(bearingDeg);
  return {
    speed,
    bearingDeg,
    dirX: dir.x,
    dirZ: dir.z,
    gust: (speed - MELTEMI_WIND_GUST_MIN_MPS)
      / (MELTEMI_WIND_GUST_MAX_MPS - MELTEMI_WIND_GUST_MIN_MPS),
  };
}

/**
 * How thick the drifting pollen reads at this wind: 0 in the
 * lull, 1 at the top of a gust. The field never vanishes
 * entirely — the square always has pollen in the air.
 */
export function pollenIntensity(wind) {
  const g = wind && Number.isFinite(wind.gust) ? wind.gust : 0;
  return Math.max(0, Math.min(1, g));
}

/**
 * How far a stall awning leans and ripples at this wind, in
 * radians — 0 in the lull, ~0.06 at the top of a gust. Pure
 * function of the wind, so the scene and the tests agree.
 */
export function awningSwayRad(wind) {
  const g = wind && Number.isFinite(wind.gust) ? wind.gust : 0;
  return 0.06 * Math.max(0, Math.min(1, g));
}

/**
 * The drifting-pollen field: THREE.Points of pale motes across
 * the square. Each mote carries its own speed factor (pollen
 * travels at 40–80% of the wind) and bob phase. Call
 * updatePollenField per frame with the live wind and dt; motes
 * advect downwind and wrap around the box so the field never
 * empties. Returns the Points object (state lives in geometry
 * userData).
 */
export function makePollenField({
  count = MELTEMI_POLLEN_COUNT,
  width = MELTEMI_POLLEN_WIDTH_M,
  height = MELTEMI_POLLEN_HEIGHT_M,
  depth = MELTEMI_POLLEN_DEPTH_M,
  yBase = MELTEMI_POLLEN_Y_BASE_M,
  seed = 'agora-meltemi',
  color = '#f2e6b8',
  size = 0.12,
  opacity = 0.5,
  sprite = 'glow',
} = {}) {
  const rnd = mulberry32(hashString(`agora:pollen:${seed}`));
  const pos = new Float32Array(count * 3);
  const speedFactor = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * width;
    pos[i * 3 + 1] = yBase + rnd() * height;
    pos[i * 3 + 2] = (rnd() - 0.5) * depth;
    speedFactor[i] = 0.4 + rnd() * 0.4;
    phase[i] = rnd() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.pollenSpeed = speedFactor;
  geo.userData.pollenPhase = phase;
  geo.userData.pollenCount = count;
  geo.userData.pollenWidth = width;
  geo.userData.pollenHeight = height;
  geo.userData.pollenDepth = depth;
  geo.userData.pollenYBase = yBase;
  const mat = new THREE.PointsMaterial({
    color,
    size,
    map: getParticleTexture(sprite) || undefined,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.isPollenField = true;
  points.frustumCulled = false;
  return points;
}

/** Advect the pollen field with the live wind (call per frame). */
export function updatePollenField(points, wind, dt, nowMs = Date.now(), dayF = 1) {
  const geo = points.geometry;
  const speed = geo.userData.pollenSpeed;
  const phase = geo.userData.pollenPhase;
  const count = geo.userData.pollenCount;
  const width = geo.userData.pollenWidth;
  const height = geo.userData.pollenHeight;
  const depth = geo.userData.pollenDepth;
  const yBase = geo.userData.pollenYBase;
  if (!speed || !phase || !count) return;
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  const w = wind || { dirX: 0, dirZ: 1, speed: 4 };
  const intensity = 0.25 + 0.75 * pollenIntensity(wind);
  for (let i = 0; i < count; i++) {
    const f = speed[i];
    let x = arr[i * 3] + w.dirX * w.speed * f * dt;
    let z = arr[i * 3 + 2] + w.dirZ * w.speed * f * dt;
    // Wrap around the box so the field never empties.
    if (x > width / 2) x -= width;
    if (x < -width / 2) x += width;
    if (z > depth / 2) z -= depth;
    if (z < -depth / 2) z += depth;
    arr[i * 3] = x;
    arr[i * 3 + 1] = yBase + ((phase[i] * 0.37 + t * 0.11) % 1) * height;
    arr[i * 3 + 2] = z;
  }
  attr.needsUpdate = true;
  points.material.opacity = (0.14 + 0.36 * intensity) * (0.35 + 0.65 * dayF);
}
