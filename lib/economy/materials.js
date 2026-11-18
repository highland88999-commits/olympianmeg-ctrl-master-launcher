// lib/economy/materials.js
// THE SHARED MATERIAL REGISTRY (Merlin, Nov 17, 2026 — Mars 2 build mode).
//
// THE HONEST FINDING: no shared material system existed. Materials
// today are per-system backpack items, all `kind: 'material'`
// (lib/backpack/backpack.js BACKPACK_ITEM_KINDS): blood-sac (Earth 2),
// fossil (Earth 2, unique instances), orc-shard (Middle-earth hunts
// → Medusa head / Ghost Rider chain upgrades, 20/tier), Middle-earth
// hunt loot materials (generic ids), elemental orbs (Jupiter 2 /
// Hollow Earth — their own localStorage wallet, NOT backpack
// materials), aether shards (Earth 2 — ledger entries, not backpack
// items). Gold + aether are the two currencies (lib/economy/config.js).
//
// This file is the minimal shared registry the build-mode order
// calls for: every material is defined ONCE here — the existing
// ones registered (not redefined), the Mars-mined ones defined —
// so a material mined on Mars is the SAME material (same id, same
// backpack entry) a user collects anywhere else in the ecosystem.
// Any world that wants to hand out or spend a material reads it
// from here; nothing invents a parallel list. Pure, node-safe.

/** Every material in the ecosystem, defined once. */
export const MATERIALS = Object.freeze([
  // ── Already in the ecosystem (registered, not redefined) ──
  Object.freeze({
    id: 'blood-sac', name: 'Blood sac', color: '#b03040', icon: '🩸',
    source: 'Earth 2 — dropped by dinosaurs, carried to Dracula',
  }),
  Object.freeze({
    id: 'fossil', name: 'Fossil', color: '#d9c9a0', icon: '🦴',
    source: 'Earth 2 — dropped by dinosaurs, traded at the museum',
  }),
  Object.freeze({
    id: 'orc-shard', name: 'Orc Shard', color: '#7a9cc9', icon: '💠',
    source: 'Middle-earth hunts — spent on Medusa head / chain upgrades',
  }),
  // ── Mars-mined (defined here, first collected on Mars 2) ──
  // These are ecosystem materials from birth: any world may hand
  // out or spend the same ids, through this registry.
  Object.freeze({
    id: 'iron-ore', name: 'Iron Ore', color: '#c98a5a', icon: '⛏️',
    source: 'Mars 2 — mined at the Iron Flats',
  }),
  Object.freeze({
    id: 'silicon', name: 'Silicon', color: '#cfd6dd', icon: '🔷',
    source: 'Mars 2 — mined at the Silica Dunes',
  }),
  Object.freeze({
    id: 'titanium-ore', name: 'Titanium Ore', color: '#8a94a8', icon: '⬡',
    source: 'Mars 2 — mined at the Titanium Ridge',
  }),
  Object.freeze({
    id: 'water-ice', name: 'Water Ice', color: '#7fd4ff', icon: '🧊',
    source: 'Mars 2 — mined at the Ice Cap',
  }),
]);

/** The material definition for an id, or null. */
export function materialById(id) {
  if (typeof id !== 'string') return null;
  return MATERIALS.find((m) => m.id === id) || null;
}

/** True when the id is a registered material. */
export function isMaterialId(id) {
  return materialById(id) !== null;
}

/** Ids of the materials Mars 2 mines yield. */
export const MARS_MINE_MATERIAL_IDS = Object.freeze([
  'iron-ore', 'silicon', 'titanium-ore', 'water-ice',
]);

/**
 * A material as a backpack item input: the SAME shape every other
 * material uses (kind 'material', stacks, meta.source says where
 * it came from) — so a Mars-mined unit lands in the same pack
 * list as an orc shard or a blood sac. Returns null for an
 * unknown id or a non-positive qty.
 */
export function materialItemFor(id, qty, source) {
  const mat = materialById(id);
  const n = Math.floor(Number(qty) || 0);
  if (!mat || n < 1) return null;
  return {
    id: mat.id,
    kind: 'material',
    name: mat.name,
    qty: n,
    meta: { source: typeof source === 'string' && source ? source : 'mars-2-mine' },
  };
}
