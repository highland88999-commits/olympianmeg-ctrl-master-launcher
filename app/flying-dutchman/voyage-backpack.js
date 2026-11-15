// GHOST VOYAGE BACKPACK — the Flying Dutchman's durable store.
//
// SEPARATE from the shared realm backpack (lib/backpack): no imports
// from it, no shared state. The backpack is the durable store across
// voyages; the per-voyage captain (world.captain) is the live copy.
// Pure logic + try/catch-guarded localStorage only, so node tests can
// import this module with no DOM at all.

export const VOYAGE_BACKPACK_KEY = 'ghost-voyage-backpack-v1';

export function makeVoyageBackpack() {
  return {
    souls: 0,
    megaSouls: 0,
    items: [],
    skinsOwned: ['dutchman'],
    shipsOwned: ['dutchman'],
  };
}

function isBackpack(v) {
  return v && typeof v === 'object' &&
    typeof v.souls === 'number' && typeof v.megaSouls === 'number' &&
    Array.isArray(v.items) && Array.isArray(v.skinsOwned) && Array.isArray(v.shipsOwned);
}

/** Load the stored backpack, or a fresh one when storage is absent/corrupt. */
export function loadVoyageBackpack() {
  try {
    if (typeof localStorage === 'undefined') return makeVoyageBackpack();
    const raw = localStorage.getItem(VOYAGE_BACKPACK_KEY);
    if (!raw) return makeVoyageBackpack();
    const parsed = JSON.parse(raw);
    if (!isBackpack(parsed)) return makeVoyageBackpack();
    return {
      souls: parsed.souls,
      megaSouls: parsed.megaSouls,
      items: parsed.items,
      skinsOwned: parsed.skinsOwned.length ? parsed.skinsOwned : ['dutchman'],
      shipsOwned: parsed.shipsOwned.length ? parsed.shipsOwned : ['dutchman'],
    };
  } catch {
    return makeVoyageBackpack();
  }
}

/** Persist the backpack. Returns true on success, false when storage fails. */
export function saveVoyageBackpack(bp) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(VOYAGE_BACKPACK_KEY, JSON.stringify(bp));
    return true;
  } catch {
    return false;
  }
}

/** Add an item to the backpack. Returns the added item. */
export function addItem(bp, item) {
  bp.items.push(item);
  return item;
}

/** Remove an item by id. Returns true when something was removed. */
export function removeItem(bp, itemId) {
  const i = bp.items.findIndex((it) => it.id === itemId);
  if (i < 0) return false;
  bp.items.splice(i, 1);
  return true;
}

/** Find an item by id, or null. */
export function findItem(bp, itemId) {
  return bp.items.find((it) => it.id === itemId) || null;
}

/** Copy the durable backpack state into the live per-voyage captain. */
export function syncCaptainFromBackpack(captain, bp) {
  captain.souls = bp.souls;
  captain.megaSouls = bp.megaSouls;
  captain.skinsOwned = [...bp.skinsOwned];
  captain.shipsOwned = [...bp.shipsOwned];
  return captain;
}

/** Copy the live captain state back into the durable backpack. */
export function syncBackpackFromCaptain(bp, captain) {
  bp.souls = captain.souls;
  bp.megaSouls = captain.megaSouls;
  if (Array.isArray(captain.skinsOwned)) bp.skinsOwned = [...captain.skinsOwned];
  if (Array.isArray(captain.shipsOwned)) bp.shipsOwned = [...captain.shipsOwned];
  return bp;
}
