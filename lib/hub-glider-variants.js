// lib/hub-glider-variants.js
// The solar-sail glider's variants — the "versions" users pick
// between (Merlin, Nov 27, 2026). Original designs only: three
// sails, three house colours, same board and rig. Pure data +
// persistence — no three.js, no DOM access except the guarded
// localStorage reads. Client-side only, no SQL.
//
//   Dart    — house Dart green sail (#00ff88), the default.
//   Ember   — crimson sail, gold accents.
//   Aurora  — teal sail, violet accents.

/** The variant list, in picker order. */
export const GLIDER_VARIANTS = [
  {
    id: 'dart',
    name: 'Dart',
    sail: '#00ff88',
    sailAccent: '#d8ffe9',
    board: '#10181f',
    trim: '#00ff88',
    rig: '#8a97a3',
  },
  {
    id: 'ember',
    name: 'Ember',
    sail: '#ff3b30',
    sailAccent: '#ffc94d',
    board: '#1f1210',
    trim: '#ffc94d',
    rig: '#8a97a3',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    sail: '#2dd4ff',
    sailAccent: '#8b5cf6',
    board: '#0f1622',
    trim: '#8b5cf6',
    rig: '#8a97a3',
  },
];

/** The default variant — Dart, the house green. */
export const DEFAULT_GLIDER_VARIANT_ID = 'dart';

/** localStorage key for the picked variant (client-side only). */
export const GLIDER_VARIANT_LS_KEY = 'olympus.hubGliderVariant';

/** True only for a real variant id. */
export function isGliderVariantId(id) {
  return GLIDER_VARIANTS.some((v) => v.id === id);
}

/** The variant record for an id, or the default when unknown. */
export function getGliderVariant(id) {
  return GLIDER_VARIANTS.find((v) => v.id === id) || GLIDER_VARIANTS[0];
}

function defaultStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

/** The stored variant id, or the default when nothing is stored. */
export function readGliderVariant(storage) {
  const store = storage || defaultStorage();
  if (!store) return DEFAULT_GLIDER_VARIANT_ID;
  try {
    const raw = store.getItem(GLIDER_VARIANT_LS_KEY);
    return isGliderVariantId(raw) ? raw : DEFAULT_GLIDER_VARIANT_ID;
  } catch {
    return DEFAULT_GLIDER_VARIANT_ID;
  }
}

/**
 * Store a variant pick. An unknown id is refused, never stored.
 * @returns true when the write happened.
 */
export function writeGliderVariant(id, storage) {
  if (!isGliderVariantId(id)) return false;
  const store = storage || defaultStorage();
  if (!store) return false;
  try {
    store.setItem(GLIDER_VARIANT_LS_KEY, id);
    return true;
  } catch {
    return false;
  }
}
