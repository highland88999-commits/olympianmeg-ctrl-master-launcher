// lib/agora/world.js — Agora market-city world constants (Merlin, Nov 15, 2026).
//
// ENUMERATION (read from code first — ASSUME MEANS CHECK): Agora
// today is a 2D social feed only — posts, people, profiles, likes
// and comments over agora_posts / agora_profiles / agora_likes /
// agora_comments, with an Aphrodite video backdrop and a 2D canvas
// starfield. There is NO 3D scene anywhere in app/agora/ or
// components/agora/: no ground, no sky, no buildings, no stalls,
// no crowd. The CGI makeover therefore builds the market city
// fresh — it repairs nothing, because there is nothing to repair —
// while the feed mechanics stay exactly as they are.
//
// What lives here: the route identity, the fixed seed, the walker
// spawn, the world rim, the day factor arc, and the market layout
// — stall sites, stoa colonnades, the temple rise, the fountain,
// the olive trees. Pure, node-safe: the scene and the tests share
// these numbers.

import { mulberry32, hashString } from '../earth4/creature-textures.js';

export const AGORA_ROUTE_KEY = 'agora';
export const AGORA_ROUTE_PATH = '/agora';
export const AGORA_SEED = 'AGORA';
export const AGORA_WORLD_NAME = 'Agora — The Market City';
export const WORLD_RADIUS = 60;
export const WALKER_SPAWN = { x: 0, z: 34 };
export const EYE_HEIGHT = 1.7;

// The square itself: a cobbled circle where the market stands.
export const SQUARE_RADIUS = 34;
// The fountain at the centre of the square — stalls and walkers
// keep clear of it.
export const FOUNTAIN_RADIUS = 3.2;
export const FOUNTAIN_POSITION = { x: 0, z: 0 };

// The temple rise at the north end of the square (a low hill the
// temple stands on, so it reads over the stalls).
export const TEMPLE_POSITION = { x: 0, z: -44 };
export const TEMPLE_RISE = 2.4;

// The day factor (0 night → 1 day) for a time-of-day 0..1 — the
// same smoothstep arc the Mars 2 sky uses (mars2DayFactor in
// lib/mars2/world.js), so the lit windows, the stars and the
// pollen dim with the same sun the shared day/night rig drives.
export function agoraDayFactor(timeOfDay) {
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const s = Math.max(0, Math.min(1, (elev + 0.06) / (0.28 + 0.06)));
  return s * s * (3 - 2 * s);
}

// ── market stalls ──────────────────────────────────────────────
// Eight stalls ring the square, each with its own trade, awning
// tint and produce colour — seeded and deterministic per seed, so
// every phone sees the same market. Stalls sit on the square's
// ring, clear of the fountain, clear of the walker spawn path
// (the south gate at z +34), and clear of the temple rise.

export const STALL_TRADES = Object.freeze([
  { trade: 'olives', label: 'OLIVES', awning: '#2f6db3', produce: '#5a7d2a', produceAlt: '#3d5c1e' },
  { trade: 'oranges', label: 'ORANGES', awning: '#e07840', produce: '#f08a1d', produceAlt: '#e86a10' },
  { trade: 'lemons', label: 'LEMONS', awning: '#e8c832', produce: '#f2d54b', produceAlt: '#d9b62a' },
  { trade: 'figs', label: 'FIGS', awning: '#7a4a8a', produce: '#6b3a5e', produceAlt: '#8a5a78' },
  { trade: 'bread', label: 'BREAD', awning: '#c8a06a', produce: '#d9a860', produceAlt: '#b98a4a' },
  { trade: 'fish', label: 'FISH', awning: '#3a86a8', produce: '#7fb8c8', produceAlt: '#5a9ab0' },
  { trade: 'flowers', label: 'FLOWERS', awning: '#d45a8a', produce: '#e87aa8', produceAlt: '#c84a7a' },
  { trade: 'pottery', label: 'POTTERY', awning: '#a85a3a', produce: '#c07850', produceAlt: '#96603a' },
]);

export const STALL_COUNT = STALL_TRADES.length;

/**
 * The market stalls: deterministic per seed. Ring positions at
 * ~22 m from the centre, angles spread so no stall blocks the
 * south gate (the walker spawn) or the temple approach.
 */
