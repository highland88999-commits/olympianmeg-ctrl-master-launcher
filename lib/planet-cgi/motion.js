/**
 * planet-cgi/motion.js — movement on the real clock (Merlin, Nov 14, 2026).
 *
 * The complaint behind the CGI pass was stillness: a frozen Earth,
 * a dead ground, a flat flag. Everything here is a pure function of
 * the device clock (milliseconds since the epoch) — no stored state,
 * no server tick, no background loop. Same place + same time = the
 * same motion on every phone; the world changes only as the clock
 * moves. Deterministic, so the node test suite can pin every value.
 *
 * All angles are radians, all rates rad/s (or offset units/s).
 */

import * as THREE from 'three';
import { hashString, mulberry32 } from '../earth4/creature-textures.js';
import { getParticleTexture } from '../particles/sprites.js';

// One epoch for the whole module so a rotation angle is a pure
// function of nowMs — a phone that opens the world at 12:00:05
// sees exactly where a phone that opened at 12:00:00 will be at
// 12:00:05.
export const PLANET_CGI_EPOCH_MS = Date.UTC(2026, 0, 1);

/** Rotation angle (rad) for a body spinning at `rateRadPerSec`. */
export function spinAngle(rateRadPerSec, nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  return (rateRadPerSec * t) % (Math.PI * 2);
}

/** Texture U offset for a flowing band (gas giants): 0..1, wraps. */
export function bandFlowOffset(ratePerSec, nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const o = (ratePerSec * t) % 1;
  return o < 0 ? o + 1 : o;
}

/** Cloud-layer angle: the clouds turn a touch faster than the ground. */
export function cloudDriftAngle(surfaceRateRadPerSec, nowMs = Date.now()) {
  return spinAngle(surfaceRateRadPerSec * 1.35, nowMs);
}

/**
 * A dust-mote field: THREE.Points drifting slowly through a box.
 * Base positions are seeded (same motes every load); the drift is a
 * slow sine of the real clock, so motes wander without any stored
 * velocity. Call updateDustField(points, nowMs) once per frame.
 * Returns the Points object (positions live in geometry userData).
 */
export function makeDustField({
  count = 220,
  width = 30,
  height = 6,
  depth = 30,
  yBase = 0.2,
  seed = 'dust',
  color = '#cfc4ae',
  size = 0.09,
  opacity = 0.55,
  sprite = 'glow',
} = {}) {
  const rnd = mulberry32(hashString(`planet:dust:${seed}`));
  const pos = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rnd() - 0.5) * width;
    base[i * 3 + 1] = yBase + rnd() * height;
    base[i * 3 + 2] = (rnd() - 0.5) * depth;
    phase[i] = rnd() * Math.PI * 2;
    pos[i * 3] = base[i * 3];
    pos[i * 3 + 1] = base[i * 3 + 1];
    pos[i * 3 + 2] = base[i * 3 + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.dustBase = base;
  geo.userData.dustPhase = phase;
  geo.userData.dustCount = count;
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
  points.userData.isDustField = true;
  points.frustumCulled = false;
  return points;
}

/** Drift the dust field to the instant `nowMs` (call per frame). */
export function updateDustField(points, nowMs = Date.now()) {
  const geo = points.geometry;
  const base = geo.userData.dustBase;
  const phase = geo.userData.dustPhase;
  const count = geo.userData.dustCount;
  if (!base || !phase || !count) return;
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const attr = geo.getAttribute('position');
  const arr = attr.array;
  for (let i = 0; i < count; i++) {
    const p = phase[i];
    // Slow wander: ~0.5 m sideways, ~0.25 m vertical, each mote
    // on its own phase so the field never moves as one sheet.
    arr[i * 3] = base[i * 3] + Math.sin(t * 0.11 + p) * 0.55;
    arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.07 + p * 1.7) * 0.28;
    arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.09 + p) * 0.55;
  }
  attr.needsUpdate = true;
}

/**
 * The Moon's wind (Merlin, Nov 15, 2026): the flag moves with it.
 * Pure function of the clock, like everything else here — the
 * direction veers slowly, the speed breathes with gusts. Numbers
 * are worker's choice, echoing the Mars 2 Thule wind's rhythm
 * (47 s gusts, ±~23° veer over 4 min): base 3.0 m/s, gusts ±1.5,
 * veer ±0.4 rad. Direction is an azimuth in radians: 0 = blowing
 * toward +X, π/2 = toward +Z — the cloth face's normal is ~+Z, so
 * sin(direction) is the push across the cloth. The dust has no
 * directional wind of its own (symmetric sine wander), so the wind
 * is its own value, not derived from the dust.
 */
export const MOON_WIND = {
  baseDirection: 0.6,
  baseSpeed: 3.0,
  gustAmp: 1.5,
  gustPeriodS: 47,
  veerAmp: 0.4,
  veerPeriodS: 240,
};

