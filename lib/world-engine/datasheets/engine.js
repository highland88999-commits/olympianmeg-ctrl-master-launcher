// World Engine datasheet — 3D ENGINE (/world-engine/engine).
//
// WHAT READS IT: lib/world-engine/PrecisionEngine.js (imports
// ENGINE_RENDER from here — camera, controls, stars, terrain plane,
// peaks, engine-side weather particles), components/world-engine/
// WorldCanvas.jsx (boots PrecisionEngine with the store's world params
// clamped through applyAestheticEngine; live-updates on store change),
// app/world-engine/engine/page.jsx (orbit/zoom hints + library shortcut),
// components/world-engine/NeuralBackpack.jsx (library reads) and
// components/world-engine/CreditsPanel.jsx (credit HUD).
//
// WHERE EVERY ENTRY CAME FROM:
// - ENGINE_RENDER: lib/world-engine/PrecisionEngine.js, verbatim —
//   camera fov 55 / near 0.1 / far 2000, position (0, 16, 34); controls
//   damping 0.06, minDistance 8, maxDistance 120, maxPolarAngle PI*0.495;
//   stars 900; terrain PlaneGeometry(160, 160, 96, 96); peaks
//   mountains 14 / desert 5 / other 3 (same numbers as world.js
//   TERRAIN_PEAKS — kept in both sheets because both files read them);
//   engine weather particles floor(2500 * max(intensity, 0.05)), fall
//   speeds storm 0.9 else 0.35; water disc only for ocean terrain
//   (CircleGeometry 80 at y 0.4); sun light at (30, 40, 20); ambient
//   intensity = ambientLightIntensity * 0.6.
// - ENGINE_CONTROLS_HINT: app/world-engine/engine/page.jsx footer text
//   ("Drag to orbit · Scroll to zoom / Press I for your library").
//   ENGINE_WALK_HINT is the same footer's walk-mode text
//   ("WASD / arrows to move · Drag to look / V for orbit").
// - ENGINE_RENDER.walk: walk-mode constants, set in the Nov 15 walk build
//   (eye height 1.7 m, walk speed 6 m/s, half-bound 78 m — 2 m inside the
//   160 m terrain edge — look sensitivity 0.0032 rad/px, max pitch 1.45
//   rad, toggle key V). Walk reads the same terrain displacement the
//   mesh shows (lib/world-engine/PrecisionEngine.js groundHeight).
// - LIBRARY_RULES: components/world-engine/NeuralBackpack.jsx reads the
//   scoped world_engine_assets table (the same table ForgeSector saves
//   to); CreditsPanel shows the Aether balance (economy.js).
// - COST: the engine itself has NO synthesis cost — it renders what the
//   store already holds. costAether is null deliberately.
// - ENGINE_SCENES: WORKER'S CHOICE — no scene presets existed in code.
//   Each is a world-params object inside the aesthetic clamps, so the
//   engine renders it as-is.
//
// GAP — CLOSED Nov 15 (walk mode built): the task brief calls this "walk
// through your generated world live", but the code was an ORBIT viewer —
// OrbitControls, camera 16 m up and 34 m back, maxPolarAngle keeping the
// camera above the ground plane. Walk mode is now real: V or the "🚶 Walk"
// button toggles first-person walk (WASD/arrows + drag-to-look, camera at
// eye height on the real displaced terrain, clamped inside the 160 m
// plane). Orbit stays the default. No avatar in the engine yet, and no
// mobile joystick — phone users can drag to look but cannot move; that
// is Merlin's call for a follow-up pass.

import { WORLD_STORE_DEFAULTS } from './world.js';

export const BUILDER = {
  id: 'engine',
  sectorKey: null,
  route: '/world-engine/engine',
  name: '3D Engine',
  category: 'world',
  accent: '#ffffff',
  costAether: null,
  storeKey: 'world',
  storeSetter: 'setWorldParams',
};

/**
 * Render constants — was inline literals in PrecisionEngine.js.
 * PrecisionEngine now imports this object; values are unchanged.
 */
export const ENGINE_RENDER = {
  camera: { fov: 55, near: 0.1, far: 2000, position: [0, 16, 34], lookAt: [0, 0, 0] },
  controls: { enableDamping: true, dampingFactor: 0.06, minDistance: 8, maxDistance: 120, maxPolarAngleFactor: 0.495 },
  sunLight: { position: [30, 40, 20] },
  ambientLightFactor: 0.6,
  stars: { count: 900 },
  terrain: { size: 160, segments: 96, peaks: { mountains: 14, desert: 5, plains: 3, ocean: 3, alien: 3 } },
  water: { terrainTypes: ['ocean'], radius: 80, y: 0.4, opacity: 0.85 },
  weather: { baseParticles: 2500, minIntensity: 0.05, fallSpeed: { storm: 0.9, other: 0.35 } },
  walk: { eyeHeight: 1.7, walkSpeed: 6, halfBound: 78, lookSensitivity: 0.0032, maxPitch: 1.45, toggleKey: 'V' },
  life: { floraPerKind: (density) => Math.round(10 + density * 30), faunaPerArchetype: 5, scatterRange: 140 },
  fallbackProps: { countPerDensity: 60, scatterRange: 140 },
};

/** Controls hint — app/world-engine/engine/page.jsx footer (orbit mode).
 *  Kept as the plain orbit string: tests/world-engine-datasheets.test.mjs
 *  asserts this exact value. The walk-mode footer is ENGINE_WALK_HINT. */
export const ENGINE_CONTROLS_HINT = 'Drag to orbit · Scroll to zoom · Press I for your library';

/** Walk-mode footer hint — same page footer, shown while walking. */
export const ENGINE_WALK_HINT = 'WASD / arrows to move · Drag to look · V for orbit · Press I for your library';

/** What the engine boots from — the store's world slice, clamped. */
export const ENGINE_BOOT_PARAMS = { ...WORLD_STORE_DEFAULTS };

/**
 * Library + credits — the two HUD panels on the engine page.
 * NeuralBackpack reads world_engine_assets (scoped table); the credit
 * HUD shows the Aether balance (economy.js formatBalance).
 */
export const ENGINE_LIBRARY_RULES = {
  table: 'world_engine_assets',
  backpackShortcut: 'I',
};

/**
 * ENGINE_SCENES — WORKER'S CHOICE (no scene presets existed in code).
 * World-params objects inside the aesthetic clamps; the engine renders
 * each as-is. Names are the worker's choice; the numbers reuse the
 * World Builder preset values where they match.
 */
export const ENGINE_SCENES = [
  { id: 'home-plains', name: 'Home Plains', description: 'The default world — gentle, clear, ready to walk (orbit) around.', params: { ...WORLD_STORE_DEFAULTS, terrainType: 'plains', weatherType: 'clear' } },
  { id: 'storm-peaks-tour', name: 'Storm Peaks Tour', description: 'Snow mountains under a storm — the engine at its most dramatic.', params: { ...WORLD_STORE_DEFAULTS, terrainType: 'mountains', terrainRoughness: 1.0, weatherType: 'storm', precipitationIntensity: 0.8, windSpeed: 60, sunColor: '#cfe4ff' } },
  { id: 'ocean-dawn', name: 'Ocean Dawn', description: 'A water world at first light, rain on the horizon.', params: { ...WORLD_STORE_DEFAULTS, terrainType: 'ocean', terrainRoughness: 0.3, weatherType: 'rain', precipitationIntensity: 0.6, windSpeed: 20, sunColor: '#9fd8ff' } },
];
