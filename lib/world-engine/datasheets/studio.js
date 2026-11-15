// World Engine datasheet — HOLOGRAM STUDIO (/world-engine/studio).
//
// WHAT READS IT: app/world-engine/studio/page.jsx — the ONLY consumer.
// The page previously held every value inline in useState literals and an
// inline slider array; it now imports STUDIO_DEFAULTS, STUDIO_SLIDERS,
// STUDIO_LIMITS and HOLOGRAM_SCHEMA from here. Values are identical.
//
// WHERE EVERY ENTRY CAME FROM (all from app/world-engine/studio/page.jsx):
// - STUDIO_DEFAULTS: the useState initial values (text 'WORLD ENGINE',
//   color '#00ffcc', scale 4, glowIntensity 1.5, rotationX/Y 0).
// - STUDIO_SLIDERS: the inline slider array (Size 1–10 step 0.5; Glow
//   0–3 step 0.1; Tilt/Turn −90–90 step 1).
// - STUDIO_LIMITS: maxLength 60 on the text input; the preview caps glow
//   at 3 (Math.min(glowIntensity, 3) * 8 px text-shadow blur); font is
//   monospace bold; perspective 1000px on the preview pane.
// - HOLOGRAM_SCHEMA: the exported JSON shape — assetType
//   'HolographicMesh', parameters { content, emissiveColor,
//   scaleMultiplier, bloomIntensity, rotation {x, y, z: 0} }.
// - SAVE_RULES: saveToLibrary() — requires a Supabase session (else
//   'Sign in from the launcher to save to your library.'); inserts into
//   world_engine_assets with name `Hologram: <text sliced to 40>`,
//   category 'object', asset_url 'procedural_generation', and
//   generation_params = the schema parameters.
// - COST: the studio has NO synthesis cost in code — it never calls the
//   synthesize API and is not in COST_MAP or SECTORS. costAether is null
//   deliberately; if Merlin wants holograms charged, that is a new rule.
//
// GAP: the preview is a 2D CSS approximation (text-shadow glow), not a
// 3D hologram — the schema is "3D-ready" but nothing renders it in 3D
// today. A real 3D hologram renderer would be new capability, flagged
// for Merlin's call.

export const BUILDER = {
  id: 'studio',
  sectorKey: null,
  route: '/world-engine/studio',
  name: 'Hologram Studio',
  category: 'object',
  accent: '#a78bfa',
  costAether: null,
  storeKey: null,
  storeSetter: null,
};

/** Defaults — was the useState initial values in studio/page.jsx. */
export const STUDIO_DEFAULTS = {
  text: 'WORLD ENGINE',
  color: '#00ffcc',
  scale: 4,
  glowIntensity: 1.5,
  rotationX: 0,
  rotationY: 0,
};

/** Sliders — was the inline slider array in studio/page.jsx. */
export const STUDIO_SLIDERS = [
  { key: 'scale', label: 'Size', min: 1, max: 10, step: 0.5, default: 4, format: (v) => `${v}x` },
  { key: 'glowIntensity', label: 'Glow', min: 0, max: 3, step: 0.1, default: 1.5, format: (v) => `${v}` },
  { key: 'rotationX', label: 'Tilt', min: -90, max: 90, step: 1, default: 0, format: (v) => `${v}°` },
  { key: 'rotationY', label: 'Turn', min: -90, max: 90, step: 1, default: 0, format: (v) => `${v}°` },
];

/** Limits + preview rules — from studio/page.jsx. */
export const STUDIO_LIMITS = {
  maxTextLength: 60,
  maxSaveNameLength: 40,
  glowCapForPreview: 3,
  previewGlowBlurPxPerUnit: 8,
  previewFontFamily: 'monospace',
  previewFontWeight: 'bold',
  previewPerspectivePx: 1000,
};

/**
 * Exported schema shape — from exportSchema in studio/page.jsx.
 * buildSchema() reproduces it exactly from a params object.
 */
export const HOLOGRAM_SCHEMA = {
  assetType: 'HolographicMesh',
  parameters: ['content', 'emissiveColor', 'scaleMultiplier', 'bloomIntensity', 'rotation'],
};

export function buildHologramSchema(params = {}) {
  const p = { ...STUDIO_DEFAULTS, ...params };
  return {
    assetType: 'HolographicMesh',
    parameters: {
      content: p.text,
      emissiveColor: p.color,
      scaleMultiplier: p.scale,
      bloomIntensity: p.glowIntensity,
      rotation: { x: p.rotationX, y: p.rotationY, z: 0 },
    },
  };
}

/** CSS preview style — the live 2D approximation in studio/page.jsx. */
export function hologramPreviewStyle(params = {}) {
  const p = { ...STUDIO_DEFAULTS, ...params };
  return {
    color: p.color,
    fontSize: `${p.scale}rem`,
    textShadow: `0 0 ${Math.min(p.glowIntensity, STUDIO_LIMITS.glowCapForPreview) * STUDIO_LIMITS.previewGlowBlurPxPerUnit}px ${p.color}`,
    transform: `rotateX(${p.rotationX}deg) rotateY(${p.rotationY}deg)`,
    fontFamily: STUDIO_LIMITS.previewFontFamily,
    fontWeight: STUDIO_LIMITS.previewFontWeight,
    textAlign: 'center',
  };
}

/**
 * Library save mapping — from saveToLibrary() in studio/page.jsx.
 * Requires a signed-in session; the table is world_engine_assets.
 */
export const STUDIO_SAVE_RULES = {
  table: 'world_engine_assets',
  category: 'object',
  assetUrl: 'procedural_generation',
  namePrefix: 'Hologram: ',
  nameMaxLength: 40,
  requiresSession: true,
  signInNotice: 'Sign in from the launcher to save to your library.',
};

/** Preset holograms — WORKER'S CHOICE (no presets existed in code). */
export const STUDIO_PRESETS = [
  { id: 'world-engine', name: 'World Engine', description: 'The studio default — teal, bold, straight on.', params: { text: 'WORLD ENGINE', color: '#00ffcc', scale: 4, glowIntensity: 1.5, rotationX: 0, rotationY: 0 } },
  { id: 'olympus', name: 'Olympus', description: 'Gold title, high glow, slight tilt — a monument sign.', params: { text: 'OLYMPUS', color: '#ffd700', scale: 6, glowIntensity: 2.5, rotationX: -10, rotationY: 0 } },
  { id: 'warning', name: 'Warning', description: 'Red alert text, maximum glow, turned to face the room.', params: { text: 'WARNING', color: '#ff2222', scale: 5, glowIntensity: 3, rotationX: 0, rotationY: -20 } },
  { id: 'welcome', name: 'Welcome', description: 'Soft violet greeting, gentle glow.', params: { text: 'WELCOME', color: '#a78bfa', scale: 4, glowIntensity: 1.0, rotationX: 0, rotationY: 15 } },
  { id: 'exit', name: 'Exit', description: 'Small green exit sign, low glow.', params: { text: 'EXIT →', color: '#00ff00', scale: 2, glowIntensity: 0.8, rotationX: 0, rotationY: 0 } },
];
