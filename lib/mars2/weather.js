/**
 * lib/mars2/weather.js — the Thule wind + blowing sand for Mars 2 (Merlin, Nov 15, 2026).
 *
 * "Thule wind" is Merlin's name for the Mars 2 wind. The system owns
 * the wind — a direction and a speed that vary on the real clock —
 * and the sand blows with it: a saltation field of grains carried
 * downwind, thicker in gusts, thin in the lulls. Pure functions of
 * the device clock, like the rest of the planet-CGI kit
 * (lib/planet-cgi/motion.js): same place + same time = the same
 * wind on every phone. No stored state beyond the sand particles'
 * own positions, no server tick, no new real lights.
 *
 * Worker's-choice numbers (Merlin gave no numbers — flag if he
 * wants them tuned): prevailing from the northwest (315°), base
 * 9 m/s, gusts 5–22 m/s on a 47 s cycle, veer ±25° over 4 minutes,
 * 420 sand grains over the 170 m flats, 0.2–7 m up.
 *
 * Compass convention (shared with the Mars 1 first-person rig):
 * heading 0 faces -Z, so north is -Z and a bearing is clockwise
 * from -Z. The wind vector is the direction the air TRAVELS
 * (bearing + 180°): a wind FROM the northwest (315°) blows
 * towards the southeast.
 */

import * as THREE from 'three';
import { hashString, mulberry32 } from '../earth4/creature-textures.js';
import { getParticleTexture } from '../particles/sprites.js';
import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';

export const THULE_WIND_NAME = 'Thule wind';
export const THULE_WIND_BEARING_DEG = 315; // prevailing FROM the northwest
export const THULE_WIND_VEER_DEG = 25; // slow veer either side of prevailing
export const THULE_WIND_VEER_PERIOD_S = 240; // one full veer cycle, 4 minutes
export const THULE_WIND_BASE_MPS = 9; // prevailing speed
export const THULE_WIND_GUST_MIN_MPS = 5; // the lull between gusts
export const THULE_WIND_GUST_MAX_MPS = 22; // a proper Martian gust
export const THULE_WIND_GUST_PERIOD_S = 47; // one gust cycle
export const THULE_SAND_COUNT = 420;
export const THULE_SAND_WIDTH_M = 170;
export const THULE_SAND_DEPTH_M = 170;
export const THULE_SAND_HEIGHT_M = 7;
export const THULE_SAND_Y_BASE_M = 0.2;

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** 8-point compass label for a bearing in degrees. */
export function windCompass(bearingDeg) {
  const b = (((bearingDeg % 360) + 360) % 360);
  return COMPASS_8[Math.round(b / 45) % 8];
}

/**
 * Travel unit vector (x, z) for a wind FROM `bearingDeg`. Bearings
 * are compass bearings clockwise from north (-Z): a wind FROM the
 * northwest (315°) travels to the southeast, (+x, +z).
 */
export function windVector(bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), z: Math.cos(rad) };
}

/**
 * The Thule wind at `nowMs`: { speed, bearingDeg, dirX, dirZ, gust }.
 * Speed rides a gust envelope (two slow sines, 47 s cycle) around
 * the 9 m/s base, clamped to the 5–22 m/s gust range; the bearing
 * veers slowly ±25° around the 315° prevailing. `gust` is 0..1 —
 * 0 in the lull, 1 at the top of a gust — for sand thickness.
 * Pure function of the clock: deterministic, node-testable.
 */
export function thuleWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / THULE_WIND_GUST_PERIOD_S) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    THULE_WIND_GUST_MIN_MPS,
    Math.min(
      THULE_WIND_GUST_MAX_MPS,
      THULE_WIND_BASE_MPS + gustWave * 6.5,
    ),
  );
  const bearingDeg = THULE_WIND_BEARING_DEG
    + THULE_WIND_VEER_DEG * Math.sin((t / THULE_WIND_VEER_PERIOD_S) * Math.PI * 2 + 0.7);
  const dir = windVector(bearingDeg);
  return {
    speed,
    bearingDeg,
    dirX: dir.x,
    dirZ: dir.z,
    gust: (speed - THULE_WIND_GUST_MIN_MPS)
      / (THULE_WIND_GUST_MAX_MPS - THULE_WIND_GUST_MIN_MPS),
  };
}

