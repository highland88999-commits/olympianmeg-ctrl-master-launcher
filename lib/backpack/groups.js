// lib/backpack/groups.js
// THE BACKPACK'S KIND GROUPS — one canonical list (Merlin, 2026-11-15).
//
// Both backpack panels (the profile section and the realm HUD)
// render from THIS list, so a kind can never again be minted
// without a visible home: 'medusa-head' and 'flaming-chain' sat
// in the record for a day, invisible in the profile pack, because
// each panel carried its own hand-written group list and neither
// listed them. The rule now: every kind in BACKPACK_ITEM_KINDS
// appears here, and the test in tests/backpack.test.mjs pins it.
//
// Order is the display order for the profile section. The realm
// HUD renders weapons in its own section above the groups and
// puts raised dinos first (they are the only entries you summon),
// so it reorders — but it never drops a group.
//
// 'other' catches kinds without a dedicated home (a picked peach
// lands there). It must never swallow the dedicated homes: a
// group renders only its own kind, and 'other' renders only
// kind 'other'.

export const BACKPACK_KIND_GROUPS = [
  { kind: 'weapon', label: 'Weapons', icon: '⚔️' },
  { kind: 'material', label: 'Materials', icon: '🧪' },
  { kind: 'collectible', label: 'Collectibles', icon: '💠' },
  { kind: 'consumable', label: 'Consumables', icon: '🧴' },
  { kind: 'dino', label: 'Raised dinos', icon: '🦖' },
  { kind: 'medusa-head', label: "Medusa's Head", icon: '🐍' },
  { kind: 'flaming-chain', label: 'Flaming Chain', icon: '⛓️' },
  { kind: 'other', label: 'Other', icon: '📦' },
];

/** The group record for one kind, or null when the kind has no home (a bug — the test pins that this never happens for a minted kind). */
export function groupForKind(kind) {
  return BACKPACK_KIND_GROUPS.find((g) => g.kind === kind) || null;
}
