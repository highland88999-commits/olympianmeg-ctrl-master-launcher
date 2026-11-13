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

import { addItem, countItem } from '../backpack/backpack.js';
import { portalGunEarned } from './progress.js';

export const PORTAL_GUN_ID = 'portal-gun';

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
