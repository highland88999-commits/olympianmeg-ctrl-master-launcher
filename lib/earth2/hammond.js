// lib/earth2/hammond.js
// EARTH 2 — JOHN HAMMOND'S EXCHANGE (Merlin, 2026-10-22): carry a
// fossil to John Hammond at the Royal Tyrrell Museum (lib/earth2/
// museum.js) and he buys it — for GOLD or for AETHER, the hunter's
// choice. And occasionally — Merlin's words — "John Hammond will
// give users a weapon instead of aether or gold": the old founder
// looks at your fossil, smiles, and decides what it is really
// worth to him.
//
// This module is the pure engine of that counter. Like Dracula's
// gift table (lib/earth2/gifts.js) it decides and returns a full
// record; APPLYING the record — crediting the gold/aether tallies,
// taking the fossil from the pack, shelving the weapon — is the
// caller's work (the pattern blood-sacs.js follows for gifts).
// Every exchange is lossless to audit: the record carries the
// fossil, its graded value, the currency the user ASKED for, the
// outcome they GOT, and the substitution roll that decided it.
//
// THE AETHER RULE: a fossil's worth is denominated in gold (lib/
// earth2/fossils.js grades it). Hammond refines at the platform's
// standing rate — the refinery's conversion in lib/economy/
// config.js pays AETHER_PER_BAR (1) per bar of MINE_GOLD_PER_BAR
// (25) gold-value, under the 1000-gold = $1 scale (GOLD_PER_
// DOLLAR): one aether per 25 gold-value. So the aether payout is
// floor(goldValue / 25) — with one founder's courtesy: a Complete
// or Museum-grade fossil always refines to at least 1 aether,
// however small. A Fragment or Partial fossil worth less than 25
// gold cannot refine at all; Hammond pays its gold value instead
// and the record says so (refinedFallback) — an exchange at his
// counter never pays nothing.

import { fossilConditionById } from './fossils.js';

/** Gold-value that refines into one aether (the refinery rate:
 *  AETHER_PER_BAR 1 per MINE_GOLD_PER_BAR 25 gold-value). */
export const GOLD_VALUE_PER_AETHER = 25;

/** Aether paid per unit of gold value: 1/25. Kept beside its
 *  divisor so the rate reads both ways; the engine divides by
 *  GOLD_VALUE_PER_AETHER to stay in exact integer arithmetic. */
export const AETHER_PER_GOLD = 1 / GOLD_VALUE_PER_AETHER;

/** The chance, per exchange, that Hammond substitutes a weapon
 *  for the currency — rolled whatever currency the user chose. */
export const WEAPON_SUBSTITUTION_CHANCE = 0.08;

/** Condition grades good enough to always refine to ≥ 1 aether. */
export const AETHER_MINIMUM_CONDITIONS = ['complete', 'museum-grade'];

// Hammond's own cabinet — fossil, bone and amber work, weighted
// like the Count's table (weights sum to 100, the rare rides
// small). The legendary piece is the founder's own cane: the
// amber top, it turns out, was never just for walking.
export const HAMMOND_WEAPON_TABLE = [
  { id: 'weapon-terrorbone-club', weapon: 'Terrorbone Club', rarity: 'common', weight: 40 },
  { id: 'weapon-raptorclaw-kris', weapon: 'Raptorclaw Kris', rarity: 'uncommon', weight: 27 },
  { id: 'weapon-amberfang-spear', weapon: 'Amberfang Spear', rarity: 'rare', weight: 18 },
  { id: 'weapon-fossilplate-maul', weapon: 'Fossilplate Maul', rarity: 'epic', weight: 10 },
  { id: 'weapon-hammonds-cane', weapon: "Hammond's Amber Cane", rarity: 'legendary', weight: 5 },
];

export const HAMMOND_WEAPON_WEIGHT_TOTAL =
  HAMMOND_WEAPON_TABLE.reduce((sum, w) => sum + w.weight, 0);

/** Roll one weapon from Hammond's cabinet on the injectable rng.
 *  Returns a fresh { id, weapon, rarity } object. */
