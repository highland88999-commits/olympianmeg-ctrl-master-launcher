// lib/portal/gun.js — THE PORTAL GUN (Merlin, Nov 13, 2026).
//
// Earned at 10 portals entered. It goes into the user's BACKPACK
// (a weapon entry, so the reticle law applies — createItem stamps
// the firearm default, a crosshair) and is usable from anywhere
// the backpack lives: the profile pack and every realm's pack panel.
//
// Firing it opens a realm portal that uses BOTH heaven and hell
// lighting colours as a gradient-style effect and SUCKS the user
// into place inside it. Inside the realm it opens, the traveller
// finds the SAME horizontal scrolling holographic portal system
// as the upper and lower portals. It grants access to ALL realms
// on demand — including the Heaven realms before the Heaven portal
// itself is unlocked: the gun is the reward for the journey, not
// another lock.
//
// Pure: record in, new record out (backpack.js helpers do the work).

import { addItem, countItem, sanitizeBackpackRecord } from '../backpack/backpack.js';
import { portalGunEarned } from './progress.js';

export const PORTAL_GUN_ID = 'portal-gun';

/**
 * The opening line of the forged gun's prompt (the canonical
 * forge prompt, lib/world-engine/datasheets/weapons.js
 * PORTAL_GUN_FORGE_PROMPT). A Portal Gun forged through the forge
 * used to land in the pack as a generic timestamp-id weapon, so
 * its description — not its id — is what identifies it for the
 * one-time heal below. The award gun's description opens
 * differently ("Opens a realm portal anywhere …"), so the heal
 * never touches a gun the journey already granted.
 */
export const FORGED_PORTAL_GUN_OPENING = 'A portal gun, not a bullet gun.';

/** The gun as a backpack item input (createItem enforces the reticle law). */
export const PORTAL_GUN_ITEM = {
  kind: 'weapon',
  id: PORTAL_GUN_ID,
  name: 'Portal Gun',
  meta: {
    weaponClass: 'firearm',
    damage: 0,
    source: 'portal-system',
    description: 'Opens a realm portal anywhere — heaven light and hell fire, one gradient. Earned at 10 portals.',
  },
};

/** True when the backpack already holds the gun. */
export function hasPortalGun(backpackRecord) {
  return countItem(backpackRecord, PORTAL_GUN_ID) > 0;
}

/**
 * Grant the gun when earned and not yet held. Returns a NEW backpack
 * record — unchanged (same reference) when nothing is earned or the
 * gun is already held, so repeated calls never duplicate it.
 */
export function maybeAwardPortalGun(backpackRecord, progressRecord) {
  if (!portalGunEarned(progressRecord)) return backpackRecord;
  if (hasPortalGun(backpackRecord)) return backpackRecord;
  return addItem(backpackRecord, PORTAL_GUN_ITEM);
}

// ── Healing a forged gun ─────────────────────────────────────────
//
// A Portal Gun forged through the forge (before the mint learned
// the gun's identity from the canonical prompt) sits in the pack
// as a generic weapon with a timestamp id — the card stays on the
// "3 / 10 portals entered" branch even though its owner holds the
// gun. The heal re-ids that entry to 'portal-gun', in place: same
// uid (so an equipped gun stays equipped), same meta, nothing else
// touched. One-time and idempotent — once the id is 'portal-gun'
// (or the gun was already held), the record comes back unchanged,
// same reference, so the card's catch-up effect no-ops.

/** Index of the forged-gun entry in a sanitized item list, or -1. */
function forgedPortalGunIndex(items) {
  return items.findIndex((e) => (
    e && e.kind === 'weapon'
    && e.id !== PORTAL_GUN_ID
    && e.name === 'Portal Gun'
    && typeof e.meta?.description === 'string'
    && e.meta.description.startsWith(FORGED_PORTAL_GUN_OPENING)
  ));
}

/** True when the pack holds a forged Portal Gun still waiting to be healed. */
export function hasForgedPortalGunEntry(backpackRecord) {
  const rec = sanitizeBackpackRecord(backpackRecord);
  return forgedPortalGunIndex(rec.items) >= 0;
}

/**
 * Re-id a forged Portal Gun entry to 'portal-gun'. Returns the
 * record unchanged (same reference) when the gun is already held
 * under its real id — never a second gun — or when no forged gun
 * is in the pack.
 */
export function healForgedPortalGun(backpackRecord) {
  if (hasPortalGun(backpackRecord)) return backpackRecord;
  const rec = sanitizeBackpackRecord(backpackRecord);
  const idx = forgedPortalGunIndex(rec.items);
  if (idx < 0) return backpackRecord;
  const items = rec.items.slice();
  items[idx] = { ...items[idx], id: PORTAL_GUN_ID };
  return { ...rec, items };
}