/**
 * How thick the blowing sand reads at this wind: 0 in the lull,
 * 1 at the top of a gust. The field never vanishes entirely —
 * Mars always has dust in the air.
 */
export function sandIntensity(wind) {
  const g = wind && Number.isFinite(wind.gust) ? wind.gust : 0;
  return Math.max(0, Math.min(1, g));
}

// ── Sandstorms (Merlin, Nov 17, 2026) ───────────────────────────────
// Occasional storms roll in on the Thule wind: the sand thickens
// until the air goes opaque, then the storm passes. Deterministic
// on the clock like the rest of the weather — same place + same
// time = the same storm on every phone. One storm per ~9-minute
// cycle, 60–150 s long, 25 s to rise and 25 s to fall, so a storm
// is an event you walk through, not a permanent haze.
export const SANDSTORM_PERIOD_S = 540;
export const SANDSTORM_DURATION_MIN_S = 60;
export const SANDSTORM_DURATION_MAX_S = 150;
export const SANDSTORM_RAMP_S = 25;

function stormHash(n) {
  let h = (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ (n >>> 13)) >>> 0;
  h = (Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// The storm window for one cycle: { start, dur, end } in seconds
// into the cycle. Shared by sandstormAt and sandstormWarningAt so
// the warning and the storm can never disagree about when a storm
// starts — one computation, two readers.
function stormWindowForCycle(cycle) {
  const start = 60 + stormHash(cycle)
    * (SANDSTORM_PERIOD_S - 60 - SANDSTORM_DURATION_MAX_S - 60);
  const dur = SANDSTORM_DURATION_MIN_S
    + stormHash(cycle + 7919) * (SANDSTORM_DURATION_MAX_S - SANDSTORM_DURATION_MIN_S);
  return { start, dur, end: start + dur };
}

/**
 * The sandstorm at `nowMs`: { intensity, active, cycle }.
 * intensity is 0..1 — 0 calm, 1 full storm — with smoothstep
 * ramps in and out, so the sky never snaps. Pure function of
 * the clock: deterministic, node-testable.
 */
export function sandstormAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const cycle = Math.floor(t / SANDSTORM_PERIOD_S);
  const inCycle = t - cycle * SANDSTORM_PERIOD_S;
  const { start, end } = stormWindowForCycle(cycle);
  const smooth = (v) => {
    const c = Math.max(0, Math.min(1, v));
    return c * c * (3 - 2 * c);
  };
  let intensity = 0;
  if (inCycle > start && inCycle < end) {
    intensity = Math.min(
      smooth((inCycle - start) / SANDSTORM_RAMP_S),
      smooth((end - inCycle) / SANDSTORM_RAMP_S),
    );
  }
  return { intensity, active: intensity > 0.05, cycle };
}

// ── Storm warning (Merlin, Nov 17, 2026) ─────────────────────────
// Two minutes before a sandstorm starts, warn the user to get
// inside the outpost — a storm caught out on the dunes drains
// health (lib/mars2/health.js), so the warning is the difference
// between a walk home and a respawn. Same cycle math as the storm
// itself (stormWindowForCycle), so the lead is exact: the warning
// fires when the next storm's first sand is 120 s away, whether
// that storm is later this cycle or early in the next one.
export const SANDSTORM_WARNING_LEAD_S = 120;

/**
 * The storm warning at `nowMs`: { warning, secondsUntil, active }.
 * warning is true while the next storm starts within the 120 s
 * lead; secondsUntil is the countdown to its first sand (null
 * when no warning); active is true while a storm is underway.
 * Pure function of the clock: deterministic, node-testable.
 */
export function sandstormWarningAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const cycle = Math.floor(t / SANDSTORM_PERIOD_S);
  const inCycle = t - cycle * SANDSTORM_PERIOD_S;
  const win = stormWindowForCycle(cycle);
  if (inCycle >= win.start && inCycle < win.end) {
    return { warning: false, secondsUntil: null, active: true };
  }
  let secondsUntil = null;
  if (inCycle < win.start) {
    secondsUntil = win.start - inCycle;
  } else {
    const next = stormWindowForCycle(cycle + 1);
    secondsUntil = (SANDSTORM_PERIOD_S - inCycle) + next.start;
  }
  if (secondsUntil <= SANDSTORM_WARNING_LEAD_S) {
    return { warning: true, secondsUntil, active: false };
  }
  return { warning: false, secondsUntil: null, active: false };
}

