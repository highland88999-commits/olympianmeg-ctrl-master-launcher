/**
 * lib/skyscraper-cgi/sky.js — the living sky over the vertical city (Merlin, Nov 15, 2026).
 *
 * SkyCycle used to paint the whole sky one flat colour
 * (scene.background = day blue / sunset orange / night black) —
 * the city far below never got its night glow, and there were no
 * stars at all. This module gives the tower a real sky: a
 * vertex-colour gradient dome (top / horizon / below-horizon, the
 * Star Wars CGI idiom in app/star-wars/cgi.js), a star field that
 * fades in at night, and a warm city-glow band on the horizon once
 * the sun is down — the city 480 m below lit up, seen from height.
 *
 * Everything is a pure function of the sun altitude (which
 * SkyCycle already computes from the real SunCalc position): the
 * same altitude always paints the same sky on every phone. No
 * stored state, no server tick, no new real lights — the dome and
 * the stars are unlit (MeshBasicMaterial / PointsMaterial).
 */

import * as THREE from 'three';
import { hashString, mulberry32 } from '../earth4/creature-textures.js';

export const SKY_DOME_RADIUS = 6000; // camera far is 15000; moon rides at 5000
export const SKY_STAR_COUNT = 500;
export const SKY_STAR_RADIUS = 5800;

// Palettes, as hex ints. Day is the old flat day blue, kept as the
// dome's day end so the daytime sky does not change its mind.
export const SKY_PALETTES = {
  day: { top: 0x2f6fd0, horizon: 0x9fc8e8, below: 0x1a2a3a },
  sunset: { top: 0x2a2a55, horizon: 0xff7e00, below: 0x120a18 },
  night: { top: 0x01020a, horizon: 0x0a1428, below: 0x05070f },
};
export const SKY_CITY_GLOW = 0xff9a3c; // warm sodium glow on the horizon at night

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return ((Math.round(lerp(ar, br, t)) << 16)
    | (Math.round(lerp(ag, bg, t)) << 8)
    | Math.round(lerp(ab, bb, t))) >>> 0;
}

/**
 * The sky at sun altitude `alt` (radians, the SunCalc altitude
 * SkyCycle already computes): { dayFactor, duskFactor, top,
 * horizon, below, starsOpacity, cityGlow }. Day above +0.1 rad,
 * night below -0.1, sunset blended across the band — the same
 * thresholds SkyCycle's flat background used, so the day/night
 * law does not change, only what it paints. Pure function.
 */
export function skyStateFor(alt) {
  const a = Number(alt) || 0;
  const dayFactor = a > 0.1 ? 1 : a < -0.1 ? 0 : (a + 0.1) / 0.2;
  const duskFactor = 1 - Math.min(1, Math.abs(a) / 0.3);
  const top = lerpHex(
    lerpHex(SKY_PALETTES.night.top, SKY_PALETTES.day.top, dayFactor),
    SKY_PALETTES.sunset.top, duskFactor * 0.55,
  );
  const horizon = lerpHex(
    lerpHex(SKY_PALETTES.night.horizon, SKY_PALETTES.day.horizon, dayFactor),
    SKY_PALETTES.sunset.horizon, duskFactor * 0.85,
  );
  const below = lerpHex(SKY_PALETTES.night.below, SKY_PALETTES.day.below, dayFactor);
  return {
    dayFactor,
    duskFactor,
    top,
    horizon,
    below,
    starsOpacity: (1 - dayFactor) * (1 - duskFactor * 0.6),
    cityGlow: 1 - dayFactor,
  };
}

/** Quantized key for change detection — the dome is repainted only when the sky moves. */
export function skyStateKey(state) {
  return `${state.dayFactor.toFixed(2)}|${state.duskFactor.toFixed(2)}`;
}

/**
 * The gradient dome: a BackSide sphere with vertex colours
 * (bottom -> horizon -> top), fog off, depthWrite off, drawn
 * behind everything. Painted by updateSkyDome, never by hand.
 */
export function makeSkyDome(radius = SKY_DOME_RADIUS) {
  const geo = new THREE.SphereGeometry(radius, 28, 16);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'skyscraper-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.userData.skyRadius = radius;
  // Start painted as night so the first frame is never white.
  updateSkyDome(dome, skyStateFor(-1));
  return dome;
}

/**
 * Repaint the dome for `state`. The warm city-glow band rides
 * the horizon (y01 ~0.48) and strengthens with state.cityGlow —
 * the city far below lit up, seen from the tower.
 */
export function updateSkyDome(dome, state) {
  const geo = dome.geometry;
  const pos = geo.getAttribute('position');
  const colors = geo.getAttribute('color');
  const radius = dome.userData.skyRadius || SKY_DOME_RADIUS;
  const top = new THREE.Color(state.top);
  const hor = new THREE.Color(state.horizon);
  const bot = new THREE.Color(state.below);
  const glow = new THREE.Color(SKY_CITY_GLOW);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / radius + 1) / 2; // 0 bottom .. 1 top
    if (y01 < 0.5) c.copy(bot).lerp(hor, y01 * 2);
    else c.copy(hor).lerp(top, (y01 - 0.5) * 2);
    // City-glow band hugging the horizon.
    const band = Math.max(0, 1 - Math.abs(y01 - 0.48) / 0.045);
    if (band > 0 && state.cityGlow > 0) {
      c.lerp(glow, band * state.cityGlow * 0.55);
    }
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
  dome.userData.skyStateKey = skyStateKey(state);
}

// A round star sprite, painted as a DataTexture (node-safe —
// no canvas, no document), so the stars are points of light
// instead of squares.
function starSpriteTexture() {
  const W = 16;
  const H = 16;
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5) / W - 0.5;
      const dy = (y + 0.5) / H - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d);
      const i = (y * W + x) * 4;
      color[i] = 255;
      color[i + 1] = 255;
      color[i + 2] = 255;
      color[i + 3] = Math.round(255 * a * a);
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The star field: seeded points on the upper sky (above the
 * horizon the walker stands on), invisible by day. Opacity is
 * driven per frame by updateStars — the points themselves never
 * move.
 */
export function makeStarField(seed = 'omega-tower', count = SKY_STAR_COUNT, radius = SKY_STAR_RADIUS) {
  const rnd = mulberry32(hashString(`skyscraper:stars:${seed}`));
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere, kept clear of the horizon band.
    const theta = rnd() * Math.PI * 2;
    const y01 = 0.12 + rnd() * 0.88; // 0 horizon .. 1 zenith
    const r = Math.sqrt(1 - y01 * y01);
    pos[i * 3] = Math.cos(theta) * r * radius;
    pos[i * 3 + 1] = y01 * radius;
    pos[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.0,
    sizeAttenuation: false,
    map: starSpriteTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'skyscraper-stars';
  points.frustumCulled = false;
  return points;
}

/** Fade the stars to the instant's sky (0 by day, 1 at night). */
export function updateStars(points, state) {
  if (!points || !points.material) return;
  points.material.opacity = clamp01(state.starsOpacity);
}
