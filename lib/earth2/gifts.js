// lib/earth2/gifts.js
// EARTH 2 — DRACULA'S GIFT TABLE (Merlin, 2026-10-22): bring a blood
// sac to Dracula at Castle Transylvania and he trades it for a gift,
// randomly selected — weapons, gold, aether, etc.
//
// The table is weighted; rarer gifts ride smaller weights. The roll
// itself is REAL randomness (a gift roll is not world generation, so
// the procedural-seed law does not apply here) — but the RNG is
// injectable so tests can drive the table with a seeded source and
// prove every outcome is reachable at sane rates.
//
// Pure: no imports, no storage, no clock. Applying a gift to the
// player's preview tallies lives in lib/earth2/blood-sacs.js.

export const GIFT_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * The Count's table. Weights sum to 100.
 * kind: 'gold' | 'aether' | 'weapon' | 'jackpot'
 * gold/aether are amounts; weapon is the gifted weapon's name;
 * the jackpot carries both gold and aether.
 */
export const GIFT_TABLE = [
  { id: 'gold-25', kind: 'gold', label: '25 gold', rarity: 'common', weight: 28, gold: 25 },
  { id: 'gold-100', kind: 'gold', label: '100 gold', rarity: 'common', weight: 20, gold: 100 },
  { id: 'aether-1', kind: 'aether', label: 'Aether shard', rarity: 'common', weight: 17, aether: 1 },
  { id: 'aether-3', kind: 'aether', label: 'Aether shards ×3', rarity: 'uncommon', weight: 8, aether: 3 },
  { id: 'gold-500', kind: 'gold', label: '500 gold', rarity: 'rare', weight: 7, gold: 500 },
  { id: 'weapon-silverfang', kind: 'weapon', label: 'Silverfang Dagger', rarity: 'rare', weight: 7, weapon: 'Silverfang Dagger' },
  { id: 'weapon-nightreaver', kind: 'weapon', label: 'Nightreaver Bow', rarity: 'rare', weight: 5, weapon: 'Nightreaver Bow' },
  { id: 'gold-1000', kind: 'gold', label: "The Count's purse — 1,000 gold", rarity: 'epic', weight: 3, gold: 1000 },
  { id: 'weapon-bloodmoon', kind: 'weapon', label: 'Bloodmoon Rifle', rarity: 'epic', weight: 3, weapon: 'Bloodmoon Rifle' },
  { id: 'jackpot-favor', kind: 'jackpot', label: "Dracula's Favor", rarity: 'legendary', weight: 2, gold: 2500, aether: 10 },
];

export const GIFT_WEIGHT_TOTAL = GIFT_TABLE.reduce((sum, g) => sum + g.weight, 0);

/**
 * Roll one gift. rng is a () => [0,1) source (Math.random in play;
 * a seeded source in tests). Returns a fresh gift object:
 * { id, kind, label, rarity, gold, aether, weapon } with amounts
 * zeroed/null when the gift does not carry them.
 */
export function rollGift(rng = Math.random) {
  const roll = (typeof rng === 'function' ? rng() : Math.random()) * GIFT_WEIGHT_TOTAL;
  let acc = 0;
  for (const g of GIFT_TABLE) {
    acc += g.weight;
    if (roll < acc) return giftInstance(g);
  }
  return giftInstance(GIFT_TABLE[GIFT_TABLE.length - 1]);
}

function giftInstance(g) {
  return {
    id: g.id,
    kind: g.kind,
    label: g.label,
    rarity: g.rarity,
    gold: g.gold || 0,
    aether: g.aether || 0,
    weapon: g.weapon || null,
  };
}

/** One table entry by id, or null. */
export function giftById(id) {
  return GIFT_TABLE.find((g) => g.id === id) || null;
}