/** The Moon's wind at `nowMs`: { direction, speed } — deterministic. */
export function moonWind(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const direction =
    MOON_WIND.baseDirection +
    MOON_WIND.veerAmp * Math.sin((t / MOON_WIND.veerPeriodS) * Math.PI * 2);
  const speed = Math.max(
    0.5,
    MOON_WIND.baseSpeed +
      MOON_WIND.gustAmp * Math.sin((t / MOON_WIND.gustPeriodS) * Math.PI * 2 + 1.3)
  );
  return { direction, speed };
}

/**
 * Wave a flag cloth: displace a PlaneGeometry's vertices so the
 * free edge (far from the pole) ripples and the pole edge stays
 * pinned. Call per frame with the cloth geometry; `width` is the
 * cloth's world width, `amplitude` the wave height in metres.
 * Pure function of nowMs — no stored state.
 *
 * `wind` (Merlin, Nov 15, 2026) is { direction, speed } from
 * moonWind(): when passed, the wave follows the wind — stronger
 * wind = faster ripple + taller wave, and the wind's component
 * across the cloth face leans the whole cloth downwind. No wind
 * = the old fixed loop, byte-identical (existing tests pin it).
 */
export function waveFlag(geometry, nowMs = Date.now(), width = 1.15, amplitude = 0.06, wind = null) {
  const attr = geometry.getAttribute('position');
  if (!attr || !geometry.userData.flagBase) {
    // First call: snapshot the rest pose once.
    const base = new Float32Array(attr.array);
    geometry.userData.flagBase = base;
    geometry.userData.flagWidth = width;
  }
  const base = geometry.userData.flagBase;
  const w = geometry.userData.flagWidth || width;
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const speed = wind ? Math.max(0, Number(wind.speed) || 0) : 0;
  const freq = wind ? 1 + speed / 3 : 1;
  const ampScale = wind ? 0.5 + speed / 3 : 1;
  const lean = wind ? Math.sin(Number(wind.direction) || 0) * 0.05 * (speed / 3) : 0;
  const arr = attr.array;
  for (let i = 0; i < attr.count; i++) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    // 0 at the pole edge (x = -w/2), 1 at the free edge.
    const edge = (bx + w / 2) / w;
    const wave = Math.sin(bx * 5.2 - t * 4.4 * freq) * 0.6
      + Math.sin(by * 7.1 - t * 6.3 * freq) * 0.4;
    arr[i * 3] = bx;
    arr[i * 3 + 1] = by;
    arr[i * 3 + 2] = (wave * amplitude * ampScale + lean) * edge * edge;
  }
  attr.needsUpdate = true;
  geometry.computeVertexNormals();
}

/**
 * Lightning flash intensity (0..1) for a gas giant at `nowMs`:
 * flashes arrive in bursts — a seeded hash picks which 90 ms
 * slices flash, and the intensity decays inside the slice. Most
 * of the time it reads 0 (dark sky), then a sharp crack.
 * Deterministic: the same instant always flashes the same way.
 *
 * `chance` is the share of slices that flash (default 0.14, about
 * 1 in 7 — the Jupiter hub sphere's rate). Jupiter 2's street-level
 * storm passes a higher chance for a busier sky; every other
 * caller keeps the default, so their skies do not change.
 */
export function lightningFlash(nowMs = Date.now(), seed = 'jupiter-storms', periodMs = 9000, chance = 0.14) {
  const t = Number(nowMs) - PLANET_CGI_EPOCH_MS;
  const slot = Math.floor(t / 90);
  const h = hashString(`${seed}:${slot}`) / 4294967296;
  // `chance` of slices flash; the flash decays over its 90 ms.
  if (h > 1 - chance) {
    const within = (t % 90) / 90;
    return Math.max(0, 1 - within * 2.4);
  }
  return 0;
}

/**
 * A dust devil: a short-lived spinning column. `devilFor` returns
 * the devil's state at `nowMs` for a seeded devil index — where it
 * stands, how tall and wide it is, and whether it is alive at all
 * (devils live ~40 s, then a new one seeds elsewhere). Pure
 * function of the clock; the scene only renders what this says.
 */
export function devilFor(index, nowMs = Date.now(), area = 60) {
  const lifeMs = 40000;
  const t = Number(nowMs) - PLANET_CGI_EPOCH_MS;
  const cycle = Math.floor(t / lifeMs);
  const age = (t % lifeMs) / lifeMs; // 0..1 through this devil's life
  const rnd = mulberry32(hashString(`planet:devil:${index}:${cycle}`));
  const x = (rnd() - 0.5) * area;
  const z = (rnd() - 0.5) * area;
  const drift = age * 14; // devils wander downwind as they age
  const height = 4 + age * 9;
  const radius = 0.5 + age * 1.1;
  // Fade in over the first 15%, out over the last 25%.
  const opacity = age < 0.15 ? age / 0.15 : age > 0.75 ? (1 - age) / 0.25 : 1;
  return {
    alive: opacity > 0.02,
    x: x + drift,
    z,
    height,
    radius,
    opacity: Math.max(0, Math.min(1, opacity)),
    spin: (t / 1000) * 2.4 + index,
  };
}