/**
 * The blowing-sand field: THREE.Points of grains across the flats.
 * Each grain carries its own speed factor (saltation: grains travel
 * at 55–95% of the wind) and bob phase. Call updateSandField per
 * frame with the live wind and dt; grains advect downwind and wrap
 * around the box so the field never empties. Returns the Points
 * object (state lives in geometry userData).
 */
export function makeSandField({
  count = THULE_SAND_COUNT,
  width = THULE_SAND_WIDTH_M,
  height = THULE_SAND_HEIGHT_M,
  depth = THULE_SAND_DEPTH_M,
  yBase = THULE_SAND_Y_BASE_M,
  seed = 'mars-2-thule',
  color = '#d9a06a',
  size = 0.14,
  opacity = 0.55,
  sprite = 'grain',
} = {}) {
  const rnd = mulberry32(hashString(`mars2:sand:${seed}`));
  const pos = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const factor = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * width;
    pos[i * 3 + 1] = yBase + rnd() * height;
    pos[i * 3 + 2] = (rnd() - 0.5) * depth;
    baseY[i] = pos[i * 3 + 1];
    factor[i] = 0.55 + rnd() * 0.4;
    phase[i] = rnd() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.sandBaseY = baseY;
  geo.userData.sandFactor = factor;
  geo.userData.sandPhase = phase;
  geo.userData.sandCount = count;
  geo.userData.sandWidth = width;
  geo.userData.sandHeight = height;
  geo.userData.sandDepth = depth;
  geo.userData.sandYBase = yBase;
  geo.userData.sandBaseOpacity = opacity;
  geo.userData.sandBaseSize = size;
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
  points.userData.isSandField = true;
  points.frustumCulled = false;
  return points;
}

function wrapRange(v, half) {
  if (v > half) return v - half * 2;
  if (v < -half) return v + half * 2;
  return v;
}

/**
 * Advect the sand field one frame: grains move downwind at their
 * own fraction of the wind speed, bob slightly, and wrap around
 * the box. `opacityScale` (0..1, the caller passes the day factor)
 * dims the field at night; the gust thickness comes from the wind
 * itself. `storm` (0..1, default 0 — the sandstorm factor) rides
 * the field harder: grains travel faster, read thicker and grow,
 * so a storm is the same sand turned up, not a second system.
 * dt is clamped to 0.05 s so a tab-switch hitch never throws the
 * field across the world.
 */
export function updateSandField(points, wind, dt, nowMs = Date.now(), opacityScale = 1, storm = 0) {
  const geo = points.geometry;
  const baseY = geo.userData.sandBaseY;
  const factor = geo.userData.sandFactor;
  const phase = geo.userData.sandPhase;
  const count = geo.userData.sandCount;
  if (!baseY || !factor || !phase || !count || !wind) return;
  const step = Math.max(0, Math.min(dt, 0.05));
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  const w = geo.userData.sandWidth;
  const d = geo.userData.sandDepth;
  const st = Math.max(0, Math.min(1, Number(storm) || 0));
  const speedMul = 1 + st * 2;
  const vx = wind.dirX * wind.speed * speedMul;
  const vz = wind.dirZ * wind.speed * speedMul;
  for (let i = 0; i < count; i++) {
    const f = factor[i];
    arr[i * 3] = wrapRange(arr[i * 3] + vx * f * step, w / 2);
    // Saltation bob: grains hop a little as they travel — harder
    // in a storm.
    arr[i * 3 + 1] = Math.max(0.05, baseY[i] + Math.sin(t * 1.9 + phase[i]) * (0.3 + st * 0.7));
    arr[i * 3 + 2] = wrapRange(arr[i * 3 + 2] + vz * f * step, d / 2);
  }
  attr.needsUpdate = true;
  const intensity = sandIntensity(wind);
  points.material.opacity = Math.min(0.95, geo.userData.sandBaseOpacity
    * (0.3 + 0.7 * intensity) * opacityScale * (1 + st * 1.2));
  if (Number.isFinite(geo.userData.sandBaseSize)) {
    points.material.size = geo.userData.sandBaseSize * (1 + st * 1.5);
  }
}
