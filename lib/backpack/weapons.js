// lib/backpack/weapons.js
// THE WEAPONS FORGE CATALOGUE + FORGE MATH (Merlin, 2026-10-23).
//
// The forge's shelves start from the weapons Earth 2 already
// names — Dracula's gifted trio (lib/earth2/gifts.js) and Hammond's
// cabinet (lib/earth2/hammond.js) — plus a basic tier designed for
// new travellers. Every entry carries: name, weapon class, damage,
// rarity, and its FORGE COST. Every weapon also carries a reticle:
// the class default from lib/backpack/backpack.js (RETICLE_BY_
// CLASS) unless the entry names its own style — the reticle law
// stamps it onto the backpack entry at creation, so a forged (or
// gifted) weapon can never exist without one.
//
// COSTS — paid from two purses, both verifiable server-side:
//   bars:      gold bars, the refinery's upgrade currency. The
//              balance of record is the refinery save (lib/
//              economy/refinery.js — game_state.bars); the forge
//              route debits it through that save's own writer.
//   materials: backpack stock —
//              { item: 'fossil', qty }   any fossil specimens held
//                                        (the lowest-value leave
//                                        the pack first — Hammond
//                                        keeps the good ones
//                                        tradeable);
//              { item: 'blood-sac', qty } blood sacs from the
//                                        mosquito loop.
//
// Damage values are the forge's own ratings (the gift tables never
// carried any); they rate the weapon for the gun system's arrival.

import {
  createItem,
  countItem,
  defaultReticleForClass,
  removeEntry,
  removeItem,
  sanitizeBackpackRecord,
} from './backpack.js';

const W = (id, name, weaponClass, damage, rarity, bars, materials, blurb) => ({
  id, name, weaponClass, damage, rarity, cost: { bars, materials }, blurb,
});
const FOSSILS = (qty) => ({ item: 'fossil', qty });
const SACS = (qty) => ({ item: 'blood-sac', qty });

export const FORGE_WEAPONS = [
  // ── The basic tier — a new traveller's first steel ──────────
  W('flint-shiv', 'Flint Shiv', 'blade', 6, 'common', 0, [FOSSILS(1)],
    'Knapped stone on a wrapped grip. Better than bare hands.'),
  W('driftwood-bow', 'Driftwood Bow', 'bow', 9, 'common', 1, [FOSSILS(1)],
    'Shore-worn wood, sinew string. Quiet and honest.'),
  W('scrap-spear', 'Scrap Spear', 'spear', 11, 'common', 1, [FOSSILS(2)],
    'A haft, a point, and reach enough to matter.'),
  W('bronze-gladius', 'Bronze Gladius', 'blade', 15, 'uncommon', 3, [FOSSILS(1)],
    'Short, heavy, and older than the empire that cast it.'),
  W('ember-revolver', 'Ember Revolver', 'firearm', 20, 'uncommon', 5, [FOSSILS(2)],
    'Six chambers of banked fire. The forge’s first gun.'),

  // ── Dracula's gifted names (lib/earth2/gifts.js) ────────────
  W('silverfang-dagger', 'Silverfang Dagger', 'blade', 22, 'rare', 6, [FOSSILS(2)],
    'The Count’s gift, reforged: silver over a fang’s core.'),
  W('nightreaver-bow', 'Nightreaver Bow', 'bow', 24, 'rare', 7, [FOSSILS(2)],
    'Strung with night itself; arrows find the dark first.'),
  W('bloodmoon-rifle', 'Bloodmoon Rifle', 'firearm', 34, 'epic', 12, [SACS(3)],
    'Chambered under a red moon. It drinks what it kills.'),

  // ── Hammond's cabinet (lib/earth2/hammond.js) ───────────────
  W('terrorbone-club', 'Terrorbone Club', 'blunt', 16, 'common', 2, [FOSSILS(2)],
    'One femur, one argument, settled the old way.'),
  W('raptorclaw-kris', 'Raptorclaw Kris', 'blade', 19, 'uncommon', 4, [FOSSILS(2)],
    'A wavy blade ground from a sickle claw.'),
  W('amberfang-spear', 'Amberfang Spear', 'spear', 23, 'rare', 6, [FOSSILS(3)],
    'The point is a tooth that waited 60 million years.'),
  W('fossilplate-maul', 'Fossilplate Maul', 'blunt', 30, 'epic', 10, [FOSSILS(4)],
    'A frill plate faced in stone. Doors are a suggestion.'),
  W('hammonds-amber-cane', "Hammond's Amber Cane", 'cane', 28, 'legendary', 20, [FOSSILS(5), SACS(1)],
    'The founder’s own cane — the amber top was never just for walking.'),
];

export const FORGE_WEAPON_BY_ID = new Map(FORGE_WEAPONS.map((w) => [w.id, w]));
export const FORGE_WEAPON_BY_NAME = new Map(FORGE_WEAPONS.map((w) => [w.name, w]));

/** One catalogue weapon by id, or null. */
export function forgeWeaponById(id) {
  return FORGE_WEAPON_BY_ID.get(id) || null;
}

