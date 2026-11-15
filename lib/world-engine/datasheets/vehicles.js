// World Engine datasheet — VEHICLE BUILDER (/world-engine/vehicles).
//
// WHAT READS IT: lib/world-engine/sectors.js (VEHICLE_SLIDERS),
// lib/world-engine/useEngineStore.js (VEHICLE_STORE_DEFAULTS),
// components/world-engine/MiniViewport.jsx (preview: BoxGeometry(2, 0.8, 4),
// length stretched by speed, Omega badge on the hood).
//
// WHERE EVERY ENTRY CAME FROM:
// - VEHICLE_SLIDERS: lib/world-engine/sectors.js SECTORS.vehicles.sliders.
// - VEHICLE_STORE_DEFAULTS: lib/world-engine/useEngineStore.js
//   defaultVehicle.
// - VEHICLE_CLASSES: derived from the builder's own tagline in sectors.js
//   — "Design ground, air, and space vehicles." No class list exists in
//   code; the three words of the tagline are the classes. Labelled as
//   derived, not evidenced as an enum.
// - VEHICLE_PREVIEW: MiniViewport.jsx vehicle case, verbatim numbers.
// - COST: lib/world-engine/economy.js COST_MAP.vehicle (200 Aether).
// - VEHICLE_PRESETS: WORKER'S CHOICE — no presets existed in code. Speed
//   and handling stay inside the slider ranges; class comes from the
//   tagline-derived list.
//
// GAP (same as characters/objects): the synthesis API sends the generic
// environment instruction and applyAestheticEngine() returns only the 10
// environment keys, so a vehicle synthesis today comes back as environment
// params and the vehicle slice is effectively untouched by AI. A
// vehicle-aware system instruction + aesthetic branch would be needed
// before AI vehicle generation does anything. Flagged for Merlin's call.

import { costFor } from '../economy.js';

export const BUILDER = {
  id: 'vehicles',
  sectorKey: 'vehicles',
  route: '/world-engine/vehicles',
  name: 'Vehicle Builder',
  category: 'vehicle',
  accent: '#ff5500',
  costAether: costFor('vehicle'),
  storeKey: 'vehicle',
  storeSetter: 'setVehicleParams',
};

/**
 * Vehicle classes — DERIVED from the sector tagline "Design ground, air,
 * and space vehicles." (sectors.js). No class enum exists in code.
 */
export const VEHICLE_CLASSES = [
  { id: 'ground', label: 'Ground', note: 'Wheels, tracks, legs — stays on the surface.' },
  { id: 'air', label: 'Air', note: 'Flies in atmosphere — wings, rotors, lift.' },
  { id: 'space', label: 'Space', note: 'Vacuum-rated — thrusters, no wings needed.' },
];

/** Sliders — was SECTORS.vehicles.sliders in sectors.js. */
export const VEHICLE_SLIDERS = [
  { key: 'speed', label: 'Top speed', min: 10, max: 300, step: 5, default: 50, format: (v) => `${v} km/h` },
  { key: 'handling', label: 'Handling', min: 0.1, max: 1, step: 0.1, default: 0.7, format: (v) => `${v.toFixed(1)}x` },
];

/** Store defaults — was defaultVehicle in useEngineStore.js. */
export const VEHICLE_STORE_DEFAULTS = {
  scale: { x: 1, y: 1, z: 1 },
  speed: 50,
  handling: 0.7,
  color: '#ff5500',
};

/**
 * Preview geometry — MiniViewport.jsx vehicle case. The box is 2 wide,
 * 0.8 tall, 4 long; length grows with speed (geometry.scale z by
 * 1 + speed * 0.005); the Omega badge (0.4) sits on the hood/front.
 */
export const VEHICLE_PREVIEW = {
  geometry: 'BoxGeometry',
  dimensions: { x: 2, y: 0.8, z: 4 },
  lengthScale: (speed) => 1 + speed * 0.005,
  restHeight: 0.4,
  badge: { size: 0.4, position: [0, 0.1, 2.012], note: 'Omega badge on the hood/front' },
};

/**
 * VEHICLE_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Speed 10–300 km/h, handling 0.1–1.0 — the slider ranges.
 */
export const VEHICLE_PRESETS = [
  { id: 'city-runner', name: 'City Runner', description: 'Nimble ground car — quick, sharp, everyday.', params: { speed: 120, handling: 0.9, color: '#ff5500' }, vehicleClass: 'ground' },
  { id: 'hauler', name: 'Hauler', description: 'Heavy ground transport — slow, steady, huge.', params: { speed: 60, handling: 0.4, color: '#8a5a2b' }, vehicleClass: 'ground' },
  { id: 'sky-skiff', name: 'Sky Skiff', description: 'Light air craft — fast and loose in the sky.', params: { speed: 220, handling: 0.8, color: '#7fd4ff' }, vehicleClass: 'air' },
  { id: 'storm-interceptor', name: 'Storm Interceptor', description: 'Top of the speed range, handling to match.', params: { speed: 300, handling: 1.0, color: '#c084fc' }, vehicleClass: 'air' },
  { id: 'void-cruiser', name: 'Void Cruiser', description: 'Long-haul space frame — fast in a straight line.', params: { speed: 280, handling: 0.5, color: '#e5e7eb' }, vehicleClass: 'space' },
  { id: 'survey-rover', name: 'Survey Rover', description: 'Slow, sure-footed, built for rough ground.', params: { speed: 40, handling: 0.7, color: '#d9a05b' }, vehicleClass: 'ground' },
];
