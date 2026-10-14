// lib/controls/settings.js
//
// Controller settings + persistence (Merlin's design, 2026-10-13):
// users tune the controller in Settings; the STABILITY RULE is law —
// "Device motion where set should not change": the last choice a user
// made is restored on every load and NEVER changes on its own.
// Custom placements are saved the moment they're set.
//
// Step 5 persists to localStorage under one account-namespaced-by-
// device key (olympus.controllerSettings). Account-synced storage
// (Supabase) is wiring-plan Step 7, behind its SQL gate — this module
// is the only reader/writer so that step swaps the backend in one
// place.
//
// Pure + injectable storage: headless tests pass a fake.

export const CONTROLLER_SETTINGS_KEY = 'olympus.controllerSettings';

export const LAYOUT_IDS = ['signature', 'low', 'ghost', 'mirrored', 'custom'];

export const LAYOUT_LABELS = {
  signature: 'Signature',
  low: 'Low',
  ghost: 'Ghost',
  mirrored: 'Mirrored',
  custom: 'Custom',
};

// Per-layout look + placement feel. Layouts are variations of
// Merlin's arrangement only — the pads, their shapes and their
// groupings never move between layouts; position/scale/presence do.
export const LAYOUT_TRAITS = {
  signature: { bottomShift: 0, scaleMul: 1, idleOpacity: 0.5, mirror: false },
  low: { bottomShift: -10, scaleMul: 1, idleOpacity: 0.5, mirror: false },
  ghost: { bottomShift: 0, scaleMul: 0.85, idleOpacity: 0.22, mirror: false },
  mirrored: { bottomShift: 0, scaleMul: 1, idleOpacity: 0.5, mirror: true },
  custom: { bottomShift: 0, scaleMul: 1, idleOpacity: 0.5, mirror: false },
};

export const DEFAULT_CONTROLLER_SETTINGS = Object.freeze({
  layout: 'signature',
  padScale: 1, // 0.8 .. 1.3 — overall pad size
  borderOpacity: 0.55, // 0.15 .. 1 — borders rest semi-transparent
  labels: true, // wedge labels ringed outside the rim
  desktopMode: 'standard', // 'standard' | 'mousepad'
  cameraSensitivity: 1, // 0.4 .. 2 — dead-space camera surfaces
  invertY: false, // camera surfaces, where applicable
  custom: Object.freeze({}), // padId -> { x, y, scale } (layer % coords)
});

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** Validate + clamp anything (stored JSON, panel input) into settings. */
export function sanitizeControllerSettings(raw) {
  const d = DEFAULT_CONTROLLER_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, custom: {} };
  const layout = LAYOUT_IDS.includes(raw.layout) ? raw.layout : d.layout;
  const custom = {};
  if (raw.custom && typeof raw.custom === 'object') {
    for (const [padId, pos] of Object.entries(raw.custom)) {
      if (!pos || typeof pos !== 'object') continue;
      const x = clamp(pos.x, 2, 98, NaN);
      const y = clamp(pos.y, 2, 98, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      custom[padId] = { x, y, scale: clamp(pos.scale, 0.6, 1.6, 1) };
    }
  }
  return {
    layout,
    padScale: clamp(raw.padScale, 0.8, 1.3, d.padScale),
    borderOpacity: clamp(raw.borderOpacity, 0.15, 1, d.borderOpacity),
    labels: raw.labels === false ? false : true,
    desktopMode: raw.desktopMode === 'mousepad' ? 'mousepad' : 'standard',
    cameraSensitivity: clamp(raw.cameraSensitivity, 0.4, 2, d.cameraSensitivity),
    invertY: raw.invertY === true,
    custom,
  };
}

export function browserStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* private mode etc. */ }
  return null;
}

/**
 * Load the last-chosen settings. Missing/corrupt storage yields the
 * Signature defaults — a fresh device starts from Merlin's
 * arrangement, never from a random state.
 */
export function loadControllerSettings(storage = browserStorage()) {
  if (!storage) return { ...DEFAULT_CONTROLLER_SETTINGS, custom: {} };
  try {
    const raw = storage.getItem(CONTROLLER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CONTROLLER_SETTINGS, custom: {} };
    return sanitizeControllerSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTROLLER_SETTINGS, custom: {} };
  }
}

/** Persist immediately — a choice, once made, is the restored choice. */
export function saveControllerSettings(settings, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(CONTROLLER_SETTINGS_KEY, JSON.stringify(sanitizeControllerSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
