// World Engine datasheet — ASSET UPLINK (/world-engine/uplink).
//
// WHAT READS IT: lib/world-engine/sectors.js (UPLINK_SLIDERS),
// lib/world-engine/useEngineStore.js (ASSET_LINK_STORE_DEFAULTS),
// components/world-engine/MiniViewport.jsx (preview: BoxGeometry from
// scale — the same box as Object Builder — with the Omega badge on the
// front face), app/api/world-engine/synthesize/route.js via
// lib/world-engine/gemini.js validateSynthesizeInput() (URL rules).
//
// WHERE EVERY ENTRY CAME FROM:
// - UPLINK_SLIDERS: lib/world-engine/sectors.js SECTORS.uplink.sliders
//   (the only slider whose stored shape is a {x, y, z} triple).
// - ASSET_LINK_STORE_DEFAULTS: lib/world-engine/useEngineStore.js
//   defaultAssetLink.
// - URL_RULES: lib/world-engine/gemini.js validateSynthesizeInput() —
//   targetUrl must start with http:// or https://, prompt capped at 2000
//   chars, targetUrl capped at 500 chars; at least one of prompt/URL is
//   required (ForgeSector enforces the same before calling).
// - FORMATS: only 'glb' is evidenced anywhere in World Engine code (the
//   store default). No other format string appears; .gltf/.fbx/.obj support
//   is NOT evidenced — see GAP below.
// - COST: lib/world-engine/economy.js COST_MAP.asset_link (50 Aether —
//   the cheapest synthesis in the module).
// - UPLINK_PRESETS: WORKER'S CHOICE — no presets existed in code. Scale
//   inside the 0.1–10 slider; URLs are the example shape only (placeholder
//   hosts, not real assets).
//
// GAP: the preview never loads the linked model — MiniViewport renders a
// plain box for asset_link, exactly as for objects. There is no loader,
// no format check, and no size/type validation of the URL target in code.
// Whether the uplink should fetch-and-preview the GLB (and which formats
// beyond 'glb' are supported) is a new capability, flagged for Merlin's
// call. The library save path (ForgeSector -> world_engine_assets, with
// asset_url = the pasted URL or 'procedural_generation') is unchanged.

import { costFor } from '../economy.js';

export const BUILDER = {
  id: 'uplink',
  sectorKey: 'uplink',
  route: '/world-engine/uplink',
  name: 'Asset Uplink',
  category: 'asset_link',
  accent: '#00ff00',
  costAether: costFor('asset_link'),
  storeKey: 'assetLink',
  storeSetter: 'setAssetLink',
};

/** Asset formats — only 'glb' is evidenced (store default). */
export const ASSET_FORMATS = ['glb'];
export const ASSET_FORMATS_EVIDENCED = ['glb'];

/**
 * URL + input rules — lib/world-engine/gemini.js validateSynthesizeInput().
 */
export const URL_RULES = {
  schemes: ['http://', 'https://'],
  pattern: /^https?:\/\//i,
  maxPromptChars: 2000,
  maxUrlChars: 500,
  requiresPromptOrUrl: true,
};

/** Sliders — was SECTORS.uplink.sliders in sectors.js. */
export const UPLINK_SLIDERS = [
  {
    key: 'scale', label: 'Import scale', min: 0.1, max: 10, step: 0.1, default: 1,
    display: (v) => (v && typeof v.x === 'number' ? v.x : 1),
    format: (v) => `${(v && typeof v.x === 'number' ? v.x : 1).toFixed(1)}x`,
  },
];

/** Store defaults — was defaultAssetLink in useEngineStore.js. */
export const ASSET_LINK_STORE_DEFAULTS = {
  url: '',
  type: 'glb',
  scale: { x: 1, y: 1, z: 1 },
};

/**
 * Preview geometry — MiniViewport.jsx asset_link case (same box as
 * Object Builder; the linked model itself is never loaded in the preview).
 */
export const UPLINK_PREVIEW = {
  geometry: 'BoxGeometry',
  dimensionsFromScale: (scale) => ({ x: scale?.x || 1, y: scale?.y || 1, z: scale?.z || 1 }),
  restHeight: (scale) => (scale?.y || 1) / 2,
  badge: { size: 0.3, note: 'Omega badge on the front face; the linked GLB is not rendered' },
  loadsLinkedModel: false,
};

/**
 * UPLINK_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Scale inside the 0.1–10 slider. URLs are placeholder examples of the
 * expected shape, not real assets — replace with a real GLB URL to use.
 */
export const UPLINK_PRESETS = [
  { id: 'hero-prop', name: 'Hero Prop', description: 'A full-size linked prop, imported at natural scale.', params: { url: 'https://example.com/models/hero-prop.glb', type: 'glb', scale: { x: 1, y: 1, z: 1 } } },
  { id: 'miniature', name: 'Miniature', description: 'A linked model shrunk to tabletop size.', params: { url: 'https://example.com/models/miniature.glb', type: 'glb', scale: { x: 0.25, y: 0.25, z: 0.25 } } },
  { id: 'monument', name: 'Monument', description: 'A linked model blown up to landmark size.', params: { url: 'https://example.com/models/monument.glb', type: 'glb', scale: { x: 5, y: 5, z: 5 } } },
];
