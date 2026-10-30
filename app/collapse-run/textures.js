// app/collapse-run/textures.js — 100 seeded level palettes (Merlin, 2026-10-29).
// Every level wears a different color texture: the warp between realms
// is a visual event, not just a number.

import { makeRng } from './engine.js';
import { VORTEX_WRAP_FILES } from '../../lib/vortex/wraps-manifest.js';

// One vortex graphic per realm per surface, deterministic so a realm
// always wears the same skins (Merlin, 2026-10-29):
//   slot 0 = floor tiles, slot 1 = obstruction cubes, slot 2 = solid cubes.
export const WRAP_SLOT_FLOOR = 0;
export const WRAP_SLOT_OBSTRUCTION = 1;
export const WRAP_SLOT_SOLID = 2;

export function wrapForLevel(level, slot) {
  const pool = VORTEX_WRAP_FILES;
  if (!pool || pool.length === 0) return null;
  const r = makeRng(0x9e3779b9 + level * 131071 + slot * 104729);
  return pool[Math.floor(r() * pool.length)];
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function hexFromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s / 100));
  l = Math.max(0, Math.min(1, l / 100));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(h + 1 / 3))}${to(f(h))}${to(f(h - 1 / 3))}`;
}

export function paletteForLevel(level) {
  const r = makeRng(0xC011A9 + level * 7919);
  const hue = Math.floor(r() * 360);
  const hue2 = (hue + 120 + Math.floor(r() * 120)) % 360;
  const dark = 8 + r() * 8;
  return {
    level,
    name: levelName(level, r),
    skyTop: hexFromHsl(hue, 60, dark),
    skyBottom: hexFromHsl(hue2, 55, dark + 10),
    fog: hexFromHsl(hue, 45, dark + 6),
    tileTop: hexFromHsl(hue, 35, 26 + r() * 10),
    tileSide: hexFromHsl(hue, 40, 12 + r() * 6),
    tileEdge: hexFromHsl(hue2, 80, 55),
    obstacle: hexFromHsl((hue + 180) % 360, 85, 50),
    solid: hexFromHsl(45, 95, 55),
    runner: hexFromHsl(hue2, 100, 65),
    star: hexFromHsl(hue, 30, 85),
    css: {
      skyTop: hsl(hue, 60, dark),
      tileTop: hsl(hue, 35, 30),
    },
  };
}

const NAME_A = ['Crimson', 'Amber', 'Verdant', 'Azure', 'Violet', 'Ember', 'Frost', 'Neon', 'Solar', 'Lunar'];
const NAME_B = ['Reach', 'Pass', 'Way', 'Road', 'Run', 'Path', 'Trail', 'Gate', 'Span', 'Course'];

function levelName(level, r) {
  if (level === 100) return 'The Summit';
  if (level === 1) return 'First Steps';
  return `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`;
}

export const LEVEL_COUNT = 100;