/** One catalogue weapon by its display name, or null. */
export function forgeWeaponByName(name) {
  return FORGE_WEAPON_BY_NAME.get(name) || null;
}

/** The reticle style a catalogue weapon wears (its own pick when
 *  it names one, else the class default — the law's table). */
export function forgeWeaponReticle(weapon) {
  if (!weapon) return null;
  return weapon.reticleStyle || defaultReticleForClass(weapon.weaponClass);
}

/**
 * A backpack weapon entry for a catalogue weapon — built through
 * createItem, so the reticle law stamps meta.reticle here and now.
 * rarity/source ride in meta for the profile's display.
 */
export function weaponItemFor(weapon, source) {
  if (!weapon) return null;
  return createItem({
    id: weapon.id,
    kind: 'weapon',
    name: weapon.name,
    meta: {
      weaponClass: weapon.weaponClass,
      damage: weapon.damage,
      rarity: weapon.rarity,
      reticle: { style: forgeWeaponReticle(weapon) },
      source: typeof source === 'string' && source ? source : 'weapons-forge',
    },
  });
}

/**
 * A backpack weapon entry for a weapon known only by name (Earth 2
 * gifts arrive as names). Catalogue names resolve to their full
 * entry; an unknown name still becomes a weapon — class 'blade',
 * the law stamps its dot reticle — because a gift must never
 * evaporate for want of a catalogue row.
 */
export function weaponItemForName(name, source) {
  const known = forgeWeaponByName(name);
  if (known) return weaponItemFor(known, source);
  return createItem({
    id: `weapon-${String(name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
    kind: 'weapon',
    name: String(name || 'Unknown weapon'),
    meta: { weaponClass: 'blade', source: typeof source === 'string' && source ? source : 'gift' },
  });
}

// ── Materials ────────────────────────────────────────────────────

/** The forge's material stock in a record: fossil specimens held
 *  (count) and blood sacs held (the stack's qty). */
export function forgeMaterialStock(record) {
  const rec = sanitizeBackpackRecord(record);
  const fossils = rec.items.filter((e) => e.meta && e.meta.fossil).length;
  return { fossils, bloodSacs: countItem(rec, 'blood-sac') };
}

function materialHeld(record, material) {
  const stock = forgeMaterialStock(record);
  return material.item === 'fossil' ? stock.fossils : stock.bloodSacs;
}

/**
 * Can this record pay this weapon's costs at this bar balance?
 * Returns { ok, bars, missing: [{ item|'bars', need, held }] } —
 * the full shortfall list, so the forge page can say exactly what
 * is lacking instead of a bare "no".
 */
export function forgeAffordability(record, weapon, bars) {
  const rec = sanitizeBackpackRecord(record);
  const barBalance = Math.max(0, Math.floor(Number(bars) || 0));
  const missing = [];
  if (!weapon) return { ok: false, bars: barBalance, missing: [{ item: 'weapon', need: 1, held: 0 }] };
  if (weapon.cost.bars > barBalance) {
    missing.push({ item: 'bars', need: weapon.cost.bars, held: barBalance });
  }
  for (const m of weapon.cost.materials) {
    const held = materialHeld(rec, m);
    if (held < m.qty) missing.push({ item: m.item, need: m.qty, held });
  }
  return { ok: missing.length === 0, bars: barBalance, missing };
}

/**
 * Pay a weapon's materials out of a record and shelve the forged
 * weapon. PURE — the bar debit is the route's work (the refinery
 * save is the bars ledger); this returns barsDue so the caller can
 * settle it. Fossils leave lowest-goldValue first. Returns
 * { ok, record, barsDue } or { ok: false, record (unchanged),
 * barsDue: 0, missing } when the materials are not held.
 */
export function applyForgeToRecord(record, weapon, idemKey) {
  const rec = sanitizeBackpackRecord(record);
  if (!weapon) return { ok: false, record: rec, barsDue: 0, missing: [{ item: 'weapon', need: 1, held: 0 }] };
  const afford = forgeAffordability(rec, weapon, Number.POSITIVE_INFINITY);
  if (!afford.ok) return { ok: false, record: rec, barsDue: 0, missing: afford.missing };

  let next = rec;
  for (const m of weapon.cost.materials) {
    if (m.item === 'fossil') {
      const specimens = next.items
        .filter((e) => e.meta && e.meta.fossil)
        .sort((a, b) => (a.meta.fossil.goldValue || 0) - (b.meta.fossil.goldValue || 0))
        .slice(0, m.qty);
      for (const s of specimens) next = removeEntry(next, s.uid);
    } else {
      next = removeItem(next, m.item, m.qty);
    }
  }
  const item = weaponItemFor(weapon, 'weapons-forge');
  next = { ...next, items: [...next.items, item] };
  if (typeof idemKey === 'string' && idemKey && !next.forgeKeys.includes(idemKey)) {
    next = { ...next, forgeKeys: [idemKey, ...next.forgeKeys].slice(0, 24) };
  }
  return { ok: true, record: next, barsDue: weapon.cost.bars };
}
