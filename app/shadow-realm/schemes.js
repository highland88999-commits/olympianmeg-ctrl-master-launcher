// app/shadow-realm/schemes.js — Tron light-trail color schemes + trim-bike vehicles.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly.
//
// Film schemes (Merlin's call: all three films represented):
//   Tron (1982)      — cyan-blue + red-orange
//   Tron: Legacy (2010) — blue + orange/white
//   Tron: Ares (2025)   — red
// Plus three extras (Specter White, Ultraviolet, Solar Gold).
//
// VEHICLES mirrors lib/nova-flight.js TRON_BIKE_TUNING for the three trim
// bikes — Wisp, Comet, Atlas ("I want my trim bikes"). The 3D renders come
// from components/nova/TronBikes.jsx when the realm mounts; the tuning
// numbers here are duplicated (not imported) so tests and the race sim
// never pull Three.js into the headless path.

export const TRAIL_SCHEMES = [
  {
    key: 'grid-blue',
    name: 'Grid Blue',
    film: 'Tron (1982)',
    primary: '#19d3ff',
    secondary: '#ff6a2a',
    trail: '#19d3ff',
    trailGlow: '#7deaff',
    desc: 'Cyan-blue cycle, red-orange rival — the original grid.',
  },
  {
    key: 'legacy',
    name: 'Legacy',
    film: 'Tron: Legacy (2010)',
    primary: '#3fa9ff',
    secondary: '#ff9a2a',
    trail: '#3fa9ff',
    trailGlow: '#bfe3ff',
    desc: 'Blue suit, orange-white rival — the Sea of Simulation.',
  },
  {
    key: 'ares-red',
    name: 'Ares Red',
    film: 'Tron: Ares (2025)',
    primary: '#ff2222',
    secondary: '#ff8a6b',
    trail: '#ff2222',
    trailGlow: '#ffb3a6',
    desc: 'Ares red — aggressive, unmistakable, all throttle.',
  },
  {
    key: 'specter',
    name: 'Specter White',
    film: 'Extra',
    primary: '#eef4ff',
    secondary: '#9adfff',
    trail: '#dfeaff',
    trailGlow: '#ffffff',
    desc: 'Ghost-white program. Quiet until it passes you.',
  },
  {
    key: 'ultraviolet',
    name: 'Ultraviolet',
    film: 'Extra',
    primary: '#b26bff',
    secondary: '#5c2bff',
    trail: '#b26bff',
    trailGlow: '#e3ccff',
    desc: 'Deep violet discharge. The night-cycle special.',
  },
  {
    key: 'solar-gold',
    name: 'Solar Gold',
    film: 'Extra',
    primary: '#ffd23f',
    secondary: '#ff9a2a',
    trail: '#ffd23f',
    trailGlow: '#ffedb0',
    desc: 'Gold circuitry. Sunset you can ride.',
  },
];

export const SCHEME_FILMS = ['Tron (1982)', 'Tron: Legacy (2010)', 'Tron: Ares (2025)', 'Extra'];

export function schemeByKey(key) {
  return TRAIL_SCHEMES.find((s) => s.key === key) || TRAIL_SCHEMES[0];
}

// --- trim bikes ------------------------------------------------------------
// Mirrors lib/nova-flight.js TRON_BIKE_TUNING (the garage source of truth).
// If the garage tuning ever changes, update both — tests pin the keys.

export const VEHICLES = [
  {
    key: 'wisp',
    name: 'Wisp',
    desc: 'Agile scout — fastest off the line, twitchy in the turns.',
    maxSpeed: 60,
    accel: 42,
    turnRate: 2.6,
    boostMult: 1.8,
    brakeRate: 70,
  },
  {
    key: 'comet',
    name: 'Comet',
    desc: 'Balanced all-rounder — steady, sharp, forgiving.',
    maxSpeed: 45,
    accel: 30,
    turnRate: 1.9,
    boostMult: 1.6,
    brakeRate: 55,
  },
  {
    key: 'atlas',
    name: 'Atlas',
    desc: 'Heavy hauler — slow, planted, unstoppable.',
    maxSpeed: 34,
    accel: 20,
    turnRate: 1.35,
    boostMult: 1.5,
    brakeRate: 45,
  },
];

export function vehicleByKey(key) {
  return VEHICLES.find((v) => v.key === key) || VEHICLES[1];
}