export function rollHammondWeapon(rng = Math.random) {
  const roll = (typeof rng === 'function' ? rng() : Math.random()) * HAMMOND_WEAPON_WEIGHT_TOTAL;
  let acc = 0;
  for (const w of HAMMOND_WEAPON_TABLE) {
    acc += w.weight;
    if (roll < acc) return { id: w.id, weapon: w.weapon, rarity: w.rarity };
  }
  const last = HAMMOND_WEAPON_TABLE[HAMMOND_WEAPON_TABLE.length - 1];
  return { id: last.id, weapon: last.weapon, rarity: last.rarity };
}

/** One cabinet entry by id, or null. */
export function hammondWeaponById(id) {
  return HAMMOND_WEAPON_TABLE.find((w) => w.id === id) || null;
}

/**
 * The aether a fossil refines to, before the founder's courtesy:
 * floor(goldValue / 25); a Complete or Museum-grade fossil floors
 * at 1 (it always refines); a Fragment or Partial below 25 gold
 * refines to 0 — the caller pays its gold instead.
 */
export function aetherForFossil(fossil) {
  const value = Math.max(0, Math.floor(Number(fossil && fossil.goldValue) || 0));
  const refined = Math.floor(value / GOLD_VALUE_PER_AETHER);
  if (refined >= 1) return refined;
  if (fossil && AETHER_MINIMUM_CONDITIONS.includes(fossil.condition)) return 1;
  return 0;
}

function isFossilLike(fossil) {
  return !!fossil && typeof fossil === 'object'
    && typeof fossil.species === 'string' && !!fossil.species
    && !!fossilConditionById(fossil.condition)
    && Number.isFinite(Number(fossil.goldValue)) && Number(fossil.goldValue) >= 1;
}

/**
 * Exchange one fossil at Hammond's counter.
 *
 * fossil: a fossil instance from lib/earth2/fossils.js.
 * currencyChoice: 'gold' | 'aether' — anything else reads as gold.
 * rng: injectable () => [0,1) source (Math.random in play).
 *
 * The substitution roll comes first: at WEAPON_SUBSTITUTION_CHANCE
 * the user receives a weapon INSTEAD of any currency, whichever
 * currency they asked for. Otherwise the fossil pays its graded
 * gold value in the chosen currency (aether at the rule above;
 * an unrefinable fossil falls back to gold, flagged).
 *
 * Returns the full audit record, or null for a malformed fossil:
 * { fossilId, species, speciesName, type, condition, goldValue,
 *   currencyChoice, outcome: 'gold'|'aether'|'weapon', amount,
 *   weapon, weaponId, weaponRarity, substitutionRoll,
 *   refinedFallback }
 * amount is gold for a gold outcome, aether for an aether outcome,
 * and 0 when a weapon changes hands instead.
 */
export function exchangeFossil(fossil, currencyChoice, rng = Math.random) {
  if (!isFossilLike(fossil)) return null;
  const rand = typeof rng === 'function' ? rng : Math.random;
  const choice = currencyChoice === 'aether' ? 'aether' : 'gold';
  const goldValue = Math.max(1, Math.floor(Number(fossil.goldValue)));

  const record = {
    fossilId: typeof fossil.id === 'string' ? fossil.id : null,
    species: fossil.species,
    speciesName: typeof fossil.speciesName === 'string' ? fossil.speciesName : fossil.species,
    type: typeof fossil.type === 'string' ? fossil.type : '',
    condition: fossil.condition,
    goldValue,
    currencyChoice: choice,
    outcome: 'gold',
    amount: 0,
    weapon: null,
    weaponId: null,
    weaponRarity: null,
    substitutionRoll: null,
    refinedFallback: false,
  };

  // The founder's whim — rolled regardless of the currency asked.
  const substitutionRoll = rand();
  record.substitutionRoll = substitutionRoll;
  if (substitutionRoll < WEAPON_SUBSTITUTION_CHANCE) {
    const w = rollHammondWeapon(rand);
    record.outcome = 'weapon';
    record.amount = 0;
    record.weapon = w.weapon;
    record.weaponId = w.id;
    record.weaponRarity = w.rarity;
    return record;
  }

  if (choice === 'aether') {
    const aether = aetherForFossil(fossil);
    if (aether >= 1) {
      record.outcome = 'aether';
      record.amount = aether;
      return record;
    }
    // Too small to refine — Hammond pays gold and says so.
    record.outcome = 'gold';
    record.amount = goldValue;
    record.refinedFallback = true;
    return record;
  }

  record.outcome = 'gold';
  record.amount = goldValue;
  return record;
}