export function stallSites(seed = AGORA_SEED) {
  const rnd = mulberry32(hashString(`agora:stalls:${seed}`));
  const sites = [];
  for (let i = 0; i < STALL_COUNT; i++) {
    // Spread around the ring, skipping the south gate sector
    // (angle ~90° in xz terms, where z is +) and the north
    // temple approach.
    const base = (i / STALL_COUNT) * Math.PI * 2;
    const jitter = (rnd() - 0.5) * 0.18;
    const angle = base + jitter;
    const dist = 21 + rnd() * 3;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    // Keep the south gate (z > 26, |x| < 8) and the temple
    // approach (|x| < 8, z < -30) clear.
    if ((z > 24 && Math.abs(x) < 9) || (z < -28 && Math.abs(x) < 9)) {
      // Nudge sideways out of the lane, same radius.
      const nx = x < 0 ? x - 9 : x + 9;
      sites.push({ ...STALL_TRADES[i], x: nx, z, angle: Math.atan2(z, nx) + Math.PI / 2, dist });
    } else {
      sites.push({ ...STALL_TRADES[i], x, z, angle: Math.atan2(z, x) + Math.PI / 2, dist });
    }
  }
  return sites;
}

// ── stoa colonnades ────────────────────────────────────────────
// Two roofed colonnades flank the square east and west — the
// shaded walk where the crowd strolls. Columns stand on the
// square's edge, clear of the stalls.

export const STOA_SIDES = Object.freeze([
  { side: 'west', x: -30 },
  { side: 'east', x: 30 },
]);
export const STOA_COLUMN_COUNT = 7;
export const STOA_COLUMN_SPACING = 7.5;
export const STOA_COLUMN_HEIGHT = 5.2;

// ── olive trees ────────────────────────────────────────────────
// A ring of olive trees outside the square, between the square
// and the city wall — seeded, deterministic, clear of the stalls
// and the gates.

export const OLIVE_TREE_COUNT = 14;

export function oliveTreeSites(seed = AGORA_SEED) {
  const rnd = mulberry32(hashString(`agora:olives:${seed}`));
  const trees = [];
  for (let i = 0; i < OLIVE_TREE_COUNT; i++) {
    const angle = (i / OLIVE_TREE_COUNT) * Math.PI * 2 + (rnd() - 0.5) * 0.22;
    const dist = 42 + rnd() * 8;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.abs(x) < 9 && z > 24) continue; // south gate lane
    if (Math.abs(x) < 9 && z < -30) continue; // temple approach
    trees.push({ x, z, scale: 0.85 + rnd() * 0.5, lean: (rnd() - 0.5) * 0.12 });
  }
  return trees;
}

/** Clamp a position to the world rim; reports whether it clamped. */
export function clampToWorld(x, z, radius = WORLD_RADIUS) {
  const r = Math.hypot(x, z);
  if (r <= radius) return { x, z, clamped: false };
  return { x: (x * radius) / r, z: (z * radius) / r, clamped: true };
}

// ── street lamps ───────────────────────────────────────────────
// Eight lamps ring the square, interleaved between the stalls —
// lamp, stall, lamp, stall around the ring — at 28 m, so they
// flank the walkways without standing in one. Angles are offset
// 22.5° from the stall ring (stalls sit at ~0°/45°/…), clear of
// the south gate lane and the temple approach, clear of the stoa
// columns (≥5 m) and the stalls (≥9 m). The ring is fixed by
// design — no jitter — because the clearances are measured on
// these exact spots; the same lamps stand on every phone.
//
// REAL LIGHTS (Merlin, Nov 3, 2026 — every lighting piece
// carries an actual light source; Nov 19 order adds the lamps):
// a real point light on every lamp is not what the house ships
// anywhere — the forward renderer pays every light in every
// standard-material fragment, and this scene already runs the
// rig's ambient + sun + moon. The house compromise (Babel: 16
// emissive lamps + 2 real lights where they matter) is the
// pattern: all eight heads glow, and every OTHER lamp — the
// even indices — carries a real warm point light, so four
// pools of real light land on the cobbles around the ring.

export const STREET_LAMP_COUNT = 8;
export const STREET_LAMP_RADIUS = 28;
export const STREET_LAMP_HEIGHT = 4.6;
export const STREET_LAMP_LIGHT_COUNT = 4;
export const STREET_LAMP_LIGHT_INTENSITY = 50;
export const STREET_LAMP_LIGHT_DISTANCE = 22;

export function streetLampSites() {
  const sites = [];
  for (let i = 0; i < STREET_LAMP_COUNT; i++) {
    const angle = (i / STREET_LAMP_COUNT) * Math.PI * 2 + Math.PI / 8;
    sites.push({
      key: `lamp-${i}`,
      x: Math.cos(angle) * STREET_LAMP_RADIUS,
      z: Math.sin(angle) * STREET_LAMP_RADIUS,
      angle,
      realLight: i % 2 === 0,
    });
  }
  return sites;
}
