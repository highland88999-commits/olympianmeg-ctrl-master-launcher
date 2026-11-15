// lib/enyo/maps.js — ENYO map data + deterministic layouts.
//
// Moved verbatim from app/enyo/page.jsx (2026-11-15, CGI upgrade) so the
// layouts are importable by node tests: the war dressing (lib/enyo/cgi.js)
// places its monument/banners/braziers against these exact obstacle lists,
// and tests prove clearance against the REAL layouts, not copies.
// No values changed in the move — same seeds, same obstacles, same styles.
import { mulberry32 } from '../enyo-bots.js';

// ---------------------------------------------------------------------------
// Maps — procedural arenas. obstacles: {x,z,w,d,h,c} axis-aligned boxes.
// ---------------------------------------------------------------------------

export const MAPS = [
  {
    key: 'plaza',
    name: 'Ruined Plaza',
    desc: 'Sun-bleached stone ruins. Broken walls, tight corners.',
    sky: 0xcfd8e3,
    fog: 0xcfd8e3,
    fogNear: 40,
    fogFar: 140,
    ground: '#9a917f',
    hemiSky: 0xe8f0ff,
    hemiGround: 0x8a7f66,
    sun: 0xfff2d8,
    seed: 1101,
  },
  {
    key: 'depot',
    name: 'Neon Depot',
    desc: 'Night freight yard. Containers and humming neon strips.',
    sky: 0x070a16,
    fog: 0x0a0e1e,
    fogNear: 30,
    fogFar: 120,
    ground: '#232838',
    hemiSky: 0x3a4a7a,
    hemiGround: 0x0c0e16,
    sun: 0x8fb4ff,
    seed: 2202,
    neon: true,
  },
  {
    key: 'hollow',
    name: 'Dust Hollow',
    desc: 'Wind-carved canyon floor. Rocks for cover, dust in the air.',
    sky: 0xe8b07a,
    fog: 0xe0a266,
    fogNear: 35,
    fogFar: 130,
    ground: '#a9743f',
    hemiSky: 0xffd9a8,
    hemiGround: 0x7a4a22,
    sun: 0xffd9a0,
    seed: 3303,
  },
];

export function mapByKey(key) {
  return MAPS.find((m) => m.key === key) || MAPS[0];
}
// Deterministic obstacle layout per map. Spawn lanes at z=±45 stay clear.
export function buildObstacles(mapKey, seed) {
  const rng = mulberry32(seed);
  const obs = [];
  const add = (x, z, w, d, h, c) => obs.push({ x, z, w, d, h, c });

  if (mapKey === 'plaza') {
    // Broken wall segments ringing a central ruined fountain.
    add(0, 0, 10, 10, 1.2, 'stone'); // fountain base
    add(0, 0, 4, 4, 3.2, 'stoneDark'); // fountain column
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const r = 22 + rng() * 6;
      add(Math.cos(a) * r, Math.sin(a) * r, 6 + rng() * 4, 1.6, 2.4 + rng() * 1.4, 'stone');
    }
    for (let i = 0; i < 10; i++) {
      add((rng() - 0.5) * 80, (rng() - 0.5) * 70, 2.2, 2.2, 2.2, 'crate');
    }
  } else if (mapKey === 'depot') {
    // Shipping containers in rows + neon pylons.
    for (let i = -2; i <= 2; i++) {
      add(i * 14, -12, 10, 3.4, 3.4, 'containerA');
      add(i * 14 + 7, 12, 10, 3.4, 3.4, 'containerB');
    }
    add(-24, 0, 3, 3, 6, 'neonPylon');
    add(24, 0, 3, 3, 6, 'neonPylon');
    add(0, -28, 8, 2.4, 2.4, 'crate');
    add(0, 28, 8, 2.4, 2.4, 'crate');
    for (let i = 0; i < 8; i++) {
      add((rng() - 0.5) * 90, (rng() - 0.5) * 70, 2.4, 2.4, 2.4, 'crate');
    }
  } else {
    // Dust Hollow: rock clusters + canyon wall chunks.
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = 14 + rng() * 30;
      const s = 2.5 + rng() * 4;
      add(Math.cos(a) * r, Math.sin(a) * r, s, s, s * (0.8 + rng() * 0.8), 'rock');
    }
    for (let i = 0; i < 6; i++) {
      add(-48 + i * 19, -40, 8, 3, 7, 'canyon');
      add(-48 + i * 19, 40, 8, 3, 7, 'canyon');
    }
  }
  return obs;
}
export function buildSpawns() {
  // Blue (south, z=+), Red (north, z=-). Spread across x.
  const blue = [
    { x: -14, z: 45 },
    { x: 0, z: 47 },
    { x: 14, z: 45 },
  ];
  const red = [
    { x: -14, z: -45 },
    { x: 0, z: -47 },
    { x: 14, z: -45 },
  ];
  return { blue, red };
}
export const OBSTACLE_STYLE = {
  stone: { color: 0xb8ad94, rough: 0.95 },
  stoneDark: { color: 0x8a8069, rough: 0.95 },
  crate: { color: 0x9c7a4d, rough: 0.9 },
  containerA: { color: 0x2e6f8e, rough: 0.7, metal: 0.35 },
  containerB: { color: 0x8e3a2e, rough: 0.7, metal: 0.35 },
  neonPylon: { color: 0x11131f, rough: 0.6, emissive: 0x00e5ff, emissiveI: 1.6 },
  rock: { color: 0x9c5f30, rough: 1 },
  canyon: { color: 0x8a4e26, rough: 1 },
};
