// World Engine datasheet — OBJECT BUILDER (/world-engine/objects).
//
// WHAT READS IT: lib/world-engine/sectors.js (OBJECT_SLIDERS),
// lib/world-engine/useEngineStore.js (OBJECT_STORE_DEFAULTS),
// components/world-engine/MiniViewport.jsx (preview: BoxGeometry from
// scale, Omega badge on the front face), lib/world-engine/aesthetic.js
// (objectDensity clamp 0–1 — the density the seed/world builders use for
// prop counts; see OBJECT_DENSITY_RULES).
//
// WHERE EVERY ENTRY CAME FROM:
// - OBJECT_SLIDERS: lib/world-engine/sectors.js SECTORS.objects.sliders.
// - OBJECT_STORE_DEFAULTS: lib/world-engine/useEngineStore.js
//   defaultObject.
// - MATERIALS: only 'standard' is evidenced anywhere in World Engine
//   code (the store default). No material list exists; the sheet records
//   the one evidenced value and marks the rest as a gap.
// - OBJECT_DENSITY_RULES: lib/world-engine/PrecisionEngine.js (fallback
//   props: propCount = floor(60 * density) over a 140 m scatter when a
//   world has no life seed) and lib/world-engine/life-render.js (flora
//   count 12 + density * 36 per kind). objectDensity itself is clamped
//   0–1 by applyAestheticEngine().
// - OBJECT_PREVIEW: MiniViewport.jsx object/asset_link case.
// - COST: lib/world-engine/economy.js COST_MAP.object (100 Aether).
// - OBJECT_PRESETS: WORKER'S CHOICE — no presets existed in code. Density
//   inside the 0–1 slider; material is the one evidenced value.
//
// GAP: same synthesis gap as characters/vehicles (generic environment
// instruction; aesthetic engine returns only environment keys), plus no
// material catalog and no shape catalog exist in code — the preview is a
// plain box scaled by `scale`. A shape/material vocabulary would be new
// data, not a move of existing data; flagged for Merlin's call.
// — SYNTHESIS GAP CLOSED Nov 15 (World Engine Gap 1): gemini.js now
// carries OBJECT_SYSTEM_INSTRUCTION and aesthetic.js has an object
// branch reading the VALID_* / DEFAULT_* lists below. The material /
// shape catalog gap stands: 'standard' is still the only evidenced
// material, and the preview is still a plain box.

import { costFor } from '../economy.js';

export const BUILDER = {
  id: 'objects',
  sectorKey: 'objects',
  route: '/world-engine/objects',
  name: 'Object Builder',
  category: 'object',
  accent: '#00ffcc',
  costAether: costFor('object'),
  storeKey: 'object',
  storeSetter: 'setObjectDimensions',
};

/** Materials — only 'standard' is evidenced (store default). */
export const MATERIALS = ['standard'];
export const MATERIALS_EVIDENCED = ['standard'];

/** Materials — the VALID_* name the aesthetic layer reads. */
export const VALID_MATERIALS = MATERIALS;

/** Density range — the OBJECT_DENSITY_RULES clamp, named for the aesthetic layer. */
export const OBJECT_DENSITY_RANGE = { min: 0, max: 1 };

/**
 * Scale-axis range — WORKER'S CHOICE: no scale range exists in code
 * (the preview is a plain box scaled by `scale`); 0.1–10 matches the
 * uplink import-scale slider, the only evidenced scale range.
 */
export const OBJECT_SCALE_RANGE = { min: 0.1, max: 10 };

/**
 * DEFAULT_OBJECT_PARAMS — the aesthetic-safe object shape: the store
 * defaults minus placement (position/rotation), which synthesis
 * never sets.
 */
export const DEFAULT_OBJECT_PARAMS = {
  scale: { x: 1, y: 1, z: 1 },
  density: 0.5,
  material: 'standard',
  color: '#00ffcc',
};

/** Sliders — was SECTORS.objects.sliders in sectors.js. */
export const OBJECT_SLIDERS = [
  { key: 'density', label: 'Placement density', min: 0, max: 1, step: 0.1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
];

/** Store defaults — was defaultObject in useEngineStore.js. */
export const OBJECT_STORE_DEFAULTS = {
  scale: { x: 1, y: 1, z: 1 },
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  density: 0.5,
  material: 'standard',
  color: '#00ffcc',
};

/**
 * What objectDensity does downstream — from the renderers that read it.
 * PrecisionEngine (seedless worlds): floor(60 * density) cone props over
 * 140 m. life-render.js (seeded worlds): 12 + density * 36 specimens per
 * flora kind. Both clamp density 0–1 via the aesthetic engine.
 */
export const OBJECT_DENSITY_RULES = {
  clamp: { min: 0, max: 1 },
  seedlessWorldPropCount: (density) => Math.floor(60 * density),
  seededWorldFloraPerKind: (density) => Math.round(12 + density * 36),
};

/**
 * Preview geometry — MiniViewport.jsx object case. A box sized by scale;
 * the Omega badge (0.3) sits on the front face at depth/2 + 0.012.
 */
export const OBJECT_PREVIEW = {
  geometry: 'BoxGeometry',
  dimensionsFromScale: (scale) => ({ x: scale?.x || 1, y: scale?.y || 1, z: scale?.z || 1 }),
  restHeight: (scale) => (scale?.y || 1) / 2,
  badge: { size: 0.3, note: 'Omega badge on the front face' },
};

/**
 * OBJECT_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Density inside the 0–1 slider; material 'standard' (the only evidenced
 * value); scale is a plain {x, y, z} triple in metres.
 */
export const OBJECT_PRESETS = [
  { id: 'waystone', name: 'Waystone', description: 'A standing marker stone — tall, narrow, sparse.', params: { scale: { x: 0.8, y: 2.4, z: 0.8 }, density: 0.2, material: 'standard', color: '#9ca3af' } },
  { id: 'supply-crate', name: 'Supply Crate', description: 'A sturdy box, one metre a side, scattered everywhere.', params: { scale: { x: 1, y: 1, z: 1 }, density: 0.6, material: 'standard', color: '#d9a05b' } },
  { id: 'banquet-table', name: 'Banquet Table', description: 'Long, low, and common — set dressing for a hall.', params: { scale: { x: 3, y: 1, z: 1.2 }, density: 0.4, material: 'standard', color: '#6b4226' } },
  { id: 'lantern-post', name: 'Lantern Post', description: 'Thin and tall, glowing teal — a path marker.', params: { scale: { x: 0.3, y: 3, z: 0.3 }, density: 0.5, material: 'standard', color: '#00ffcc' } },
  { id: 'monolith', name: 'Monolith', description: 'A huge dark slab — rare, and impossible to miss.', params: { scale: { x: 2, y: 6, z: 1 }, density: 0.1, material: 'standard', color: '#2b2f36' } },
];
